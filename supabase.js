/* ============================================================
 * Supabase 极简客户端（零 SDK、零外部依赖）
 * 仅用 REST + 服务端 RLS 保证权限，数据安全由数据库策略兜底。
 * ============================================================ */
window.sb = (function () {
  var BASE = function () { return window.SUPABASE_URL; };
  var KEY = function () { return window.SUPABASE_ANON_KEY; };

  function headers(extra) {
    var h = {
      'apikey': KEY(),
      'Content-Type': 'application/json'
    };
    var s = sbSession.get();
    if (s && s.access_token) h['Authorization'] = 'Bearer ' + s.access_token;
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  // 通用请求：method + 相对路径（如 /rest/v1/branches?select=*）
  function req(method, path, body, extra) {
    return fetch(BASE() + path, {
      method: method,
      headers: headers(extra),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (!r.ok) {
          var msg = data && (data.message || data.error_description || data.msg) || ('请求失败 ' + r.status);
          var e = new Error(msg); e.status = r.status; throw e;
        }
        return data;
      });
    });
  }

  // ---- Auth ----
  function signIn(email, password) {
    return req('POST', '/auth/v1/token?grant_type=password', { email: email, password: password })
      .then(function (d) {
        var s = { access_token: d.access_token, token_type: d.token_type, expires_at: Date.now() + (d.expires_in || 3600) * 1000, uid: d.user && d.user.id, email: email };
        sbSession.set(s);
        return s;
      });
  }
  function signOut() {
    return req('POST', '/auth/v1/logout', {}).catch(function () {}).then(function () { sbSession.clear(); });
  }
  function signUp(email, password) {
    return req('POST', '/auth/v1/signup', { email: email, password: password });
  }
  function getProfile() {
    var s = sbSession.get(); if (!s) return Promise.resolve(null);
    return req('GET', '/rest/v1/profiles?select=*&id=eq.' + encodeURIComponent(s.uid))
      .then(function (rows) { return (rows && rows[0]) || null; });
  }

  // ---- PostgREST 便捷 ----
  function select(table, query) {
    return req('GET', '/rest/v1/' + table + (query ? '?' + query : ''));
  }
  function upsert(table, rows, onConflict) {
    if (!rows || !rows.length) return Promise.resolve();
    var h = { 'Prefer': 'resolution=merge-duplicates,return=minimal' };
    if (onConflict) h['Prefer'] = 'resolution=merge-duplicates,return=minimal,on_conflict=' + onConflict;
    return req('POST', '/rest/v1/' + table, rows, h);
  }
  function remove(table, filter) { // filter 形如 id=in.(a,b,c)
    return req('DELETE', '/rest/v1/' + table + '?' + filter);
  }
  function removeAll(table) {
    return req('DELETE', '/rest/v1/' + table + '?id=neq.00000000-0000-0000-0000-000000000000');
  }

  return {
    req: req, signIn: signIn, signOut: signOut, signUp: signUp, getProfile: getProfile,
    select: select, upsert: upsert, remove: remove, removeAll: removeAll
  };
})();

// 会话存取（localStorage）
window.sbSession = (function () {
  var K = 'wb_session';
  return {
    get: function () { try { var s = JSON.parse(localStorage.getItem(K)); if (s && s.access_token && s.expires_at > Date.now()) return s; return null; } catch (e) { return null; } },
    set: function (s) { try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(K); } catch (e) {} }
  };
})();
