/* ============================================================
 * 进件质量督导工作台 · 静态网页版核心（浏览器端"迷你后端"）
 * 数据持久化：localStorage（key: wb_csw_store）
 * 与 Node 版 server.js 的 API 语义保持一致，前端无需改逻辑。
 * 本文件通过 WorkBuddy 生成：无任何外部依赖。
 * ============================================================ */
'use strict';

// ---------- 初始化数据（首次打开自动载入用户真实组织快照） ----------
var INITIAL_DATA = {"branches":[{"id":"b69033ad-43be-4d33-81a0-e30dd8dfa432","name":"消费金融一部","code":"消费金融"},{"id":"816833a1-9439-4cc5-8911-ec78cfc9b5ec","name":"消费金融五部","code":"消费金融"},{"id":"aea02341-489e-4258-acff-027bc3276c2a","name":"消费金融四部","code":"消费金融"},{"id":"a572c90e-620d-4f80-81d2-a8dd785f40ac","name":"消费金融十一部","code":"消费金融"},{"id":"d6f6eab0-b62a-4e41-a0fe-ea9968e9ccfc","name":"消费金融十三部","code":"消费金融"},{"id":"4b67042b-bd17-4d93-afb1-9ca0cdcfed0b","name":"消费金融十七部","code":"消费金融"},{"id":"aceed3b8-166e-4290-85de-7a9d1b42ea44","name":"消费金融十六部","code":"消费金融"},{"id":"27a2d404-c537-4514-95ef-4a0c1243cc31","name":"消费金融十二部","code":"消费金融"},{"id":"99825377-0ab4-4ba2-ad45-dd96750c4bfc","name":"消费金融三部","code":"消费金融"},{"id":"d4eae21f-24e3-43da-8fad-7b6558f1c699","name":"消费金融六部","code":"消费金融"},{"id":"b043d282-8212-4036-b082-0e1f3838d678","name":"消费金融二部","code":"消费金融"}],"teams":[{"id":"c33c10fc-bb14-4cbc-97ba-9417e6eb4b24","name":"一部渠道业务二部","branchId":"b69033ad-43be-4d33-81a0-e30dd8dfa432"},{"id":"109130ec-e9ee-42d2-b4d7-e12319fab625","name":"一部渠道业务三部","branchId":"b69033ad-43be-4d33-81a0-e30dd8dfa432"},{"id":"78d7db17-a55b-4f31-8988-b45f4e1ff3bc","name":"阜阳团队","branchId":"b69033ad-43be-4d33-81a0-e30dd8dfa432"},{"id":"6e05270a-b104-47ff-a348-85f17efa5f2c","name":"石家庄团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"7b079ab9-105a-40ca-8405-1e417d4c335d","name":"廊坊团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"b9343e3c-c469-4a81-9baa-b9a55a8f7770","name":"沧州团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"39741224-8114-4418-bedc-225478405732","name":"邯郸团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"e47fcf40-8981-44f5-a23b-64023bd25e69","name":"邢台团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"e790627e-5747-42d9-879a-422f55205fb6","name":"保定团队","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"id":"b2a1af22-8d29-46d0-b1b0-ce6a9e81bc94","name":"泉州团队","branchId":"aea02341-489e-4258-acff-027bc3276c2a"},{"id":"193a7f77-f5f9-4c48-a208-a9a4639aece1","name":"福州团队","branchId":"aea02341-489e-4258-acff-027bc3276c2a"},{"id":"9b51fa5a-f279-4651-a610-657f50d67757","name":"漳州团队","branchId":"aea02341-489e-4258-acff-027bc3276c2a"},{"id":"d5c8c8bf-c54e-47d2-aa10-504329765084","name":"武汉团队","branchId":"a572c90e-620d-4f80-81d2-a8dd785f40ac"},{"id":"cbd69009-f781-4bc6-b512-2a4f78998ca0","name":"汕头团队","branchId":"d6f6eab0-b62a-4e41-a0fe-ea9968e9ccfc"},{"id":"9396d6fc-c268-4090-861c-ff6bb86bd243","name":"青岛团队","branchId":"4b67042b-bd17-4d93-afb1-9ca0cdcfed0b"},{"id":"e81092bd-3541-4d31-92c9-70fb3e5f4a42","name":"十六部渠道业务部","branchId":"aceed3b8-166e-4290-85de-7a9d1b42ea44"},{"id":"80b791d3-0795-48ad-8f37-9e96f7de0c5f","name":"南通团队","branchId":"aceed3b8-166e-4290-85de-7a9d1b42ea44"},{"id":"1033f028-1049-4bce-853a-0b184080f18b","name":"成都团队","branchId":"27a2d404-c537-4514-95ef-4a0c1243cc31"},{"id":"1d68a531-4d69-4287-964c-c8de4732044e","name":"重庆团队","branchId":"27a2d404-c537-4514-95ef-4a0c1243cc31"},{"id":"98e464e8-28a8-4b70-b36c-1a9ba654115a","name":"长沙团队","branchId":"99825377-0ab4-4ba2-ad45-dd96750c4bfc"},{"id":"896d06b8-5268-4146-9e7e-f219316543df","name":"商丘团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"eed95b8a-0810-4c1a-b8c2-27070e6161e9","name":"南阳团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"bb392ae2-2d1a-4730-b056-70cafbf7b319","name":"郑州团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"828184f0-6705-423b-95d6-8531d391006a","name":"洛阳团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"5ffe8b93-da43-4540-aa84-abcbebf1bce5","name":"许昌团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"6223b797-0dda-463e-bdac-584789a37107","name":"安阳团队","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"id":"af6f233f-10e9-4cb0-be38-fdfcf7e41b35","name":"东莞团队","branchId":"b043d282-8212-4036-b082-0e1f3838d678"},{"id":"9c4edee5-ddee-4c42-ba3c-351cfc19c67f","name":"惠州团队","branchId":"b043d282-8212-4036-b082-0e1f3838d678"},{"id":"0c300f54-dc67-42f1-8980-e9361d2b4244","name":"广州团队","branchId":"b043d282-8212-4036-b082-0e1f3838d678"},{"id":"ca1da6e8-9d2b-4708-8ca3-6a8ba5d80c50","name":"中山团队","branchId":"b043d282-8212-4036-b082-0e1f3838d678"},{"id":"6e256ad2-43b5-4cfa-87d1-fbcdee15b4b0","name":"佛山团队","branchId":"b043d282-8212-4036-b082-0e1f3838d678"}],"employees":[],"supervisors":[{"id":"f2f97695-2cc4-49c2-955b-7175838d7715","name":"邬文颖"},{"id":"3b8da665-9578-4d3b-8838-5be08260243a","name":"杨超群"},{"id":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","name":"许超鼎"},{"id":"d439e6c2-8ff2-4bba-98a8-ec88e4564044","name":"吴舒芸"}],"branchSupervisors":[{"supervisorId":"f2f97695-2cc4-49c2-955b-7175838d7715","branchId":"b69033ad-43be-4d33-81a0-e30dd8dfa432"},{"supervisorId":"3b8da665-9578-4d3b-8838-5be08260243a","branchId":"816833a1-9439-4cc5-8911-ec78cfc9b5ec"},{"supervisorId":"f2f97695-2cc4-49c2-955b-7175838d7715","branchId":"aea02341-489e-4258-acff-027bc3276c2a"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"a572c90e-620d-4f80-81d2-a8dd785f40ac"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"d6f6eab0-b62a-4e41-a0fe-ea9968e9ccfc"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"4b67042b-bd17-4d93-afb1-9ca0cdcfed0b"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"aceed3b8-166e-4290-85de-7a9d1b42ea44"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"27a2d404-c537-4514-95ef-4a0c1243cc31"},{"supervisorId":"7c552e4c-312c-42ec-82bf-3351c2a81cf0","branchId":"99825377-0ab4-4ba2-ad45-dd96750c4bfc"},{"supervisorId":"d439e6c2-8ff2-4bba-98a8-ec88e4564044","branchId":"d4eae21f-24e3-43da-8fad-7b6558f1c699"},{"supervisorId":"f2f97695-2cc4-49c2-955b-7175838d7715","branchId":"b043d282-8212-4036-b082-0e1f3838d678"}],"weeklyData":[],"actionTemplates":[{"id":"831fc32e-393b-4e3d-a351-fea8047fa31c","name":"电话督导","level":"team","defaultContent":"致电团队主管，复盘补件原因，3日内反馈整改。"},{"id":"1c3f29ca-d967-4422-bc9a-93333cadb024","name":"现场巡检","level":"branch","defaultContent":"赴分部现场抽检进件档案，输出巡检报告。"},{"id":"1964725b-1aff-4836-b3c9-04a958a62bf3","name":"一对一辅导","level":"person","defaultContent":"对高补件个人进行一对一作业辅导。"}],"actions":[]};

// ---------- 持久化 ----------
var KEY = 'wb_csw_store';
function emptyStore() {
  return { branches: [], teams: [], employees: [], supervisors: [],
           branchSupervisors: [], weeklyData: [], actionTemplates: [], actions: [] };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 空间不足等 */ }
}
function loadStore() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { var o = JSON.parse(raw); return Object.assign(emptyStore(), o); }
  } catch (e) {}
  return clone(INITIAL_DATA);
}
var store = loadStore();

// ---------- 工具 ----------
function uid() {
  try { return crypto.randomUUID(); }
  catch (e) {
    try {
      var c = crypto.getRandomValues(new Uint8Array(16));
      var h = ''; for (var i = 0; i < c.length; i++) h += c[i].toString(16).padStart(2, '0');
      return h;
    } catch (e2) { return 'id' + Date.now() + Math.floor(Math.random() * 1e6); }
  }
}
function nowISO() { return new Date().toISOString(); }
function toMonday(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return toMonday(new Date().toISOString());
  var day = d.getDay();
  var diff = (day === 0 ? -6 : 1 - day);
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

// ---------- CSV 解析（支持引号包裹） ----------
function parseCSV(text) {
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
}

// ---------- Excel(.xlsx) 解析（浏览器端：DecompressionStream 解压 zip） ----------
function bytesToStr(u8) {
  try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return String.fromCharCode.apply(null, u8); }
}
function inflateRaw(bytes) {
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
}
function base64ToBytes(b64) {
  var bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function findEOCD(buf) { for (var i = buf.length - 22; i >= 0; i--) if (readU32(buf, i) === 0x06054b50) return i; return -1; }
function readU16(buf, p) { return (buf[p] | (buf[p + 1] << 8)) >>> 0; }
function readU32(buf, p) { return ((buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24))) >>> 0; }
function unzip(buf) {
  var eocd = findEOCD(buf);
  if (eocd < 0) return [];
  var cdOffset = readU32(buf, eocd + 16), cdCount = readU16(buf, eocd + 10);
  var files = [], p = cdOffset;
  for (var i = 0; i < cdCount; i++) {
    if (readU32(buf, p) !== 0x02014b50) break;
    var method = readU16(buf, p + 10), compSize = readU32(buf, p + 20);
    var fnLen = readU16(buf, p + 28), exLen = readU16(buf, p + 30), cmLen = readU16(buf, p + 32);
    var localOff = readU32(buf, p + 42);
    var name = bytesToStr(buf.subarray(p + 46, p + 46 + fnLen));
    var lfnLen = readU16(buf, localOff + 26), lexLen = readU16(buf, localOff + 28);
    var dataStart = localOff + 30 + lfnLen + lexLen;
    var data = buf.slice(dataStart, dataStart + compSize);
    files.push({ name: name, data: data, method: method });
    p += 46 + fnLen + exLen + cmLen;
  }
  return files;
}
function parseSharedStrings(text) {
  var out = [], re = /<si>([\s\S]*?)<\/si>/g, m;
  while ((m = re.exec(text))) {
    var tm = /<t[^>]*>([\s\S]*?)<\/t>/g, s = '', x;
    while ((x = tm.exec(m[1]))) s += x[1];
    out.push(s);
  }
  return out;
}
function colToIndex(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
function parseRowsFromSheetXml(xml, shared) {
  var rows = [], rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
  while ((rm = rowRe.exec(xml))) {
    var rowXml = rm[1], cells = {}, cellRe = /<c([^>]*)>([\s\S]*?)<\/c>/g, cm;
    while ((cm = cellRe.exec(rowXml))) {
      var attrs = cm[1], body = cm[2];
      var refM = /r="([A-Z]+)(\d+)"/.exec(attrs); if (!refM) continue;
      var col = colToIndex(refM[1]);
      var typeM = /t="([^"]+)"/.exec(attrs); var val = '';
      if (typeM && typeM[1] === 's') { var vM = />(\d+)<\/v>/.exec(body); if (vM) val = shared[parseInt(vM[1], 10)] || ''; }
      else if (typeM && typeM[1] === 'inlineStr') { var tM = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body); val = tM ? tM[1] : ''; }
      else { var vM2 = />([\s\S]*?)<\/v>/.exec(body); val = vM2 ? vM2[1] : ''; }
      cells[col] = val;
    }
    var cols = Object.keys(cells).map(Number);
    var maxCol = cols.length ? Math.max.apply(null, cols) : -1;
    var arr = []; for (var c = 0; c <= maxCol; c++) arr[c] = cells[c] || '';
    rows.push(arr);
  }
  return rows;
}
function parseXLSX(buf) {
  var files = unzip(buf);
  var sheetFile = null, ssFile = null;
  files.forEach(function (f) {
    if (/worksheets\/sheet1\.xml$/.test(f.name)) sheetFile = f;
    if (/sharedStrings\.xml$/.test(f.name)) ssFile = f;
  });
  if (!sheetFile) {
    files.forEach(function (f) { if (/worksheets\/sheet\d*\.xml$/.test(f.name) && !sheetFile) sheetFile = f; });
  }
  if (!sheetFile) return Promise.resolve([]);
  var tasks = [];
  var need = [sheetFile];
  if (ssFile) need.push(ssFile);
  need.forEach(function (f) {
    if (f.method === 8) tasks.push(inflateRaw(f.data).then(function (d) { f.data = d; }));
    else if (f.method !== 0) tasks.push(Promise.reject(new Error('不支持的压缩方式 ' + f.method)));
  });
  return Promise.all(tasks).then(function () {
    var shared = ssFile ? parseSharedStrings(bytesToStr(ssFile.data)) : [];
    return parseRowsFromSheetXml(bytesToStr(sheetFile.data), shared);
  });
}

// ---------- 组织：查找与确保 ----------
function findBranchByName(name) { return store.branches.find(function (b) { return b.name === name; }); }
function findTeamByName(branchId, name) { return store.teams.find(function (t) { return t.branchId === branchId && t.name === name; }); }
function findEmployeeByName(teamId, name) { return store.employees.find(function (e) { return e.teamId === teamId && e.name === name; }); }
function ensureBranch(name) {
  var b = findBranchByName(name);
  if (!b) { b = { id: uid(), name: name, code: name.slice(0, 4).toUpperCase() }; store.branches.push(b); }
  return b;
}
function ensureTeam(branchId, name) {
  var t = findTeamByName(branchId, name);
  if (!t) { t = { id: uid(), name: name, branchId: branchId }; store.teams.push(t); }
  return t;
}
function ensureEmployee(teamId, branchId, name) {
  var e = findEmployeeByName(teamId, name);
  if (!e) { e = { id: uid(), name: name, teamId: teamId, branchId: branchId }; store.employees.push(e); }
  return e;
}
function ensureSupervisor(name) {
  var s = store.supervisors.find(function (x) { return x.name === name; });
  if (!s) { s = { id: uid(), name: name }; store.supervisors.push(s); }
  return s;
}
function resolveTarget(level, targetId) {
  if (level === 'branch') { var b = store.branches.find(function (x) { return x.id === targetId; }); return b ? { branchId: b.id, teamId: null, personId: null } : null; }
  if (level === 'team') { var t = store.teams.find(function (x) { return x.id === targetId; }); return t ? { branchId: t.branchId, teamId: t.id, personId: null } : null; }
  if (level === 'person') { var p = store.employees.find(function (x) { return x.id === targetId; }); return p ? { branchId: p.branchId, teamId: p.teamId, personId: p.id } : null; }
  return null;
}

// ---------- 聚合（与 server.js 一致） ----------
function aggregate(week) {
  var wd = store.weeklyData.filter(function (w) { return w.week === week; });
  var byPerson = {}, byTeam = {}, byBranch = {};
  wd.filter(function (w) { return w.level === 'person'; }).forEach(function (w) {
    byPerson[w.personId] = byPerson[w.personId] || { caseCount: 0, supplementCount: 0 };
    byPerson[w.personId].caseCount += w.caseCount;
    byPerson[w.personId].supplementCount += w.supplementCount;
  });
  store.teams.forEach(function (t) {
    var c = 0, s = 0;
    Object.keys(byPerson).forEach(function (pid) {
      var emp = store.employees.find(function (e) { return e.id === pid; });
      if (emp && emp.teamId === t.id) { c += byPerson[pid].caseCount; s += byPerson[pid].supplementCount; }
    });
    wd.filter(function (w) { return w.level === 'team' && w.teamId === t.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byTeam[t.id] = { caseCount: c, supplementCount: s };
  });
  store.branches.forEach(function (b) {
    var c = 0, s = 0;
    store.teams.filter(function (t) { return t.branchId === b.id; }).forEach(function (t) {
      var agg = byTeam[t.id]; if (agg) { c += agg.caseCount; s += agg.supplementCount; }
    });
    wd.filter(function (w) { return w.level === 'branch' && w.branchId === b.id; }).forEach(function (w) { c += w.caseCount; s += w.supplementCount; });
    byBranch[b.id] = { caseCount: c, supplementCount: s };
  });
  var persons = Object.keys(byPerson).map(function (pid) {
    var e = store.employees.find(function (x) { return x.id === pid; });
    var t = e ? store.teams.find(function (x) { return x.id === e.teamId; }) : null;
    var b = e ? store.branches.find(function (x) { return x.id === e.branchId; }) : null;
    return { personId: pid, person: e ? e.name : '?', team: t ? t.name : '?', branch: b ? b.name : '?',
             caseCount: byPerson[pid].caseCount, supplementCount: byPerson[pid].supplementCount,
             rate: rate(byPerson[pid].caseCount, byPerson[pid].supplementCount) };
  });
  var teams = store.teams.map(function (t) {
    var b = store.branches.find(function (x) { return x.id === t.branchId; });
    var agg = byTeam[t.id] || { caseCount: 0, supplementCount: 0 };
    var sups = store.branchSupervisors.filter(function (bs) { return bs.branchId === t.branchId; })
      .map(function (bs) { var s = store.supervisors.find(function (x) { return x.id === bs.supervisorId; }); return s ? s.name : null; }).filter(Boolean);
    return { teamId: t.id, team: t.name, branch: b ? b.name : '?', branchId: t.branchId,
             caseCount: agg.caseCount, supplementCount: agg.supplementCount,
             rate: rate(agg.caseCount, agg.supplementCount), supervisors: sups };
  }).sort(function (a, b2) { return b2.rate - a.rate; });
  var branches = store.branches.map(function (b) {
    var agg = byBranch[b.id] || { caseCount: 0, supplementCount: 0 };
    return { branchId: b.id, branch: b.name, caseCount: agg.caseCount, supplementCount: agg.supplementCount, rate: rate(agg.caseCount, agg.supplementCount) };
  });
  var totalC = wd.reduce(function (s, w) { return s + w.caseCount; }, 0);
  var totalS = wd.reduce(function (s, w) { return s + w.supplementCount; }, 0);
  return { week: week, teams: teams, branches: branches, persons: persons,
           summary: { caseCount: totalC, supplementCount: totalS, rate: rate(totalC, totalS), teamCount: teams.length } };
}

// ---------- 示例数据（与 server.js seedDemo 一致） ----------
function seedDemo() {
  store = emptyStore();
  var b1 = { id: uid(), name: '上海分部', code: 'SH' };
  var b2 = { id: uid(), name: '北京分部', code: 'BJ' };
  store.branches.push(b1, b2);
  var t1 = { id: uid(), name: '上海一组', branchId: b1.id };
  var t2 = { id: uid(), name: '上海二组', branchId: b1.id };
  var t3 = { id: uid(), name: '北京一组', branchId: b2.id };
  store.teams.push(t1, t2, t3);
  var e1 = { id: uid(), name: '王伟', teamId: t1.id, branchId: b1.id };
  var e2 = { id: uid(), name: '赵敏', teamId: t2.id, branchId: b1.id };
  var e3 = { id: uid(), name: '李娜', teamId: t3.id, branchId: b2.id };
  store.employees.push(e1, e2, e3);
  var s1 = { id: uid(), name: '陈督导' };
  var s2 = { id: uid(), name: '周督导' };
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
  store.actions.push({
    id: uid(), week: wk, launcherId: 'leader', targetLevel: 'team', targetId: t2.id, branchId: b1.id, teamId: t2.id, personId: null,
    templateId: store.actionTemplates[0].id, content: '上海二组补件率偏高，需复盘进件初审口径。', responsiblePerson: '陈督导',
    status: '执行', createdAt: nowISO(), updatedAt: nowISO()
  });
  persist();
}

// ---------- 本地"路由"：模拟 Node 版 API（返回 {status,data}） ----------
function R(method, path, fn) { return { method: method, parts: path.split('/').filter(Boolean), fn: fn }; }
var ROUTES = [
  R('GET', '/api/state', function () {
    return { status: 200, data: { branches: store.branches, teams: store.teams, employees: store.employees,
             supervisors: store.supervisors, branchSupervisors: store.branchSupervisors,
             actionTemplates: store.actionTemplates, weeks: weekList() } };
  }),
  R('POST', '/api/import', function (params, qs, b) {
    var week = toMonday(b.week);
    var rows = parseCSV(b.text || '');
    if (!rows.length) return { status: 400, data: { error: '空数据' } };
    var header = rows[0].map(function (h) { return h.trim(); });
    var idx = function (name) { return header.indexOf(name); };
    var iB = idx('branch'), iT = idx('team'), iP = idx('person'), iC = idx('caseCount'), iS = idx('supplementCount');
    if (iB < 0 || iT < 0 || iC < 0 || iS < 0) return { status: 400, data: { error: '表头需含 branch,team,person,caseCount,supplementCount' } };
    var imported = 0, created = { branches: 0, teams: 0, employees: 0 };
    for (var r = 1; r < rows.length; r++) {
      var c = rows[r];
      var branchName = (c[iB] || '').trim(), teamName = (c[iT] || '').trim(), personName = (c[iP] || '').trim();
      var caseCount = parseInt(c[iC], 10), supplementCount = parseInt(c[iS], 10);
      if (!branchName || !teamName || isNaN(caseCount) || isNaN(supplementCount)) continue;
      var beforeB = store.branches.length, beforeT = store.teams.length, beforeE = store.employees.length;
      var bObj = ensureBranch(branchName), tObj = ensureTeam(bObj.id, teamName);
      if (personName) ensureEmployee(tObj.id, bObj.id, personName);
      if (store.branches.length > beforeB) created.branches++;
      if (store.teams.length > beforeT) created.teams++;
      if (store.employees.length > beforeE) created.employees++;
      var level = personName ? 'person' : 'team';
      var personId = personName ? ensureEmployee(tObj.id, bObj.id, personName).id : null;
      store.weeklyData = store.weeklyData.filter(function (w) {
        return !(w.week === week && w.level === level && w.branchId === bObj.id && w.teamId === tObj.id && w.personId === personId);
      });
      store.weeklyData.push({ id: uid(), week: week, level: level, branchId: bObj.id, teamId: tObj.id, personId: personId,
        caseCount: caseCount, supplementCount: supplementCount, supplementRate: rate(caseCount, supplementCount) });
      imported++;
    }
    persist();
    return { status: 200, data: { ok: true, week: week, imported: imported, created: created } };
  }),
  R('POST', '/api/import-org', function (params, qs, b) {
    if (!b.data) return { status: 400, data: { error: '缺少文件数据' } };
    var name = (b.filename || '').toLowerCase();
    var task;
    if (name.endsWith('.csv')) { task = Promise.resolve(parseCSV(bytesToStr(base64ToBytes(b.data)))); }
    else {
      try { task = parseXLSX(base64ToBytes(b.data)); }
      catch (e) { return { status: 400, data: { error: '文件解析失败: ' + e.message } }; }
    }
    return task.then(function (rows) {
      if (!rows || !rows.length) return { status: 400, data: { error: '空数据' } };
      if (b.clear) {
        store.branches = []; store.teams = []; store.employees = [];
        store.supervisors = []; store.branchSupervisors = [];
        store.weeklyData = []; store.actions = [];
      }
      var header = rows[0].map(function (h) { return String(h).trim(); });
      var idx = function (kw) { var f = header.findIndex(function (h) { return h.indexOf(kw) >= 0; }); return f; };
      var iB = idx('分部'), iT = idx('团队'), iS = idx('督导');
      if (iB < 0 || iT < 0 || iS < 0) { iB = 0; iT = 1; iS = 2; }
      var created = { branches: 0, teams: 0, supervisors: 0, relations: 0 };
      for (var r = 1; r < rows.length; r++) {
        var c = rows[r];
        var branchName = String(c[iB] || '').trim(), teamName = String(c[iT] || '').trim(), supRaw = String(c[iS] || '').trim();
        if (!branchName || !teamName || !supRaw) continue;
        var beforeB = store.branches.length, beforeT = store.teams.length;
        var br = ensureBranch(branchName), tm = ensureTeam(br.id, teamName);
        if (store.branches.length > beforeB) created.branches++;
        if (store.teams.length > beforeT) created.teams++;
        supRaw.split(/[、，,\/]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (sn) {
          var before = store.supervisors.length;
          var sp = ensureSupervisor(sn);
          if (store.supervisors.length > before) created.supervisors++;
          var exist = store.branchSupervisors.find(function (x) { return x.supervisorId === sp.id && x.branchId === br.id; });
          if (!exist) { store.branchSupervisors.push({ supervisorId: sp.id, branchId: br.id }); created.relations++; }
        });
      }
      persist();
      return { status: 200, data: { ok: true, rows: rows.length - 1, cleared: !!b.clear, created: created } };
    }).catch(function (e) { return { status: 400, data: { error: '文件解析失败: ' + e.message } }; });
  }),
  R('GET', '/api/aggregate', function (params, qs) {
    var week = qs.has('week') ? toMonday(qs.get('week')) : (weekList()[0] || toMonday(new Date()));
    return { status: 200, data: aggregate(week) };
  }),
  R('POST', '/api/branches', function (params, qs, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    if (findBranchByName(b.name)) return { status: 409, data: { error: '分部已存在' } };
    var rec = { id: uid(), name: b.name, code: b.code || b.name.slice(0, 4).toUpperCase() };
    store.branches.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('POST', '/api/teams', function (params, qs, b) {
    if (!b.name || !b.branchId) return { status: 400, data: { error: 'name,branchId required' } };
    var rec = { id: uid(), name: b.name, branchId: b.branchId };
    store.teams.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('POST', '/api/employees', function (params, qs, b) {
    if (!b.name || !b.teamId) return { status: 400, data: { error: 'name,teamId required' } };
    var t = store.teams.find(function (x) { return x.id === b.teamId; });
    if (!t) return { status: 400, data: { error: 'team not found' } };
    var rec = { id: uid(), name: b.name, teamId: b.teamId, branchId: t.branchId };
    store.employees.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('POST', '/api/supervisors', function (params, qs, b) {
    if (!b.name) return { status: 400, data: { error: 'name required' } };
    var rec = { id: uid(), name: b.name };
    store.supervisors.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('POST', '/api/branch-supervisors', function (params, qs, b) {
    if (!b.supervisorId || !b.branchId) return { status: 400, data: { error: 'supervisorId,branchId required' } };
    var exist = store.branchSupervisors.find(function (x) { return x.supervisorId === b.supervisorId && x.branchId === b.branchId; });
    if (exist) return { status: 200, data: exist };
    var rec = { supervisorId: b.supervisorId, branchId: b.branchId };
    store.branchSupervisors.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('DELETE', '/api/branch-supervisors', function (params, qs, b) {
    store.branchSupervisors = store.branchSupervisors.filter(function (x) { return !(x.supervisorId === b.supervisorId && x.branchId === b.branchId); });
    persist();
    return { status: 200, data: { ok: true } };
  }),
  R('GET', '/api/action-templates', function () { return { status: 200, data: store.actionTemplates }; }),
  R('POST', '/api/action-templates', function (params, qs, b) {
    if (!b.name || !b.level) return { status: 400, data: { error: 'name,level required' } };
    var rec = { id: uid(), name: b.name, level: b.level, defaultContent: b.defaultContent || '' };
    store.actionTemplates.push(rec); persist();
    return { status: 201, data: rec };
  }),
  R('GET', '/api/actions', function (params, qs) {
    var list = store.actions.slice();
    if (qs.has('week')) list = list.filter(function (a) { return a.week === toMonday(qs.get('week')); });
    if (qs.has('supervisorId')) {
      var scope = {};
      store.branchSupervisors.filter(function (bs) { return bs.supervisorId === qs.get('supervisorId'); })
        .forEach(function (bs) { scope[bs.branchId] = 1; });
      list = list.filter(function (a) { return scope[a.branchId]; });
    }
    list.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: list };
  }),
  R('POST', '/api/actions', function (params, qs, b) {
    if (!b.targetLevel || !b.targetId || !b.content || !b.responsiblePerson)
      return { status: 400, data: { error: 'targetLevel,targetId,content,responsiblePerson required' } };
    var tgt = resolveTarget(b.targetLevel, b.targetId);
    if (!tgt) return { status: 400, data: { error: '目标实体不存在' } };
    var rec = { id: uid(), week: toMonday(b.week), launcherId: b.launcherId || 'leader',
      targetLevel: b.targetLevel, targetId: b.targetId, branchId: tgt.branchId, teamId: tgt.teamId, personId: tgt.personId,
      templateId: b.templateId || null, content: b.content, responsiblePerson: b.responsiblePerson,
      status: '发起', createdAt: nowISO(), updatedAt: nowISO() };
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
      var teams = store.teams.filter(function (t) { return t.branchId === bid; }).map(function (t) { return t.name; });
      return { branchId: bid, branch: b ? b.name : '?', teams: teams };
    });
    var actions = store.actions.filter(function (a) { return a.week === week && scope.indexOf(a.branchId) >= 0; })
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    return { status: 200, data: { supervisor: sup, week: week, branches: branches, actions: actions } };
  }),
  R('POST', '/api/seed', function () { seedDemo(); return { status: 200, data: { ok: true } }; }),
  R('POST', '/api/reset', function () { store = emptyStore(); persist(); return { status: 200, data: { ok: true } }; })
];

// 供前端 api() 调用：method/path 与后端完全一致，返回数据或抛错
async function localApi(method, path, body) {
  var qi = path.indexOf('?');
  var pathname = qi >= 0 ? path.slice(0, qi) : path;
  var qs = new Map();
  if (qi >= 0) {
    try {
      new URLSearchParams(path.slice(qi + 1)).forEach(function (v, k) { qs.set(k, v); });
    } catch (e) {}
  }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { localApi: localApi, __getStore: function () { return store; },
                     __setStore: function (s) { store = s; persist(); }, __reset: function () { store = clone(INITIAL_DATA); persist(); } };
}
