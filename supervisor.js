'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let SUPERVISORS = [];
async function api(method, path, body) {
  return localApi(method, path, body);
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
function lvlName(l) { return l === 'branch' ? '分部' : l === 'team' ? '团队' : '个人'; }
function monday(dstr) { const d = new Date(dstr); const day = d.getDay(); const diff = (day === 0 ? -6 : 1 - day); d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function loadSupers() {
  const st = await api('GET', '/api/state');
  SUPERVISORS = st.supervisors;
  const prof = window.wbProfile || null;
  $('#supSel').innerHTML = SUPERVISORS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') || '<option>暂无督导员工</option>';
  const who = $('#whoami');
  if (who) who.textContent = prof ? (prof.display_name || prof.email || '') + ' · ' + (prof.role === 'leader' ? '负责人' : '成员') : '…';
  const tl = $('#toLeader'); if (tl && prof && prof.role === 'leader') tl.style.display = 'block';
  if (!st.weeks.length) st.weeks = [monday(new Date().toISOString())];
  $('#weekPicker').value = st.weeks[0];
  if (SUPERVISORS.length) loadDashboard();
}
function viewWeek() { return $('#weekPicker').value || monday(new Date().toISOString()); }

async function loadDashboard() {
  const id = $('#supSel').value; if (!id) return;
  const w = viewWeek();
  $('#hint').textContent = '周次（周一）：' + w;
  let d;
  try { d = await api('GET', '/api/supervisor/' + id + '/dashboard?week=' + w); } catch (e) { toast(e.message); return; }
  $('#supTitle').textContent = (d.supervisor ? d.supervisor.name : '督导') + ' · 负责分部与团队';
  $('#tree').innerHTML = d.branches.length ? d.branches.map(b => `
    <div class="tree-branch">
      <div class="bh"><span>🏢 ${esc(b.branch)}</span></div>
      <div class="teams">${b.teams.map(t => `<span class="chip">${esc(t)}</span>`).join('') || '<span class="muted">无团队</span>'}</div>
    </div>`).join('') : '<div class="muted">该督导尚未负责任何分部（请在负责人工作台配置分部-督导关系）</div>';

  $('#actWeek').textContent = w;
  const list = d.actions || [];
  $('#actList').innerHTML = list.length ? list.map(a => `
    <div class="act-item" data-id="${a.id}">
      <div class="a-top"><b>${esc(targetName(a))}</b><span class="status-badge st-${a.status}">${a.status}</span></div>
      <div class="a-top"><span class="muted">${lvlName(a.targetLevel)} · 责任人：${esc(a.responsiblePerson)} · ${a.createdAt.slice(0,10)}</span></div>
      <div class="a-content">${esc(a.content)}</div>
      <div class="acts" style="margin-top:6px">${nextBtns(a)}</div>
    </div>`).join('') : '<div class="muted">当周暂无督导动作</div>';
  bindBtns(list);
}
function targetName(a) {
  // 需回查主数据；这里仅依赖 action 自身不足以解析名称，调用 /api/state 补充
  return window._nameCache ? (window._nameCache[a.targetLevel]?.[a.targetId] || a.targetId) : a.targetId;
}
function nextBtns(a) {
  if (a.status === '发起') return `<button class="btn sm warn" data-act="执行">置为执行</button><button class="btn sm ok" data-act="完成">置为完成</button>`;
  if (a.status === '执行') return `<button class="btn sm ok" data-act="完成">置为完成</button><button class="btn sm ghost" data-act="发起">退回发起</button>`;
  return `<button class="btn sm ghost" data-act="执行">重新执行</button>`;
}
function bindBtns(list) {
  $$('#actList [data-act]').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('.act-item').dataset.id;
    try { await api('PATCH', '/api/actions/' + id, { status: b.dataset.act }); toast('状态已更新'); loadDashboard(); }
    catch (e) { toast(e.message); }
  }));
}
async function buildNameCache() {
  const st = await api('GET', '/api/state');
  window._nameCache = {
    branch: Object.fromEntries(st.branches.map(b => [b.id, b.name])),
    team: Object.fromEntries(st.teams.map(t => [t.id, t.name])),
    person: Object.fromEntries(st.employees.map(e => [e.id, e.name]))
  };
}

$('#supSel').addEventListener('change', loadDashboard);
$('#weekPicker').addEventListener('change', loadDashboard);

(function () {
  const lo = $('#logoutBtn'); if (lo) lo.addEventListener('click', () => { if (window.wbSignOut) wbSignOut(); });
  let t;
  window.addEventListener('wb:sync', () => { clearTimeout(t); t = setTimeout(() => { try { buildNameCache().then(loadSupers); } catch (e) {} }, 600); });
})();

buildNameCache().then(loadSupers);
