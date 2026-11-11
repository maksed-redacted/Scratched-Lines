/* Launchpad PWA runtime.
   - Registers the offline service worker.
   - Stands in for the claude.ai features the apps were built on (saving, file downloads),
     so they work as plain web pages. Everything is stored on this device only. */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  if (window.claude) return; // running inside claude.ai: keep the real thing

  var APP = (document.currentScript && document.currentScript.dataset.app) || 'app';
  var CAPS = ((document.currentScript && document.currentScript.dataset.caps) || '').split(',');
  var KEY = 'pwa.db.' + APP;

  /* ---------- device-only document store ---------- */
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
  var docL = {}, colL = {};
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  var parent = function (p) { return p.slice(0, p.lastIndexOf('/')); };
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) { var err = new Error('Storage is full'); err.code = 'quota_exceeded'; throw err; }
  }
  function docsOf(col) {
    var pre = col + '/', out = [];
    Object.keys(store).forEach(function (k) {
      if (k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') === -1) out.push(k);
    });
    return out.sort();
  }
  function docSnap(path) {
    var has = Object.prototype.hasOwnProperty.call(store, path);
    return { id: path.split('/').pop(), exists: has, data: function () { return has ? clone(store[path]) : undefined; } };
  }
  function colSnap(col) {
    var docs = docsOf(col).map(docSnap);
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
  }
  function notify(path) {
    setTimeout(function () {
      (docL[path] || []).forEach(function (cb) { cb(docSnap(path)); });
      var c = parent(path);
      (colL[c] || []).forEach(function (cb) { cb(colSnap(c)); });
    }, 0);
  }
  function listen(map, key, cb, first) {
    (map[key] = map[key] || []).push(cb);
    setTimeout(function () { cb(first()); }, 0);
    return function () { map[key] = (map[key] || []).filter(function (f) { return f !== cb; }); };
  }
  function doc(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: function () { return Promise.resolve(docSnap(path)); },
      set: function (d) { store[path] = clone(d); persist(); notify(path); return Promise.resolve(); },
      update: function (d) { store[path] = Object.assign({}, store[path] || {}, clone(d)); persist(); notify(path); return Promise.resolve(); },
      delete: function () { delete store[path]; persist(); notify(path); return Promise.resolve(); },
      onSnapshot: function (cb) { return listen(docL, path, cb, function () { return docSnap(path); }); },
      collection: function (c) { return collection(path + '/' + c); }
    };
  }
  function newId() { var s = '', a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; for (var i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function collection(col) {
    return {
      doc: function (id) { return doc(col + '/' + (id || newId())); },
      add: function (d) { var r = doc(col + '/' + newId()); return r.set(d).then(function () { return r; }); },
      get: function () { return Promise.resolve(colSnap(col)); },
      onSnapshot: function (cb) { return listen(colL, col, cb, function () { return colSnap(col); }); }
    };
  }
  var db = { doc: doc, collection: collection };

  /* ---------- downloads: share sheet on phones, normal download elsewhere ---------- */
  var downloads = {
    save: function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.filename.endsWith('.json') ? 'application/json' : 'text/plain' });
      var file;
      try { file = new File([blob], o.filename, { type: blob.type }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: o.filename }).catch(function (e) {
          var err = new Error('declined'); err.code = e && e.name === 'AbortError' ? 'declined' : 'failed'; throw err;
        });
      }
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return Promise.resolve();
    }
  };

  var caps = { db: db, downloads: downloads };
  window.claude = {
    use: function (name) { return Promise.resolve(CAPS.indexOf(name) > -1 ? caps[name] : null); }
  };
})();
