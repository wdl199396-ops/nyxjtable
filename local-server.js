/* ============================================================
 * 进件质量督导工作台 · 云端协作版核心（Supabase + 角色分权）
 * 数据层：内存 store + localStorage 缓存 + Supabase 云端同步
 *   - 登录后按角色拉取（RLS 已保证：督导只看得到自己分部的数据行）
 *   - 每次变更差分写库；每 6 秒轮询合并他人改动并广播 wb:sync
 * 页面 API 语义与旧版完全一致（api(method, path, body)）
 * ============================================================ */
'use strict';

var KEY = 'wb_csw_store';
function emptyStore() {
  return { branches: [], teams: [], employees: [], supervisors: [],
           branchSupervisors: [], weeklyData: [], actionTemplates: [], actions: [] };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
var store = emptyStore();
var snap = clone(store);      // 上次与云端一致时的快照（用于差分）
var booted = null;            // ensureReady promise
window.wbProfile = null;      // {role, display_name, supervisor_id}
var pollTimer = null;

// 列映射 jsKey -> dbKey（双向自动生成）
var TABLES = {
  branches:          { m: { id: 'id', name: 'name', code: 'code' } },
  teams:             { m: { id: 'id', name: 'name', branchId: 'branch_id' } },
  employees:         { m: { id: 'id', name: 'name', teamId: 'team_id', branchId: 'branch_id' } },
  supervisors:       { m: { id: 'id', name: 'name' } },
  branchSupervisors: { m: { supervisorId: 'supervisor_id', branchId: 'branch_id' }, composite: true },
  weeklyData:        { m: { id: 'id', week: 'week', level: 'level', branchId: 'branch_id', teamId: 'team_id', personId: 'person_id', caseCount: 'case_count', supplementCount: 'supplement_count', supplementRate: 'supplement_rate' } },
  actionTemplates:   { m: { id: 'id', name: 'name', level: 'level', defaultContent: 'default_content' } },
  actions:           { m: { id: 'id', week: 'week', launcherId: 'launcher_id', targetLevel: 'target_level', targetId: 'target_id', branchId: 'branch_id', teamId: 'team_id', personId: 'person_id', templateId: 'template_id', content: 'content', responsiblePerson: 'responsible_person', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at' } }
};
var R2 = {}; // dbKey -> jsKey
Object.keys(TABLES).forEach(function (k) {
  R2[k] = {};
  var m = TABLES[k].m;
  Object.keys(m).forEach(function (j) { R2[k][m[j]] = j; });
});
function toDb(k, row) { var o = {}, m = TABLES[k].m; Object.keys(m).forEach(function (j) { o[m[j]] = row[j]; }); return o; }
function toJs(k, row) { var o = {}, r = R2[k]; Object.keys(r).forEach(function (d) { o[r[d]] = row[d]; }); return o; }
function idOf(k, row) { return TABLES[k].composite ? (row.supervisorId + '|' + row.branchId) : row.id; }

// ---------- 本地缓存 ----------
function cacheWrite() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
function cacheRead() {
  try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); return Object.assign(emptyStore(), o); } } catch (e) {}
  return null;
}

// ---------- 工具 ----------
function uid() {
  try { return crypto.randomUUID(); } catch (e) {
    try { var c = crypto.getRandomValues(new Uint8Array(16)), h = ''; for (var i = 0; i < c.length; i++) h += c[i].toString(16).padStart(2, '0'); return h; }
    catch (e2) { return 'id' + Date.now() + Math.floor(Math.random() * 1e6); }
  }
}
function nowISO() { return new Date().toISOString(); }
function toMonday(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return toMonday(new Date().toISOString());
  var diff = (d.getDay() === 0 ? -6 : 1 - d.getDay());
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function weekList() {
  var set = {};
  store.weeklyData.forEach(function (w) { set[w.week] = 1; });
  store.actions.forEach(function (a) { set[a.week] = 1; });
  return Object.keys(set).sort().reverse();
}
function rate(c, s) { return c > 0 ? +(s / c).toFixed(4) : 0; }

// ---------- CSV ----------
function parseCSV(text) {
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
}
// ---------- XLSX（浏览器 DecompressionStream） ----------
function bytesToStr(u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return String.fromCharCode.apply(null, u8); } }
function inflateRaw(bytes) {
  var ds = new DecompressionStream('deflate-raw');
  return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
}
function base64ToBytes(b64) { var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
function readU16(b, p) { return (b[p] | (b[p + 1] << 8)) >>> 0; }
function readU32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
function unzip(buf) {
  var eocd = -1;
  for (var i = buf.length - 22; i >= 0; i--) if (readU32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  var cdOffset = readU32(buf, eocd + 16), cdCount = readU16(buf, eocd + 10);
  var files = [], p = cdOffset;
  for (var n = 0; n < cdCount; n++) {
    if (readU32(buf, p) !== 0x02014b50) break;
    var method = readU16(buf, p + 10), compSize = readU32(buf, p + 20);
    var fnLen = readU16(buf, p + 28), exLen = readU16(buf, p + 30), cmLen = readU16(buf, p + 32);
    var localOff = readU32(buf, p + 42);
    var name = bytesToStr(buf.subarray(p + 46, p + 46 + fnLen));
    var ds2 = localOff + 30 + readU16(buf, localOff + 26) + readU16(buf, localOff + 28);
    files.push({ name: name, data: buf.slice(ds2, ds2 + compSize), method: method });
    p += 46 + fnLen + exLen + cmLen;
  }
  return files;
}
function parseSharedStrings(text) { var out = [], re = /<si>([\s\S]*?)<\/si>/g, m; while ((m = re.exec(text))) { var tm = /<t[^>]*>([\s\S]*?)<\/t>/g, s = '', x; while ((x = tm.exec(m[1]))) s += x[1]; out.push(s); } return out; }
function colToIndex(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
function parseXLSX(buf) {
  var files = unzip(buf), sheet = null, ssFile = null;
  files.forEach(function (f) {
    if (/worksheets\/sheet1\.xml$/.test(f.name)) sheet = f;
    if (/sharedStrings\.xml$/.test(f.name)) ssFile = f;
  });
  if (!sheet) files.forEach(function (f) { if (/worksheets\/sheet\d*\.xml$/.test(f.name) && !sheet) sheet = f; });
  if (!sheet) return Promise.resolve([]);
  var tasks = [], need = [sheet]; if (ssFile) need.push(ssFile);
  need.forEach(function (f) {
    if (f.method === 8) tasks.push(inflateRaw(f.data).then(function (d) { f.data = d; }));
    else if (f.method !== 0) tasks.push(Promise.reject(new Error('不支持的压缩方式 ' + f.method)));
  });
  return Promise.all(tasks).then(function () {
    var shared = ssFile ? parseSharedStrings(bytesToStr(ssFile.data)) : [];
    var xml = bytesToStr(sheet.data), rows = [], rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
    while ((rm = rowRe.exec(xml))) {
      var rowXml = rm[1], cells = {}, cellRe = /<c([^>]*)>([\s\S]*?)<\/c>/g, cm;
      while ((cm = cellRe.exec(rowXml))) {
        var attrs = cm[1], body = cm[2], refM = /r="([A-Z]+)(\d+)"/.exec(attrs); if (!refM) continue;
        var col = colToIndex(refM[1]), typeM = /t="([^"]+)"/.exec(attrs), val = '';
        if (typeM && typeM[1] === 's') { var vM = />(\d+)<\/v>/.exec(body); if (vM) val = shared[parseInt(vM[1], 10)] || ''; }
        else if (typeM && typeM[1] === 'inlineStr') { var tM = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body); val = tM ? tM[1] : ''; }
        else { var v2 = />([\s\S]*?)<\/v>/.exec(body); val = v2 ? v2[1] : ''; }
        cells[col] = val;
      }
      var cols = Object.keys(cells).map(Number), maxCol = cols.length ? Math.max.apply(null, cols) : -1, arr = [];
      for (var c = 0; c <= maxCol; c++) arr[c] = cells[c] || '';
      rows.push(arr);
    }
    return rows;
  });
}

// ---------- 组织查找/确保 ----------
function findBranchByName(n) { return store.branches.find(function (b) { return b.name === n; }); }
function findTeamByName(bid, n) { return store.teams.find(function (t) { return t.branchId === bid && t.name === n; }); }
function ensureBranch(n) { var b = findBranchByName(n); if (!b) { b = { id: uid(), name: n, code: n.slice(0, 4).toUpperCase() }; store.branches.push(b); } return b; }
function ensureTeam(bid, n) { var t = findTeamByName(bid, n); if (!t) { t = { id: uid(), name: n, branchId: bid }; store.teams.push(t); } return t; }
function ensureEmployee(tid, bid, n) { var e = store.employees.find(function (x) { return x.teamId === tid && x.name === n; }); if (!e) { e = { id: uid(), name: n, teamId: tid, branchId: bid }; store.employees.push(e); } return e; }
function ensureSupervisor(n) { var s = store.supervisors.find(function (x) { return x.name === n; }); if (!s) { s = { id: uid(), name: n }; store.supervisors.push(s); } return s; }
function resolveTarget(level, targetId) {
  if (level === 'branch') { var b = store.branches.find(function (x) { return x.id === targetId; }); return b ? { branchId: b.id, teamId: null, personId: null } : null; }
  if (level === 'team') { var t = store.teams.find(function (x) { return x.id === targetId; }); return t ? { branchId: t.branchId, teamId: t.id, personId: null } : null; }
  if (level === 'person') { var p = store.employees.find(function (x) { return x.id === targetId; }); return p ? { branchId: p.branchId, teamId: p.teamId, personId: p.id } : null; }
  return null;
}

// ---------- 聚合（与旧版一致） ----------
function aggregate(week) {
  var wd = store.weeklyData.filter(function (w) { return w.week === week; });
  var byPerson = {}, byTeam = {}, byBranch = {};
  wd.filter(function (w) { return w.level === 'person'; }).forEach(function (w) {
    byPerson[w.personId] = byPerson[w.personId] || { caseCount: 0, supplementCount: 0 };
    byPerson[w.personId].caseCount += w.caseCount; byPerson[w.personId].supplementCount += w.supplementCount;
  });
  store.teams.forEach(function (t) {
    var c = 0, s = 0;
    Object.keys(byPerson).forEach(function (pid) {
      var e = store.employees.find(function (x) { return x.id === pid; });
      if (e && e.teamId === t.id) { c += byPerson[pid].caseCount; s += byPerson[pid].supplementCount; }
    });
    wd.filter(function (w) { return w.level === 'team' && w.teamId === t.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byTeam[t.id] = { caseCount: c, supplementCount: s };
  });
  store.branches.forEach(function (b) {
    var c = 0, s = 0;
    store.teams.filter(function (t) { return t.branchId === b.id; }).forEach(function (t) { var a = byTeam[t.id]; if (a) { c += a.caseCount; s += a.supplementCount; } });
    wd.filter(function (w) { return w.level === 'branch' && w.branchId === b.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byBranch[b.id] = { caseCount: c, supplementCount: s };
  });
  var persons = Object.keys(byPerson).map(function (pid) {
    var e = store.employees.find(function (x) { return x.id === pid; });
    var t = e ? store.teams.find(function (x) { return x.id === e.teamId; }) : null;
    var b = e ? store.branches.find(function (x) { return x.id === e.branchId; }) : null;
    return { personId: pid, person: e ? e.name : '?', team: t ? t.name : '?', branch: b ? b.name : '?', caseCount: byPerson[pid].caseCount, supplementCount: byPerson[pid].supplementCount, rate: rate(byPerson[pid].caseCount, byPerson[pid].supplementCount) };
  });
  var teams = store.teams.map(function (t) {
    var b = store.branches.find(function (x) { return x.id === t.branchId; });
    var a = byTeam[t.id] || { caseCount: 0, supplementCount: 0 };
    var sups = store.branchSupervisors.filter(function (bs) { return bs.branchId === t.branchId; }).map(function (bs) { var s = store.supervisors.find(function (x) { return x.id === bs.supervisorId; }); return s ? s.name : null; }).filter(Boolean);
    return { teamId: t.id, team: t.name, branch: b ? b.name : '?', branchId: t.branchId, caseCount: a.caseCount, supplementCount: a.supplementCount, rate: rate(a.caseCount, a.supplementCount), supervisors: sups };
  }).sort(function (a, b2) { return b2.rate - a.rate; });
  var branches = store.branches.map(function (b) {
    var a = byBranch[b.id] || { caseCount: 0, supplementCount: 0 };
    return { branchId: b.id, branch: b.name, caseCount: a.caseCount, supplementCount: a.supplementCount, rate: rate(a.caseCount, a.supplementCount) };
  });
  var tc = wd.reduce(function (s, w) { return s + w.caseCount; }, 0);
  var ts = wd.reduce(function (s, w) { return s + w.supplementCount; }, 0);
  return { week: week, teams: teams, branches: branches, persons: persons, summary: { caseCount: tc, supplementCount: ts, rate: rate(tc, ts), teamCount: teams.length } };
}

// ---------- 示例数据（负责人「载入示例」用） ----------
function seedDemo() {
  store = emptyStore();
  var b1 = { id: uid(), name: '上海分部', code: 'SH' }, b2 = { id: uid(), name: '北京分部', code: 'BJ' };
  store.branches.push(b1, b2);
  var t1 = { id: uid(), name: '上海一组', branchId: b1.id }, t2 = { id: uid(), name: '上海二组', branchId: b1.id }, t3 = { id: uid(), name: '北京一组', branchId: b2.id };
  store.teams.push(t1, t2, t3);
  var e1 = { id: uid(), name: '王伟', teamId: t1.id, branchId: b1.id }, e2 = { id: uid(), name: '赵敏', teamId: t2.id, branchId: b1.id }, e3 = { id: uid(), name: '李娜', teamId: t3.id, branchId: b2.id };
  store.employees.push(e1, e2, e3);
  var s1 = { id: uid(), name: '陈督导' }, s2 = { id: uid(), name: '周督导' };
  store.supervisors.push(s1, s2);
  store.branchSupervisors.push({ supervisorId: s1.id, branchId: b1.id }, { supervisorId: s2.id, branchId: b2.id });
  var wk = toMonday('2026-09-01');
  store.weeklyData.push(
    { id: uid(), week: wk, level: 'person', branchId: b1.id, teamId: t1.id, personId: e1.id, caseCount: 120, supplementCount: 18, supplementRate: rate(120, 18) },
    { id: uid(), week: wk, level: 'person', branchId: b1.id, teamId: t2.id, personId: e2.id, caseCount: 90, supplementCount: 27, supplementRate: rate(90, 27) },
    { id: uid(), week: wk, level: 'person', branchId: b2.id, teamId: t3.id, personId: e3.id, caseCount: 150, supplementCount: 12, supplementRate: rate(150, 12) }
  );
  store.actionTemplates.push(
    { id: uid(), name: '电话督导', level: 'team', defaultContent: '致电团队主管，复盘补件原因，3日内反馈整改。' },
    { id: uid(), name: '现场巡检', level: 'branch', defaultContent: '赴分部现场抽检进件档案，输出巡检报告。' },
    { id: uid(), name: '一对一辅导', level: 'person', defaultContent: '对高补件个人进行一对一作业辅导。' }
  );
  store.actions.push({ id: uid(), week: wk, launcherId: 'leader', targetLevel: 'team', targetId: t2.id, branchId: b1.id, teamId: t2.id, personId: null, templateId: store.actionTemplates[0].id, content: '上海二组补件率偏高，需复盘进件初审口径。', responsiblePerson: '陈督导', status: '执行', createdAt: nowISO(), updatedAt: nowISO() });
}

// ============================================================
// 云端同步
// ============================================================
function hydrate() {
  var q = 'select=*&limit=5000';
  return Promise.all(Object.keys(TABLES).map(function (k) { return sb.select(k, q).then(function (rows) { store[k] = (rows || []).map(function (r) { return toJs(k, r); }); }); }))
    .then(function () { snap = clone(store); cacheWrite(); });
}
function fireSync() {
  try { window.dispatchEvent(new CustomEvent('wb:sync')); } catch (e) {}
}
var persistTimer = null, pushing = false, pendingPush = false;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(function () {
    persistTimer = null;
    if (pushing) { pendingPush = true; return; }
    doPush();
  }, 250);
}
function doPush() {
  pushing = true;
  var jobs = [];
  Object.keys(TABLES).forEach(function (k) {
    var ups = [], del = [];
    var cur = store[k], old = snap[k];
    var oldIds = {}, curIds = {};
    old.forEach(function (r) { oldIds[idOf(k, r)] = r; });
    cur.forEach(function (r) { curIds[idOf(k, r)] = r; if (!oldIds[idOf(k, r)] || JSON.stringify(oldIds[idOf(k, r)]) !== JSON.stringify(r)) ups.push(r); });
    old.forEach(function (r) { if (!curIds[idOf(k, r)]) del.push(r); });
    if (ups.length) jobs.push(sb.upsert(k, ups.map(function (r) { return toDb(k, r); })).catch(function (e) { console.error('[push]', k, e.message); throw e; }));
    if (del.length && !TABLES[k].composite) jobs.push(sb.remove(k, 'id=in.(' + del.map(function (r) { return r.id; }).join(',') + ')').catch(function (e) { console.error('[del]', k, e.message); throw e; }));
    if (del.length && TABLES[k].composite) jobs.push(sb.remove(k, 'supervisor_id=neq.00000000-0000-0000-0000-000000000000').catch(function () {})
      .then(function () { return sb.upsert(k, cur.map(function (r) { return toDb(k, r); })); }));
  });
  Promise.all(jobs).then(function () {
    snap = clone(store); cacheWrite(); pushing = false;
    if (pendingPush) { pendingPush = false; doPush(); }
  }).catch(function (e) {
    pushing = false;
    console.error('[sync]', e);
    try { window.dispatchEvent(new CustomEvent('wb:syncerr', { detail: e.message })); } catch (e2) {}
  });
}
function pull() { // 轮询：以云端为准合并（他人改动）→ 覆盖本地非冲突部分
  var q = 'select=*&limit=5000';
  return Promise.all(Object.keys(TABLES).map(function (k) { return sb.select(k, q).then(function (rows) { var js = (rows || []).map(function (r) { return toJs(k, r); }); if (JSON.stringify(js) !== JSON.stringify(store[k])) { store[k] = js; snap[k] = clone(js); cacheWrite(); } }); }))
    .then(fireSync).catch(function (e) { console.error('[pull]', e.message); });
}

// ---------- 登录/启动 ----------
function ensureReady() {
  if (booted) return booted;
  booted = (async function () {
    var s = sbSession.get();
    if (!s) { location.replace('login.html'); throw new Error('未登录'); }
    var prof = await sb.getProfile();
    if (!prof) { location.replace('login.html'); throw new Error('无账号资料'); }
    window.wbProfile = prof;
    var cached = cacheRead();
    if (cached) { store = cached; snap = clone(store); }
    try { await hydrate(); } catch (e) { /* 离线时用缓存继续 */ console.warn('[hydrate]', e.message); }
    if (!pollTimer) pollTimer = setInterval(function () { pull(); }, 6000);
    fireSync();
  })();
  return booted;
}
function resetReady() { booted = null; }
window.wbRefresh = function () { return hydrate().then(fireSync); };

// ============================================================
// 本地路由（语义与旧版一致）
// ============================================================
function R(method, path, fn) { return { method: method, parts: path.split('/').filter(Boolean), fn: fn }; }
var ROUTES = [
  R('GET', '/api/state', function () {
    return { status: 200, data: { branches: store.branches, teams: store.teams, employees: store.employees,
      supervisors: store.supervisors, branchSupervisors: store.branchSupervisors,
      actionTemplates: store.actionTemplates, weeks: weekList(), profile: window.wbProfile || null } };
  }),
  R('POST', '/api/import', function (params, qs, b) {
    var week = toMonday(b.week), rows = parseCSV(b.text || '');
    if (!rows.length) return { status: 400, data: { error: '空数据' } };
    var h = rows[0].map(function (x) { return x.trim(); });
    var ix = function (n) { return h.indexOf(n); };
    var iB = ix('branch'), iT = ix('team'), iP = ix('person'), iC = ix('caseCount'), iS = ix('supplementCount');
    if (iB < 0 || iT < 0 || iC < 0 || iS < 0) return { status: 400, data: { error: '表头需含 branch,team,person,caseCount,supplementCount' } };
    var imported = 0, created = { branches: 0, teams: 0, employees: 0 };
    for (var r = 1; r < rows.length; r++) {
      var c = rows[r];
      var bn = (c[iB] || '').trim(), tn = (c[iT] || '').trim(), pn = (c[iP] || '').trim();
      var cc = parseInt(c[iC], 10), sc = parseInt(c[iS], 10);
      if (!bn || !tn || isNaN(cc) || isNaN(sc)) continue;
      var bb = store.branches.length, bt = store.teams.length, be = store.employees.length;
      var bo = ensureBranch(bn), to = ensureTeam(bo.id, tn);
      if (pn) ensureEmployee(to.id, bo.id, pn);
      if (store.branches.length > bb) created.branches++;
      if (store.teams.length > bt) created.teams++;
      if (store.employees.length > be) created.employees++;
      var level = pn ? 'person' : 'team', pid = pn ? ensureEmployee(to.id, bo.id, pn).id : null;
      store.weeklyData = store.weeklyData.filter(function (w) { return !(w.week === week && w.level === level && w.branchId === bo.id && w.teamId === to.id && w.personId === pid); });
      store.weeklyData.push({ id: uid(), week: week, level: level, branchId: bo.id, teamId: to.id, personId: pid, caseCount: cc, supplementCount: sc, supplementRate: rate(cc, sc) });
      imported++;
    }
    persist();
    return { status: 200, data: { ok: true, week: week, imported: imported, created: created } };
  }),
  R('POST', '/api/import-org', function (params, qs, b) {
    if (!b.data) return { status: 400, data: { error: '缺少文件数据' } };
    var name = (b.filename || '').toLowerCase();
    var task = name.endsWith('.csv')
      ? Promise.resolve(parseCSV(bytesToStr(base64ToBytes(b.data))))
      : parseXLSX(base64ToBytes(b.data)).catch(function (e) { throw new Error('文件解析失败: ' + e.message); });
    return task.then(function (rows) {
      if (!rows || !rows.length) return { status: 400, data: { error: '空数据' } };
      if (b.clear) {
        store.branches = []; store.teams = []; store.employees = [];
        store.supervisors = []; store.branchSupervisors = [];
        store.weeklyData = []; store.actions = [];
      }
      var h = rows[0].map(function (x) { return String(x).trim(); });
      var ix = function (kw) { return h.findIndex(function (x) { return x.indexOf(kw) >= 0; }); };
      var iB = ix('分部'), iT = ix('团队'), iS = ix('督导');
      if (iB < 0 || iT < 0 || iS < 0) { iB = 0; iT = 1; iS = 2; }
      var created = { branches: 0, teams: 0, supervisors: 0, relations: 0 };
      for (var r = 1; r < rows.length; r++) {
        var c = rows[r], bn = String(c[iB] || '').trim(), tn = String(c[iT] || '').trim(), sr = String(c[iS] || '').trim();
        if (!bn || !tn || !sr) continue;
        var bb = store.branches.length, bt = store.teams.length;
        var bo = ensureBranch(bn), to = ensureTeam(bo.id, tn);
        if (store.branches.length > bb) created.branches++;
        if (store.teams.length > bt) created.teams++;
        sr.split(/[、，,\/]/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (sn) {
          var bs = store.supervisors.length, sp = ensureSupervisor(sn);
          if (store.supervisors.length > bs) created.supervisors++;
          if (!store.branchSupervisors.find(function (x) { return x.supervisorId === sp.id && x.branchId === bo.id; })) { store.branchSupervisors.push({ supervisorId: sp.id, branchId: bo.id }); created.relations++; }
        });
      }
      persist();
      return { status: 200, data: { ok: true, rows: rows.length - 1, cleared: !!b.clear, created: created } };
    }).catch(function (e) { return { status: 400, data: { error: e.message } }; });
  }),
  R('GET', '/api/aggregate', function (params, qs) {
    var week = qs.has('week') ? toMonday(qs.get('week')) : (weekList()[0] || toMonday(new Date()));
    return { status: 200, data: aggregate(week) };
  }),
  R('POST', '/api/branches', function (p, q, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    if (findBranchByName(b.name)) return { status: 409, data: { error: '分部已存在' } };
    var rec = { id: uid(), name: b.name, code: b.code || b.name.slice(0, 4).toUpperCase() };
    store.branches.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('POST', '/api/teams', function (p, q, b) {
    if (!b.name || !b.branchId) return { status: 400, data: { error: 'name,branchId required' } };
    var rec = { id: uid(), name: b.name, branchId: b.branchId };
    store.teams.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('POST', '/api/employees', function (p, q, b) {
    if (!b.name || !b.teamId) return { status: 400, data: { error: 'name,teamId required' } };
    var t = store.teams.find(function (x) { return x.id === b.teamId; });
    if (!t) return { status: 400, data: { error: 'team not found' } };
    var rec = { id: uid(), name: b.name, teamId: b.teamId, branchId: t.branchId };
    store.employees.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('POST', '/api/supervisors', function (p, q, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    var rec = { id: uid(), name: b.name };
    store.supervisors.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('POST', '/api/branch-supervisors', function (p, q, b) {
    if (!b.supervisorId || !b.branchId) return { status: 400, data: { error: 'supervisorId,branchId required' } };
    var ex = store.branchSupervisors.find(function (x) { return x.supervisorId === b.supervisorId && x.branchId === b.branchId; });
    if (ex) return { status: 200, data: ex };
    var rec = { supervisorId: b.supervisorId, branchId: b.branchId };
    store.branchSupervisors.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('DELETE', '/api/branch-supervisors', function (p, q, b) {
    store.branchSupervisors = store.branchSupervisors.filter(function (x) { return !(x.supervisorId === b.supervisorId && x.branchId === b.branchId); });
    persist(); return { status: 200, data: { ok: true } };
  }),
  R('GET', '/api/action-templates', function () { return { status: 200, data: store.actionTemplates }; }),
  R('POST', '/api/action-templates', function (p, q, b) {
    if (!b.name || !b.level) return { status: 400, data: { error: 'name,level required' } };
    var rec = { id: uid(), name: b.name, level: b.level, defaultContent: b.defaultContent || '' };
    store.actionTemplates.push(rec); persist(); return { status: 201, data: rec };
  }),
  R('GET', '/api/actions', function (params, qs) {
    var list = store.actions.slice();
    if (qs.has('week')) list = list.filter(function (a) { return a.week === toMonday(qs.get('week')); });
    if (qs.has('supervisorId')) { var sc = {}; store.branchSupervisors.filter(function (bs) { return bs.supervisorId === qs.get('supervisorId'); }).forEach(function (bs) { sc[bs.branchId] = 1; }); list = list.filter(function (a) { return sc[a.branchId]; }); }
    list.sort(function (a, b2) { return b2.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: list };
  }),
  R('POST', '/api/actions', function (p, q, b) {
    if (!b.targetLevel || !b.targetId || !b.content || !b.responsiblePerson) return { status: 400, data: { error: 'targetLevel,targetId,content,responsiblePerson required' } };
    var tgt = resolveTarget(b.targetLevel, b.targetId);
    if (!tgt) return { status: 400, data: { error: '目标实体不存在' } };
    var rec = { id: uid(), week: toMonday(b.week), launcherId: b.launcherId || 'leader', targetLevel: b.targetLevel, targetId: b.targetId, branchId: tgt.branchId, teamId: tgt.teamId, personId: tgt.personId, templateId: b.templateId || null, content: b.content, responsiblePerson: b.responsiblePerson, status: '发起', createdAt: nowISO(), updatedAt: nowISO() };
    store.actions.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('PATCH', '/api/actions/:id', function (params, qs, b) {
    var a = store.actions.find(function (x) { return x.id === params[0]; });
    if (!a) return { status: 404, data: { error: 'not found' } };
    if (b.status && ['发起', '执行', '完成'].indexOf(b.status) >= 0) a.status = b.status;
    if (b.responsiblePerson) a.responsiblePerson = b.responsiblePerson;
    if (b.content) a.content = b.content;
    a.updatedAt = nowISO(); persist();
    return { status: 200, data: a };
  }),
  R('GET', '/api/leader/kanban', function (params, qs) {
    var week = qs.has('week') ? toMonday(qs.get('week')) : (weekList()[0] || toMonday(new Date()));
    var list = store.actions.filter(function (a) { return a.week === week; });
    var cols = { '发起': [], '执行': [], '完成': [] };
    list.forEach(function (a) { (cols[a.status] || (cols[a.status] = [])).push(a); });
    return { status: 200, data: { week: week, columns: cols } };
  }),
  R('GET', '/api/supervisor/:id/dashboard', function (params, qs) {
    var week = qs.has('week') ? toMonday(qs.get('week')) : (weekList()[0] || toMonday(new Date()));
    var sup = store.supervisors.find(function (s) { return s.id === params[0]; });
    if (!sup) return { status: 404, data: { error: 'supervisor not found' } };
    var scope = store.branchSupervisors.filter(function (bs) { return bs.supervisorId === params[0]; }).map(function (bs) { return bs.branchId; });
    var branches = scope.map(function (bid) {
      var b = store.branches.find(function (x) { return x.id === bid; });
      return { branchId: bid, branch: b ? b.name : '?', teams: store.teams.filter(function (t) { return t.branchId === bid; }).map(function (t) { return t.name; }) };
    });
    var actions = store.actions.filter(function (a) { return a.week === week && scope.indexOf(a.branchId) >= 0; }).sort(function (a, b2) { return b2.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: { supervisor: sup, week: week, branches: branches, actions: actions } };
  }),
  R('GET', '/api/accounts', function () {
    if (wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可管理账号' } };
    return sb.select('profiles', 'select=*&limit=1000').then(function (rows) {
      return { status: 200, data: (rows || []).map(function (r) { return { id: r.id, email: r.email, role: r.role, displayName: r.display_name, supervisorId: r.supervisor_id }; }) };
    });
  }),
  R('POST', '/api/accounts', function (p, q, b) {
    if (wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可创建账号' } };
    if (!b.email || !b.password) return { status: 400, data: { error: '登录名和初始密码必填' } };
    return sb.signUp(b.email, b.password)
      .then(function (d) {
        var nid = d && d.user && d.user.id;
        if (!nid) throw new Error((d && (d.msg || d.message)) || '创建账号失败');
        return sb.upsert('profiles', [{ id: nid, email: b.email, role: 'supervisor', display_name: b.displayName || '', supervisor_id: b.supervisorId || null }]);
      })
      .then(function () { return { status: 201, data: { ok: true } }; })
      .catch(function (e) { return { status: 400, data: { error: '创建失败：' + e.message } }; });
  }),
  R('DELETE', '/api/accounts/:id', function (params) {
    if (wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可移除账号' } };
    return sb.remove('profiles', 'id=eq.' + params[0])
      .then(function () { return { status: 200, data: { ok: true } }; })
      .catch(function (e) { return { status: 400, data: { error: e.message } }; });
  }),
  R('POST', '/api/seed', function () { seedDemo(); persist(); return { status: 200, data: { ok: true } }; }),
  R('POST', '/api/reset', function () {
    store = emptyStore(); snap = clone(store);
    var jobs = Object.keys(TABLES).map(function (k) {
      return TABLES[k].composite
        ? sb.remove(k, 'supervisor_id=neq.00000000-0000-0000-0000-000000000000').catch(function () {})
        : sb.removeAll(k).catch(function () {});
    });
    return Promise.all(jobs).then(function () { cacheWrite(); return { status: 200, data: { ok: true } }; });
  })
];

async function localApi(method, path, body) {
  await ensureReady();
  var qi = path.indexOf('?');
  var pathname = qi >= 0 ? path.slice(0, qi) : path;
  var qs = new Map();
  if (qi >= 0) { try { new URLSearchParams(path.slice(qi + 1)).forEach(function (v, k) { qs.set(k, v); }); } catch (e) {} }
  var segs = pathname.split('/').filter(Boolean);
  for (var i = 0; i < ROUTES.length; i++) {
    var r = ROUTES[i];
    if (r.method !== method || r.parts.length !== segs.length) continue;
    var params = [], ok = true;
    for (var j = 0; j < r.parts.length; j++) {
      if (r.parts[j].charAt(0) === ':') params.push(decodeURIComponent(segs[j]));
      else if (r.parts[j] !== segs[j]) { ok = false; break; }
    }
    if (!ok) continue;
    var res;
    try { res = await r.fn(params, qs, body || {}); }
    catch (e) { res = { status: 500, data: { error: e.message } }; }
    if (res.status >= 400) throw new Error((res.data && res.data.error) || ('请求失败 ' + res.status));
    return res.data;
  }
  throw new Error('请求失败 404');
}
window.localApi = localApi;
window.wbSignOut = function () { return sb.signOut().then(function () { location.replace('login.html'); }); };
window.wbRole = function () { return window.wbProfile && window.wbProfile.role; };
