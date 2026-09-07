/* ============================================================
 * CloudBase Web 客户端（官方 JS SDK，动态加载）
 * 用法：window.wbCall({op, ...}) → Promise<result>（云函数返回值）
 *       window.wbLogin(email,pw) / window.wbLogout()
 * 依赖：已开启「身份认证 → 登录方式 → 匿名登录」
 * ============================================================ */
window.wbCall = (function () {
  var _app = null, _ready = null;

  // 动态加载 @cloudbase/js-sdk（多源兜底）
  function loadSdk() {
    if (window.cloudbaseSdk) return Promise.resolve(window.cloudbaseSdk);
    var urls = [
      'https://esm.sh/@cloudbase/js-sdk@1.7.2',
      'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@1.7.2/+esm'
    ];
    function tryLoad(i) {
      if (i >= urls.length) return Promise.reject(new Error('无法加载 CloudBase SDK（CDN 均失败），请检查网络后重试'));
      return import(urls[i]).then(function (m) {
        var mod = m && (m.default || m);
        window.cloudbaseSdk = mod;
        return mod;
      }).catch(function () { return tryLoad(i + 1); });
    }
    return tryLoad(0);
  }

  function init() {
    if (_ready) return _ready;
    _ready = loadSdk().then(function (mod) {
      var initFn = mod.init || mod.createApp || mod;
      var arg = typeof initFn === 'function' ? { env: window.WB_ENV } : { env: window.WB_ENV };
      if (mod.init) _app = mod.init(arg);
      else if (mod.createApp) _app = mod.createApp(arg);
      else throw new Error('SDK 形态不识别');
      // 匿名登录（已开启）
      var auth = _app.auth({ persistence: 'local' });
      return auth.signInAnonymously().then(function () { return _app; });
    });
    return _ready;
  }

  function callFn(data) {
    return init().then(function (app) {
      return app.callFunction({ name: window.WB_FUNC, data: data || {} });
    }).then(function (res) {
      var r = res && (res.result !== undefined ? res.result : res.data);
      if (!r) throw new Error('云函数无返回');
      if (r.code && r.code !== 0) { var e = new Error(r.msg || ('错误 ' + r.code)); e.code = r.code; throw e; }
      return r.data;
    });
  }

  window.wbLogin = function (email, password) {
    return callFn({ op: 'login', email: email, password: password }).then(function (d) {
      try { localStorage.setItem('wb_session', JSON.stringify({ token: d.token, user: d.user })); } catch (e) {}
      window.wbProfile = d.user;
      return d.user;
    });
  };
  window.wbLogout = function () {
    var s = readSess();
    try { localStorage.removeItem('wb_session'); } catch (e) {}
    window.wbProfile = null;
    return s ? callFn({ op: 'logout', token: s.token }).catch(function () {}) : Promise.resolve();
  };
  function readSess() {
    try { return JSON.parse(localStorage.getItem('wb_session')) || null; } catch (e) { return null; }
  }
  window.wbSession = readSess;

  // 业务调用统一入口：自动附带 token
  window.wbApi = function (payload) {
    var s = readSess();
    if (!s) { var er = new Error('未登录'); er.code = 401; return Promise.reject(er); }
    return callFn(Object.assign({ token: s.token }, payload || {}));
  };
  window.wbProfile = null;
  return function (data) { return callFn(data); };
})();
