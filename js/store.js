// W2G AutoFill - on-device storage (IndexedDB). Nothing here is ever uploaded.
(function (root) {
  'use strict';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('w2g-autofill', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('clients', { keyPath: 'id' }); d.createObjectStore('templates', { keyPath: 'id' }); d.createObjectStore('pdfs'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  root.W2GStore = {
    all: store => tx(store, 'readonly', s => s.getAll()),
    put: (store, v, key) => tx(store, 'readwrite', s => key === undefined ? s.put(v) : s.put(v, key)),
    get: (store, key) => tx(store, 'readonly', s => s.get(key)),
    del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
    clear: store => tx(store, 'readwrite', s => s.clear()),
  };
})(globalThis);
