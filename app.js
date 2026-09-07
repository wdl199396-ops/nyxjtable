'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let STATE = { branches: [], teams: [], employees: [], supervisors: [], branchSupervisors: [], actionTemplates: [], weeks: [] };

async function api(method, path, body) {
  return localApi(method, path, body);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
function rateClass(r) { return r >= 0.2 ? 'rate-high' : r >= 0.1 ? 'rate-mid' : 'rate-low'; }
function fmtPct(r) { return (r * 100).toFixed(1) + '%'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function viewWeek() {
  let w = $('#weekPicker').value;
  if (!w) { w = STATE.weeks[0] || monday(new Date().toISOString()); $('#weekPicker').value = w; }
  return w;
}
function monday(dstr) { const d = new Date(dstr); const day = d.getDay(); const diff = (day === 0 ? -6 : 1 - day); d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }

// ---------- 加载与刷新 ----------
async function loadState() {
  STATE = await api('GET', '/api/state');
  if (!STATE.weeks.length) STATE.weeks = [monday(new Date().toISOString())];
  if (!$('#weekPicker').value) $('#weekPicker').value = STATE.weeks[0];
  if (!$('#importWeek').value) $('#importWeek').value = STATE.weeks[0];
  if (!$('#aWeek').value) $('#aWeek').value = STATE.weeks[0];
  refreshAll();
}
function refreshAll() {
  renderBoard();
  renderConfig();
  renderActionPage();
}

// ---------- 看板 ----------
async function renderBoard() {
  const w = viewWeek();
  $('#weekHint').textContent = '当前周次（周一）：' + w;
  let agg;
  try { agg = await api('GET', '/api/aggregate?week=' + w); }
  catch (e) { toast(e.message); return; }
  // KPI
  const k = agg.summary;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="v">${k.caseCount}</div><div class="l">总进件量</div></div>
    <div class="kpi"><div class="v">${k.supplementCount}</div><div class="l">总补件量</div></div>
    <div class="kpi"><div class="v ${k.rate >= 0.2 ? 'danger' : ''}">${fmtPct(k.rate)}</div><div class="l">整体补件率</div></div>
    <div class="kpi"><div class="v">${k.teamCount}</div><div class="l">纳入团队数</div></div>`;
  // 团队表（已按补件率降序）
  const tb = $('#teamTable tbody');
  if (!agg.teams.length) tb.innerHTML = '<tr><td colspan="6" class="muted">暂无数据，请先导入或载入示例</td></tr>';
  else tb.innerHTML = agg.teams.map(t => `
    <tr>
      <td><b>${esc(t.team)}</b></td>
      <td>${esc(t.branch)}</td>
      <td><span class="rate-pill ${rateClass(t.rate)}">${fmtPct(t.rate)}</span></td>
      <td>${t.supervisors.length ? esc(t.supervisors.join('、')) : '<span class="muted">—</span>'}</td>
      <td>${t.caseCount}</td>
      <td>${t.supplementCount}</td>
    </tr>`).join('');
  renderKanban(w);
}
async function renderKanban(w) {
  let kb;
  try { kb = await api('GET', '/api/leader/kanban?week=' + w); } catch (e) { return; }
  const cols = kb.columns || {};
  const names = { '发起': '发起', '执行': '执行', '完成': '完成' };
  $('#kanban').innerHTML = Object.keys(names).map(st => `
    <div class="kcol">
      <h3><span>${names[st]}</span><span class="cnt">${(cols[st] || []).length}</span></h3>
      ${(cols[st] || []).map(a => cardHTML(a)).join('') || '<div class="muted" style="font-size:13px">—</div>'}
    </div>`).join('');
  bindCardBtns();
}
function cardHTML(a) {
  const tname = targetName(a);
  return `<div class="kcard" data-id="${a.id}">
    <div class="tt">${esc(tname)} <span class="status-badge st-${a.status}">${a.status}</span></div>
    <div class="meta">层级：${lvlName(a.targetLevel)} · 责任人：${esc(a.responsiblePerson)} · ${a.createdAt.slice(0,10)}</div>
    <div style="font-size:13px;color:#334;margin-bottom:8px">${esc(a.content)}</div>
    <div class="acts">${nextBtns(a)}</div>
  </div>`;
}
function nextBtns(a) {
  if (a.status === '发起') return `<button class="btn sm warn" data-act="执行">置为执行</button><button class="btn sm ok" data-act="完成">置为完成</button>`;
  if (a.status === '执行') return `<button class="btn sm ok" data-act="完成">置为完成</button><button class="btn sm ghost" data-act="发起">退回发起</button>`;
  return `<button class="btn sm ghost" data-act="执行">重新执行</button>`;
}
function bindCardBtns() {
  $$('#kanban .kcard [data-act]').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('.kcard').dataset.id;
    try { await api('PATCH', '/api/actions/' + id, { status: b.dataset.act }); toast('状态已更新'); renderBoard(); }
    catch (e) { toast(e.message); }
  }));
}
function lvlName(l) { return l === 'branch' ? '分部' : l === 'team' ? '团队' : '个人'; }
function targetName(a) {
  if (a.targetLevel === 'branch') { const b = STATE.branches.find(x => x.id === a.targetId); return b ? b.name : a.targetId; }
  if (a.targetLevel === 'team') { const t = STATE.teams.find(x => x.id === a.targetId); return t ? t.name : a.targetId; }
  const e = STATE.employees.find(x => x.id === a.targetId); return e ? e.name : a.targetId;
}

// ---------- 配置 ----------
function renderConfig() {
  // 下拉
  fill('#tBranch', STATE.branches, 'name');
  fill('#eTeam', STATE.teams, t => `${t.name}（${branchName(t.branchId)}）`);
  fill('#relBranch', STATE.branches, 'name');
  fill('#relSup', STATE.supervisors, 'name');
  // 列表
  $('#branchList').innerHTML = STATE.branches.map(b => `<div class="row" style="margin-bottom:6px"><div class="field"><b>${esc(b.name)}</b> <span class="muted">${esc(b.code || '')}</span></div></div>`).join('') || '<div class="muted">暂无分部</div>';
  $('#teamList').innerHTML = STATE.teams.map(t => `<div style="margin-bottom:4px">· ${esc(t.name)} <span class="muted">/ ${esc(branchName(t.branchId))}</span></div>`).join('') || '<div class="muted">暂无团队</div>';
  $('#empList').innerHTML = STATE.employees.map(e => `<div style="margin-bottom:4px">· ${esc(e.name)} <span class="muted">/ ${teamName(e.teamId)}</span></div>`).join('') || '<div class="muted">暂无员工</div>';
  $('#supList').innerHTML = STATE.supervisors.map(s => `<span class="chip" style="margin:0 6px 6px 0">${esc(s.name)}</span>`).join('') || '<div class="muted">暂无督导员工</div>';
  // 关系
  $('#relList').innerHTML = STATE.branchSupervisors.map(r => {
    const b = STATE.branches.find(x => x.id === r.branchId), s = STATE.supervisors.find(x => x.id === r.supervisorId);
    return `<div class="row" style="margin-bottom:6px;align-items:center"><div class="field"><b>${esc(b ? b.name : '?')}</b> ← ${esc(s ? s.name : '?')}</div>
      <button class="btn sm danger" data-delrel="${r.supervisorId}|${r.branchId}">解除</button></div>`;
  }).join('') || '<div class="muted">暂无关系</div>';
  $$('#relList [data-delrel]').forEach(b => b.addEventListener('click', async () => {
    const [sid, bid] = b.dataset.delrel.split('|');
    await api('DELETE', '/api/branch-supervisors', { supervisorId: sid, branchId: bid }); toast('已解除'); loadState();
  }));
  // 模板
  $('#tplList').innerHTML = STATE.actionTemplates.map(t => `<div style="margin-bottom:4px">· <b>${esc(t.name)}</b> <span class="muted">[${lvlName(t.level)}]</span> ${esc(t.defaultContent)}</div>`).join('') || '<div class="muted">暂无模板</div>';
  renderOrgSummary();
}
function renderOrgSummary() {
  const box = $('#orgSummary'); if (!box) return;
  if (!STATE.branches.length) { box.innerHTML = '<div class="muted">暂无组织架构</div>'; return; }
  box.innerHTML = STATE.branches.map(b => {
    const teams = STATE.teams.filter(t => t.branchId === b.id).map(t => `<span class="chip">${esc(t.name)}</span>`).join('') || '<span class="muted">无团队</span>';
    const sups = STATE.branchSupervisors.filter(r => r.branchId === b.id)
      .map(r => { const s = STATE.supervisors.find(x => x.id === r.supervisorId); return s ? `<span class="chip" style="background:#e9f7f0;color:#27a567">${esc(s.name)}</span>` : ''; }).join('');
    return `<div class="tree-branch"><div class="bh"><span>🏢 ${esc(b.name)}</span><span class="muted" style="font-weight:400">督导：${sups || '未配置'}</span></div><div class="teams">${teams}</div></div>`;
  }).join('');
}
function fill(sel, arr, fn) {
  const el = $(sel); if (!el) return;
  el.innerHTML = arr.map(o => `<option value="${o.id}">${typeof fn === 'function' ? fn(o) : o[fn]}</option>`).join('');
}
function branchName(id) { const b = STATE.branches.find(x => x.id === id); return b ? b.name : '?'; }
function teamName(id) { const t = STATE.teams.find(x => x.id === id); return t ? t.name : '?'; }

// ---------- 督导动作页 ----------
function renderActionPage() {
  fill('#aTpl', STATE.actionTemplates, t => `${t.name}（${lvlName(t.level)}）`);
  const launcher = STATE.supervisors.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') + '<option value="leader">负责人(leader)</option>';
  $('#aLauncher').innerHTML = launcher;
  repopulateTarget();
  renderActionList();
}
function repopulateTarget() {
  const lvl = $('#aLevel').value;
  let arr = lvl === 'branch' ? STATE.branches : lvl === 'team' ? STATE.teams : STATE.employees;
  const fn = lvl === 'branch' ? 'name' : lvl === 'team' ? (t => `${t.name}（${branchName(t.branchId)}）`) : (e => `${e.name}（${teamName(e.teamId)}）`);
  fill('#aTarget', arr, fn);
}
async function renderActionList() {
  const w = viewWeek();
  $('#actionWeekTag').textContent = w;
  let list;
  try { list = await api('GET', '/api/actions?week=' + w); } catch (e) { return; }
  const box = $('#actionList');
  if (!list.length) { box.innerHTML = '<div class="muted">当周暂无督导动作</div>'; return; }
  box.innerHTML = list.map(a => `
    <div class="act-item">
      <div class="a-top"><b>${esc(targetName(a))}</b><span class="status-badge st-${a.status}">${a.status}</span></div>
      <div class="a-top"><span class="muted">${lvlName(a.targetLevel)} · 责任人：${esc(a.responsiblePerson)} · ${a.createdAt.slice(0,10)}</span></div>
      <div class="a-content">${esc(a.content)}</div>
      <div class="acts" style="margin-top:6px">${nextBtns(a)}</div>
    </div>`).join('');
  $$('#actionList [data-act]').forEach(b => b.addEventListener('click', async () => {
    const item = b.closest('.act-item');
    const id = list[$$('#actionList .act-item').indexOf(item)].id;
    try { await api('PATCH', '/api/actions/' + id, { status: b.dataset.act }); toast('状态已更新'); renderActionList(); }
    catch (e) { toast(e.message); }
  }));
}

// ---------- 事件绑定 ----------
function bindEvents() {
  $$('.nav-btn[data-page]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.page === 'supervisor') return;
    $$('.nav-btn[data-page]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-' + b.dataset.page).classList.add('active');
    const titles = { board: '督导看板', import: '数据导入', config: '组织配置', action: '督导动作' };
    $('#pageTitle').textContent = titles[b.dataset.page];
  }));
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active')); t.classList.add('active');
    $$('.tabpane').forEach(p => p.classList.add('hidden'));
    $('#tab-' + t.dataset.tab).classList.remove('hidden');
  }));
  $('#weekPicker').addEventListener('change', renderBoard);
  $('#importWeek').addEventListener('change', () => {});
  $('#seedBtn').addEventListener('click', async () => { try { await api('POST', '/api/seed'); toast('示例数据已载入'); loadState(); } catch (e) { toast(e.message); } });
  $('#resetBtn').addEventListener('click', async () => { if (!confirm('确认清空全部数据？')) return; try { await api('POST', '/api/reset'); toast('已清空'); loadState(); } catch (e) { toast(e.message); } });

  // 导入
  $('#importBtn').addEventListener('click', async () => {
    const week = $('#importWeek').value || monday(new Date().toISOString());
    const text = $('#csvText').value.trim();
    if (!text) { toast('请填入 CSV'); return; }
    try {
      const r = await api('POST', '/api/import', { week, text });
      $('#importMsg').textContent = `成功导入 ${r.imported} 行；自动创建 分部${r.created.branches}/团队${r.created.teams}/员工${r.created.employees}`;
      toast('导入完成'); loadState();
    } catch (e) { toast(e.message); }
  });
  $('#loadSampleCsv').addEventListener('click', () => {
    $('#csvText').value = '上海分部,上海一组,王伟,120,18\n上海分部,上海二组,赵敏,90,27\n北京分部,北京一组,李娜,150,12';
    $('#importWeek').value = monday(new Date().toISOString());
  });

  // 配置新增
  $('#addBranch').addEventListener('click', async () => { const n = $('#bName').value.trim(); if (!n) return; try { await api('POST', '/api/branches', { name: n, code: $('#bCode').value.trim() }); $('#bName').value = ''; $('#bCode').value = ''; loadState(); } catch (e) { toast(e.message); } });
  $('#addTeam').addEventListener('click', async () => { const n = $('#tName').value.trim(); if (!n || !$('#tBranch').value) return; try { await api('POST', '/api/teams', { name: n, branchId: $('#tBranch').value }); $('#tName').value = ''; loadState(); } catch (e) { toast(e.message); } });
  $('#addEmp').addEventListener('click', async () => { const n = $('#eName').value.trim(); if (!n || !$('#eTeam').value) return; try { await api('POST', '/api/employees', { name: n, teamId: $('#eTeam').value }); $('#eName').value = ''; loadState(); } catch (e) { toast(e.message); } });
  $('#addSup').addEventListener('click', async () => { const n = $('#sName').value.trim(); if (!n) return; try { await api('POST', '/api/supervisors', { name: n }); $('#sName').value = ''; loadState(); } catch (e) { toast(e.message); } });
  $('#addRel').addEventListener('click', async () => { const bid = $('#relBranch').value, sid = $('#relSup').value; if (!bid || !sid) return; try { await api('POST', '/api/branch-supervisors', { supervisorId: sid, branchId: bid }); toast('已建立'); loadState(); } catch (e) { toast(e.message); } });
  $('#addTpl').addEventListener('click', async () => { const n = $('#tplName').value.trim(); if (!n) return; try { await api('POST', '/api/action-templates', { name: n, level: $('#tplLevel').value, defaultContent: $('#tplContent').value.trim() }); $('#tplName').value = ''; $('#tplContent').value = ''; loadState(); } catch (e) { toast(e.message); } });

  // 批量导入组织架构（Excel/CSV）
  $('#importOrgBtn').addEventListener('click', async () => {
    const f = $('#orgFile').files[0];
    if (!f) { toast('请先选择文件'); return; }
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      const b64 = btoa(bin);
      const clear = $('#clearOrgChk').checked;
      $('#orgImportMsg').textContent = clear ? '正在清空现有组织并导入…' : '正在解析并导入…';
      const r = await api('POST', '/api/import-org', { filename: f.name, data: b64, clear });
      $('#orgImportMsg').textContent =
        (r.cleared ? '已清空旧组织；' : '') +
        `导入完成：读取 ${r.rows} 行；新建 分部${r.created.branches}/团队${r.created.teams}/督导${r.created.supervisors}，建立关系${r.created.relations} 条`;
      toast(r.cleared ? '已清空旧组织并导入成功' : '组织架构导入成功'); loadState();
    } catch (e) { $('#orgImportMsg').textContent = '导入失败：' + e.message; toast(e.message); }
  });

  // 督导动作
  $('#aLevel').addEventListener('change', repopulateTarget);
  $('#aTpl').addEventListener('change', () => {
    const t = STATE.actionTemplates.find(x => x.id === $('#aTpl').value);
    if (t) { $('#aContent').value = t.defaultContent; $('#aLevel').value = t.level; repopulateTarget(); }
  });
  $('#addAction').addEventListener('click', async () => {
    const body = {
      week: $('#aWeek').value || monday(new Date().toISOString()),
      targetLevel: $('#aLevel').value, targetId: $('#aTarget').value,
      templateId: $('#aTpl').value || null, content: $('#aContent').value.trim(),
      responsiblePerson: $('#aResp').value.trim(), launcherId: $('#aLauncher').value
    };
    if (!body.targetId || !body.content || !body.responsiblePerson) { toast('请填写完整'); return; }
    try { await api('POST', '/api/actions', body); toast('动作已发起'); $('#aContent').value = ''; $('#aResp').value = ''; loadState(); }
    catch (e) { toast(e.message); }
  });
}

bindEvents();
loadState();
