/* ============================================================
 * 进件质量督导工作台 · CloudBase 版数据引擎
 * 内存 store + localStorage 缓存 + 云函数(wb)差分同步
 *  - 登录后按会话拉取(pull)；改动差分推送(push)
 *  - 每 6 秒轮询 pull 合并他人改动，广播 wb:sync
 * 页面 API 语义与历史版本一致：api(method, path, body)
 * ============================================================ */
'use strict';

var KEY = 'wb_csw_store';
function emptyStore() {
  return { branches: [], teams: [], employees: [], supervisors: [], branchSupervisors: [],
           weeklyData: [], actionTemplates: [], actions: [] };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
var store = emptyStore();
var snap = clone(store);
var booted = null, pollTimer = null;
window.wbProfile = null;

// 列名转换 js<->db（db 为下划线）
var TABLES = {
  branches: { m: { id: 'id', name: 'name', code: 'code' } },
  teams: { m: { id: 'id', name: 'name', branchId: 'branch_id' } },
  employees: { m: { id: 'id', name: 'name', teamId: 'team_id', branchId: 'branch_id' } },
  supervisors: { m: { id: 'id', name: 'name' } },
  branchSupervisors: { m: { supervisorId: 'supervisor_id', branchId: 'branch_id' }, composite: true },
  weeklyData: { m: { id: 'id', week: 'week', level: 'level', branchId: 'branch_id', teamId: 'team_id', personId: 'person_id', caseCount: 'case_count', supplementCount: 'supplement_count', supplementRate: 'supplement_rate' } },
  actionTemplates: { m: { id: 'id', name: 'name', level: 'level', defaultContent: 'default_content' } },
  actions: { m: { id: 'id', week: 'week', launcherId: 'launcher_id', targetLevel: 'target_level', targetId: 'target_id', branchId: 'branch_id', teamId: 'team_id', personId: 'person_id', templateId: 'template_id', content: 'content', responsiblePerson: 'responsible_person', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at' } }
};
function dbRow(k, r) {
  var o = {}, m = TABLES[k].m;
  Object.keys(m).forEach(function (j) { o[m[j]] = r[j]; });
  if (TABLES[k].composite) o.id = 'bs|' + r.supervisorId + '|' + r.branchId;
  else o.id = r.id;
  return o;
}
function jsRow(k, d) {
  var o = {}, m = TABLES[k].m, rev = {};
  Object.keys(m).forEach(function (j) { rev[m[j]] = j; });
  Object.keys(rev).forEach(function (c) { o[rev[c]] = d[c]; });
  if (!TABLES[k].composite && !o.id) o.id = d.id;
  return o;
}
function bsId(r) { return 'bs|' + r.supervisorId + '|' + r.branchId; }
function keyOf(k, r) { return TABLES[k].composite ? bsId(r) : r.id; }

// ---------- 工具 ----------
function uid() {
  try { return crypto.randomUUID(); } catch (e) {
    try { var c = crypto.getRandomValues(new Uint8Array(16)), h = ''; for (var i = 0; i < 16; i++) h += c[i].toString(16).padStart(2, '0'); return h; }
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
  var s = {};
  store.weeklyData.forEach(function (w) { s[w.week] = 1; });
  store.actions.forEach(function (a) { s[a.week] = 1; });
  return Object.keys(s).sort().reverse();
}
function rate(c, s) { return c > 0 ? +(s / c).toFixed(4) : 0; }

// ---------- CSV / XLSX 解析（与历史版一致） ----------
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
function bytesToStr(u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return String.fromCharCode.apply(null, u8); } }
function inflateRaw(bytes) {
  var ds = new DecompressionStream('deflate-raw');
  return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
}
function base64ToBytes(b64) { var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
function r16(b, p) { return (b[p] | (b[p + 1] << 8)) >>> 0; }
function r32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
function unzip(buf) {
  var eocd = -1, i;
  for (i = buf.length - 22; i >= 0; i--) if (r32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  var files = [], p = r32(buf, eocd + 16), n, cnt = r16(buf, eocd + 10);
  for (n = 0; n < cnt; n++) {
    if (r32(buf, p) !== 0x02014b50) break;
    var method = r16(buf, p + 10), comp = r32(buf, p + 20), fnl = r16(buf, p + 28), exl = r16(buf, p + 30), cml = r16(buf, p + 32);
    var lo = r32(buf, p + 42), nm = bytesToStr(buf.subarray(p + 46, p + 46 + fnl));
    var ds2 = lo + 30 + r16(buf, lo + 26) + r16(buf, lo + 28);
    files.push({ name: nm, data: buf.slice(ds2, ds2 + comp), method: method });
    p += 46 + fnl + exl + cml;
  }
  return files;
}
function parseSharedStrings(t) { var out = [], re = /<si>([\s\S]*?)<\/si>/g, m; while ((m = re.exec(t))) { var r2 = /<t[^>]*>([\s\S]*?)<\/t>/g, s = '', x; while ((x = r2.exec(m[1]))) s += x[1]; out.push(s); } return out; }
function colToIndex(s) { var n = 0, k; for (k = 0; k < s.length; k++) n = n * 26 + (s.charCodeAt(k) - 64); return n; }
function parseXLSX(buf) {
  var files = unzip(buf), sheet = null, ss = null;
  files.forEach(function (f) { if (/worksheets\/sheet1\.xml$/.test(f.name)) sheet = f; if (/sharedStrings\.xml$/.test(f.name)) ss = f; });
  if (!sheet) files.forEach(function (f) { if (/worksheets\/sheet\d*\.xml$/.test(f.name) && !sheet) sheet = f; });
  if (!sheet) return Promise.resolve([]);
  var need = [sheet]; if (ss) need.push(ss);
  var tasks = [];
  need.forEach(function (f) {
    if (f.method === 8) tasks.push(inflateRaw(f.data).then(function (d) { f.data = d; }));
    else if (f.method !== 0) tasks.push(Promise.reject(new Error('压缩方式不支持 ' + f.method)));
  });
  return Promise.all(tasks).then(function () {
    var shared = ss ? parseSharedStrings(bytesToStr(ss.data)) : [];
    var xml = bytesToStr(sheet.data), rows = [], re = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
    while ((rm = re.exec(xml))) {
      var rx = rm[1], cells = {}, cr = /<c([^>]*)>([\s\S]*?)<\/c>/g, cm;
      while ((cm = cr.exec(rx))) {
        var at = cm[1], bd = cm[2], rf = /r="([A-Z]+)(\d+)"/.exec(at); if (!rf) continue;
        var col = colToIndex(rf[1]), tm = /t="([^"]+)"/.exec(at), val = '';
        if (tm && tm[1] === 's') { var vm = />(\d+)<\/v>/.exec(bd); if (vm) val = shared[parseInt(vm[1], 10)] || ''; }
        else if (tm && tm[1] === 'inlineStr') { var im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(bd); val = im ? im[1] : ''; }
        else { var vm2 = />([\s\S]*?)<\/v>/.exec(bd); val = vm2 ? vm2[1] : ''; }
        cells[col] = val;
      }
      var ks = Object.keys(cells).map(Number), mx = ks.length ? Math.max.apply(null, ks) : -1, arr = [], c2;
      for (c2 = 0; c2 <= mx; c2++) arr[c2] = cells[c2] || '';
      rows.push(arr);
    }
    return rows;
  });
}

// ---------- 组织查找 ----------
function findBranchByName(n) { return store.branches.find(function (b) { return b.name === n; }); }
function ensureBranch(n) { var b = findBranchByName(n); if (!b) { b = { id: uid(), name: n, code: n.slice(0, 4).toUpperCase() }; store.branches.push(b); } return b; }
function ensureTeam(bid, n) { var t = store.teams.find(function (x) { return x.branchId === bid && x.name === n; }); if (!t) { t = { id: uid(), name: n, branchId: bid }; store.teams.push(t); } return t; }
function ensureEmployee(tid, bid, n) { var e = store.employees.find(function (x) { return x.teamId === tid && x.name === n; }); if (!e) { e = { id: uid(), name: n, teamId: tid, branchId: bid }; store.employees.push(e); } return e; }
function ensureSupervisor(n) { var s = store.supervisors.find(function (x) { return x.name === n; }); if (!s) { s = { id: uid(), name: n }; store.supervisors.push(s); } return s; }
function resolveTarget(lv, id) {
  if (lv === 'branch') { var b = store.branches.find(function (x) { return x.id === id; }); return b ? { branchId: b.id, teamId: null, personId: null } : null; }
  if (lv === 'team') { var t = store.teams.find(function (x) { return x.id === id; }); return t ? { branchId: t.branchId, teamId: t.id, personId: null } : null; }
  if (lv === 'person') { var p = store.employees.find(function (x) { return x.id === id; }); return p ? { branchId: p.branchId, teamId: p.teamId, personId: p.id } : null; }
  return null;
}

// ---------- 聚合 ----------
function aggregate(week) {
  var wd = store.weeklyData.filter(function (w) { return w.week === week; });
  var byP = {}, byT = {}, byB = {};
  wd.filter(function (w) { return w.level === 'person'; }).forEach(function (w) {
    byP[w.personId] = byP[w.personId] || { c: 0, s: 0 };
    byP[w.personId].c += w.caseCount; byP[w.personId].s += w.supplementCount;
  });
  store.teams.forEach(function (t) {
    var c = 0, s = 0;
    Object.keys(byP).forEach(function (pid) {
      var e = store.employees.find(function (x) { return x.id === pid; });
      if (e && e.teamId === t.id) { c += byP[pid].c; s += byP[pid].s; }
    });
    wd.filter(function (w) { return w.level === 'team' && w.teamId === t.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byT[t.id] = { c: c, s: s };
  });
  store.branches.forEach(function (b) {
    var c = 0, s = 0;
    store.teams.filter(function (t) { return t.branchId === b.id; }).forEach(function (t) { var a = byT[t.id]; if (a) { c += a.c; s += a.s; } });
    wd.filter(function (w) { return w.level === 'branch' && w.branchId === b.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byB[b.id] = { c: c, s: s };
  });
  var persons = Object.keys(byP).map(function (pid) {
    var e = store.employees.find(function (x) { return x.id === pid; }), t = e ? store.teams.find(function (x) { return x.id === e.teamId; }) : null, b = e ? store.branches.find(function (x) { return x.id === e.branchId; }) : null;
    return { personId: pid, person: e ? e.name : '?', team: t ? t.name : '?', branch: b ? b.name : '?', caseCount: byP[pid].c, supplementCount: byP[pid].s, rate: rate(byP[pid].c, byP[pid].s) };
  });
  var teams = store.teams.map(function (t) {
    var b = store.branches.find(function (x) { return x.id === t.branchId; }), a = byT[t.id] || { c: 0, s: 0 };
    var sups = store.branchSupervisors.filter(function (bs) { return bs.branchId === t.branchId; }).map(function (bs) { var s = store.supervisors.find(function (x) { return x.id === bs.supervisorId; }); return s ? s.name : null; }).filter(Boolean);
    return { teamId: t.id, team: t.name, branch: b ? b.name : '?', branchId: t.branchId, caseCount: a.c, supplementCount: a.s, rate: rate(a.c, a.s), supervisors: sups };
  }).sort(function (x, y) { return y.rate - x.rate; });
  var branches = store.branches.map(function (b) { var a = byB[b.id] || { c: 0, s: 0 }; return { branchId: b.id, branch: b.name, caseCount: a.c, supplementCount: a.s, rate: rate(a.c, a.s) }; });
  var tc = wd.reduce(function (s, w) { return s + w.caseCount; }, 0), ts = wd.reduce(function (s, w) { return s + w.supplementCount; }, 0);
  return { week: week, teams: teams, branches: branches, persons: persons, summary: { caseCount: tc, supplementCount: ts, rate: rate(tc, ts), teamCount: teams.length } };
}

// ---------- 云同步 ----------
function cacheW() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
function cacheR() { try { var r = localStorage.getItem(KEY); if (r) return Object.assign(emptyStore(), JSON.parse(r)); } catch (e) {} return null; }
function pullAll() {
  return window.wbApi({ op: 'pull', wantAccounts: false }).then(function (d) {
    Object.keys(store).forEach(function (k) {
      if (d && d[k]) store[k] = (Array.isArray(d[k]) ? d[k] : []).map(function (x) { return jsRow(k, x); });
    });
    snap = clone(store); cacheW();
  });
}
function pushDeltas() {
  var cols = {};
  Object.keys(store).forEach(function (k) {
    var ups = [], dels = [], cur = store[k], old = snap[k], oid = {}, cid = {};
    old.forEach(function (r) { oid[keyOf(k, r)] = 1; });
    cur.forEach(function (r) {
      cid[keyOf(k, r)] = 1;
      var prev = old.find(function (x) { return keyOf(k, x) === keyOf(k, r); });
      if (!prev || JSON.stringify(prev) !== JSON.stringify(r)) ups.push(dbRow(k, r));
    });
    old.forEach(function (r) { if (!cid[keyOf(k, r)]) dels.push(keyOf(k, r)); });
    if (ups.length || dels.length) cols[k] = { upserts: ups, deletes: dels };
  });
  if (!Object.keys(cols).length) return Promise.resolve();
  return window.wbApi({ op: 'push', cols: cols }).then(function () { snap = clone(store); cacheW(); });
}
var pt = null, pushing = false, pend = false;
function persist() {
  if (pt) return;
  pt = setTimeout(function () {
    pt = null;
    if (pushing) { pend = true; return; }
    pushing = true;
    pushDeltas().catch(function (e) { console.error('[push]', e); try { window.dispatchEvent(new CustomEvent('wb:syncerr', { detail: e.message })); } catch (x) {} })
      .then(function () { pushing = false; if (pend) { pend = false; persist(); } });
  }, 300);
}
function startPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(function () {
    pullAll().catch(function () {}).then(function () { try { window.dispatchEvent(new CustomEvent('wb:sync')); } catch (e) {} });
  }, 6000);
}
function fire() { try { window.dispatchEvent(new CustomEvent('wb:sync')); } catch (e) {} }

// ---------- 启动 ----------
function ensureReady() {
  if (booted) return booted;
  booted = window.wbApi({ op: 'me' }).then(function () {
    var s = window.wbSession();
    window.wbProfile = s.user || null;
    var c = cacheR(); if (c) { store = c; snap = clone(c); }
    return pullAll().catch(function () {}).then(function () { startPoll(); fire(); });
  }).catch(function (e) {
    if (e && e.code === 401) { location.replace('login.html'); throw e; }
    return Promise.reject(e);
  });
  return booted;
}
window.wbSignOut = function () { return window.wbLogout().then(function () { location.replace('login.html'); }); };
window.wbRole = function () { return window.wbProfile && window.wbProfile.role; };

// ---------- 路由（语义与历史版一致） ----------
function R(m, p, fn) { return { method: m, parts: p.split('/').filter(Boolean), fn: fn }; }
var ROUTES = [
  R('GET', '/api/state', function () {
    return { status: 200, data: { branches: store.branches, teams: store.teams, employees: store.employees, supervisors: store.supervisors, branchSupervisors: store.branchSupervisors, actionTemplates: store.actionTemplates, weeks: weekList(), profile: window.wbProfile || null } };
  }),
  R('POST', '/api/import', function (p, q, b) {
    var week = toMonday(b.week), rows = parseCSV(b.text || '');
    if (!rows.length) return { status: 400, data: { error: '空数据' } };
    var h = rows[0].map(function (x) { return x.trim(); }), ix = function (n) { return h.indexOf(n); };
    var iB = ix('branch'), iT = ix('team'), iP = ix('person'), iC = ix('caseCount'), iS = ix('supplementCount');
    if (iB < 0 || iT < 0 || iC < 0 || iS < 0) return { status: 400, data: { error: '表头需含 branch,team,person,caseCount,supplementCount' } };
    var imported = 0, created = { branches: 0, teams: 0, employees: 0 };
    for (var r = 1; r < rows.length; r++) {
      var c = rows[r], bn = (c[iB] || '').trim(), tn = (c[iT] || '').trim(), pn = (c[iP] || '').trim();
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
  R('POST', '/api/import-org', function (p, q, b) {
    if (!b.data) return { status: 400, data: { error: '缺少文件数据' } };
    var nm = (b.filename || '').toLowerCase();
    var task = nm.endsWith('.csv') ? Promise.resolve(parseCSV(bytesToStr(base64ToBytes(b.data)))) : parseXLSX(base64ToBytes(b.data)).catch(function (e) { throw new Error('文件解析失败: ' + e.message); });
    return task.then(function (rows) {
      if (!rows || !rows.length) return { status: 400, data: { error: '空数据' } };
      if (b.clear) { store.branches = []; store.teams = []; store.employees = []; store.supervisors = []; store.branchSupervisors = []; store.weeklyData = []; store.actions = []; }
      var h = rows[0].map(function (x) { return String(x).trim(); }), ix = function (kw) { return h.findIndex(function (x) { return x.indexOf(kw) >= 0; }); };
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
  R('GET', '/api/aggregate', function (p, q) {
    var week = q.has('week') ? toMonday(q.get('week')) : (weekList()[0] || toMonday(new Date()));
    return { status: 200, data: aggregate(week) };
  }),
  R('POST', '/api/branches', function (p, q, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    if (findBranchByName(b.name)) return { status: 409, data: { error: '分部已存在' } };
    store.branches.push({ id: uid(), name: b.name, code: b.code || b.name.slice(0, 4).toUpperCase() }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('POST', '/api/teams', function (p, q, b) {
    if (!b.name || !b.branchId) return { status: 400, data: { error: 'name,branchId required' } };
    store.teams.push({ id: uid(), name: b.name, branchId: b.branchId }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('POST', '/api/employees', function (p, q, b) {
    if (!b.name || !b.teamId) return { status: 400, data: { error: 'name,teamId required' } };
    var t = store.teams.find(function (x) { return x.id === b.teamId; }); if (!t) return { status: 400, data: { error: 'team not found' } };
    store.employees.push({ id: uid(), name: b.name, teamId: b.teamId, branchId: t.branchId }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('POST', '/api/supervisors', function (p, q, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    store.supervisors.push({ id: uid(), name: b.name }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('POST', '/api/branch-supervisors', function (p, q, b) {
    if (!b.supervisorId || !b.branchId) return { status: 400, data: { error: 'supervisorId,branchId required' } };
    var ex = store.branchSupervisors.find(function (x) { return x.supervisorId === b.supervisorId && x.branchId === b.branchId; });
    if (ex) return { status: 200, data: ex };
    store.branchSupervisors.push({ supervisorId: b.supervisorId, branchId: b.branchId }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('DELETE', '/api/branch-supervisors', function (p, q, b) {
    store.branchSupervisors = store.branchSupervisors.filter(function (x) { return !(x.supervisorId === b.supervisorId && x.branchId === b.branchId); }); persist();
    return { status: 200, data: { ok: true } };
  }),
  R('GET', '/api/action-templates', function () { return { status: 200, data: store.actionTemplates }; }),
  R('POST', '/api/action-templates', function (p, q, b) {
    if (!b.name || !b.level) return { status: 400, data: { error: 'name,level required' } };
    store.actionTemplates.push({ id: uid(), name: b.name, level: b.level, defaultContent: b.defaultContent || '' }); persist();
    return { status: 201, data: { ok: true } };
  }),
  R('GET', '/api/actions', function (p, q) {
    var list = store.actions.slice();
    if (q.has('week')) list = list.filter(function (a) { return a.week === toMonday(q.get('week')); });
    if (q.has('supervisorId')) { var sc = {}; store.branchSupervisors.filter(function (bs) { return bs.supervisorId === q.get('supervisorId'); }).forEach(function (bs) { sc[bs.branchId] = 1; }); list = list.filter(function (a) { return sc[a.branchId]; }); }
    list.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: list };
  }),
  R('POST', '/api/actions', function (p, q, b) {
    if (!b.targetLevel || !b.targetId || !b.content || !b.responsiblePerson) return { status: 400, data: { error: 'targetLevel,targetId,content,responsiblePerson required' } };
    var tgt = resolveTarget(b.targetLevel, b.targetId); if (!tgt) return { status: 400, data: { error: '目标实体不存在' } };
    var rec = { id: uid(), week: toMonday(b.week), launcherId: b.launcherId || 'leader', targetLevel: b.targetLevel, targetId: b.targetId, branchId: tgt.branchId, teamId: tgt.teamId, personId: tgt.personId, templateId: b.templateId || null, content: b.content, responsiblePerson: b.responsiblePerson, status: '发起', createdAt: nowISO(), updatedAt: nowISO() };
    store.actions.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('PATCH', '/api/actions/:id', function (params, q, b) {
    var a = store.actions.find(function (x) { return x.id === params[0]; });
    if (!a) return { status: 404, data: { error: 'not found' } };
    if (b.status && ['发起', '执行', '完成'].indexOf(b.status) >= 0) a.status = b.status;
    if (b.responsiblePerson) a.responsiblePerson = b.responsiblePerson;
    if (b.content) a.content = b.content;
    a.updatedAt = nowISO(); persist();
    return { status: 200, data: a };
  }),
  R('GET', '/api/leader/kanban', function (p, q) {
    var week = q.has('week') ? toMonday(q.get('week')) : (weekList()[0] || toMonday(new Date()));
    var list = store.actions.filter(function (a) { return a.week === week; });
    var cols = { '发起': [], '执行': [], '完成': [] };
    list.forEach(function (a) { (cols[a.status] || (cols[a.status] = [])).push(a); });
    return { status: 200, data: { week: week, columns: cols } };
  }),
  R('GET', '/api/supervisor/:id/dashboard', function (params, q) {
    var week = q.has('week') ? toMonday(q.get('week')) : (weekList()[0] || toMonday(new Date()));
    var sup = store.supervisors.find(function (s) { return s.id === params[0]; });
    if (!sup) return { status: 404, data: { error: 'supervisor not found' } };
    var scope = store.branchSupervisors.filter(function (bs) { return bs.supervisorId === params[0]; }).map(function (bs) { return bs.branchId; });
    var branches = scope.map(function (bid) { var b = store.branches.find(function (x) { return x.id === bid; }); return { branchId: bid, branch: b ? b.name : '?', teams: store.teams.filter(function (t) { return t.branchId === bid; }).map(function (t) { return t.name; }) }; });
    var actions = store.actions.filter(function (a) { return a.week === week && scope.indexOf(a.branchId) >= 0; }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: { supervisor: sup, week: week, branches: branches, actions: actions } };
  }),
  R('GET', '/api/accounts', function () {
    if (window.wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可管理账号' } };
    return window.wbApi({ op: 'listAccounts' }).then(function (rows) {
      return { status: 200, data: rows || [] };
    });
  }),
  R('POST', '/api/accounts', function (p, q, b) {
    if (window.wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可创建账号' } };
    return window.wbApi({ op: 'createAccount', email: b.email, password: b.password, displayName: b.displayName, supervisorId: b.supervisorId || null })
      .then(function () { return { status: 201, data: { ok: true } }; })
      .catch(function (e) { return { status: 400, data: { error: '创建失败：' + e.message } }; });
  }),
  R('DELETE', '/api/accounts/:id', function (params) {
    if (window.wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可移除账号' } };
    return window.wbApi({ op: 'removeAccount', id: params[0] })
      .then(function () { return { status: 200, data: { ok: true } }; })
      .catch(function (e) { return { status: 400, data: { error: e.message } }; });
  }),
  R('POST', '/api/seed', function () {
    if (window.wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可载入示例' } };
    seedDemo(); persist(); return { status: 200, data: { ok: true } };
  }),
  R('POST', '/api/reset', function () {
    if (window.wbRole() !== 'leader') return { status: 403, data: { error: '仅负责人可清空' } };
    store = emptyStore(); persist(); return { status: 200, data: { ok: true } };
  })
];

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

async function localApi(method, path, body) {
  await ensureReady();
  var qi = path.indexOf('?'), pathname = qi >= 0 ? path.slice(0, qi) : path, qs = new Map();
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
    if (res && res.status >= 400) throw new Error((res.data && res.data.error) || ('请求失败 ' + res.status));
    return res.data;
  }
  throw new Error('请求失败 404');
}
window.localApi = localApi;
