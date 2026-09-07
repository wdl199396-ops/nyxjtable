/* ============================================================
 * 纯 JS 实现的 CloudBase 调用客户端（零依赖、零外部网络）
 * - 匿名登录: 直接 POST 到 TCB 认证端点，拿到 user_ticket
 * - callFunction: 直接 POST 到函数调用端点
 * - 会话存 localStorage，30 天有效
 * ============================================================ */

var _wbApp = null;
var _wbApi = null;
var _wbSignOut = null;
var _wbProfile = null;
var _wbSession = null;
var _wbLogin = null;

(function () {
  function readSess() {
    try { return JSON.parse(localStorage.getItem('wb_session')) || null; } catch (e) { return null; }
  }
  function writeSess(s) { try { localStorage.setItem('wb_session', JSON.stringify(s)); } catch (e) {} }
  function clearSess() { try { localStorage.removeItem('wb_session'); } catch (e) {} }

  // TCB 公开 API 网关（不依赖具体区域，envId 决定路径）
  function apiBase() { return 'https://' + window.WB_ENV + '.api.tcloudbase.com'; }
  function authBase() { return apiBase(); }
  // 备用端点
  var ALT_API_BASES = [
    'https://' + window.WB_ENV + '.ap-shanghai.app.tcloudbase.com',
    'https://' + window.WB_ENV + '.ap-guangzhou.app.tcloudbase.com'
  ];

  function postJson(url, body, headers) {
    return fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
        if (!r.ok) {
          var msg = (d && (d.error || d.message)) || ('HTTP ' + r.status);
          var err = new Error(msg); err.status = r.status; throw err;
        }
        return d;
      });
    });
  }

  // 匿名登录
  function signInAnonymously() {
    var url = authBase() + '/1.0.0/auth/signInAnonymously';
    return postJson(url, {}).then(function (res) {
      return {
        userId: (res && res.userId) || (res && res.uid) || ('anon-' + Date.now()),
        ticket: res && (res.ticket || res.accessToken || res.token),
        refreshToken: res && (res.refreshToken || res.refresh_token),
        raw: res
      };
    });
  }

  function callFunction(name, data) {
    var s = readSess();
    if (!s || !s.ticket) return Promise.reject(new Error('未登录'));
    var payload = { data: data || {}, eventId: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
    var headers = { 'X-CloudBase-Authorization': JSON.stringify({ ticket: s.ticket }) };
    var url = apiBase() + '/1.0.0/functions/' + encodeURIComponent(name);
    return postJson(url, payload, headers).then(function (res) {
      // TCB 端点可能包一层 envelope { data: {...}, status:0 } 或直接 { code, data }
      var inner = res && res.data !== undefined ? res.data : res;
      if (inner && inner.code !== undefined && inner.code !== 0) {
        var e = new Error(inner.msg || ('错误 ' + inner.code)); e.code = inner.code; throw e;
      }
      return inner && inner.data !== undefined ? inner.data : inner;
    });
  }

  function tryAltCallFunction(name, data) {
    // 尝试备用端点
    return callFunction(name, data).catch(function (e1) {
      return ALT_API_BASES.reduce(function (p, base) {
        return p.catch(function () {
          var s = readSess();
          var url = base + '/1.0.0/functions/' + encodeURIComponent(name);
          return postJson(url, { data: data || {} }, { 'X-CloudBase-Authorization': JSON.stringify({ ticket: s.ticket }) })
            .then(function (res) { var i = res && res.data !== undefined ? res.data : res; return i && i.data !== undefined ? i.data : i; });
        });
      }, Promise.reject(e1));
    });
  }

  // === 公共 API ===
  _wbLogin = function (email, password) {
    // 匿名登录 + 然后调用 wb 的 login 操作（这才是真正的应用登录）
    return signInAnonymously().then(function (a) {
      writeSess({ ticket: a.ticket, refreshToken: a.refreshToken, anonUserId: a.userId, ts: Date.now() });
      return tryAltCallFunction('wb', { op: 'login', email: email, password: password });
    }).then(function (data) {
      // 服务端返回 { token, user }；把 token 存到会话里
      writeSess(Object.assign(readSess(), { userToken: data.token, user: data.user, ts: Date.now() }));
      _wbProfile = data.user;
      return data.user;
    });
  };

  _wbSignOut = function () {
    var s = readSess();
    clearSess();
    _wbProfile = null;
    if (s && s.userToken) {
      // 尝试服务端登出（无 token 也无害）
      return tryAltCallFunction('wb', { op: 'logout', token: s.userToken }).catch(function () {});
    }
    return Promise.resolve();
  };

  _wbSession = readSess;

  _wbApi = function (payload) {
    var s = readSess();
    if (!s || !s.userToken) return Promise.reject(Object.assign(new Error('未登录或登录已过期'), { code: 401 }));
    // 业务调用需要"业务 token"（由 login 操作返回），不是匿名 ticket
    var bizPayload = Object.assign({ token: s.userToken }, payload || {});
    return tryAltCallFunction('wb', bizPayload).catch(function (e) {
      if (e && e.code === 401) { clearSess(); _wbProfile = null; }
      throw e;
    });
  };

  _wbProfile = null;
})();

// 兼容旧符号名
window.wbCall = function (d) { return _wbApi(d); };
window.wbApi = _wbApi;
window.wbLogin = _wbLogin;
window.wbLogout = _wbSignOut;
window.wbSession = _wbSession;
window.wbSignOut = _wbSignOut;
window.wbRole = function () { return _wbProfile && _wbProfile.role; };
