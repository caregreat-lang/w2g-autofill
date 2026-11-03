/* W2G AutoFill: saves clients, form layouts and settings in this browser only (IndexedDB). Nothing is uploaded. */
(function (root) {
  const DB = 'w2g-autofill-2', STORES = ['clients', 'templates', 'settings'];
  let dbp = null, memory = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }).catch(() => { memory = Object.fromEntries(STORES.map(s => [s, new Map()])); return null; });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    if (!db) return fn(null, memory[store]);
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      let out; const r = fn(s, null);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
    });
  }
  const api = {
    all: store => tx(store, 'readonly', (s, m) => (m ? [...m.values()] : s.getAll())),
    get: (store, id) => tx(store, 'readonly', (s, m) => (m ? m.get(id) : s.get(id))),
    put: (store, obj) => tx(store, 'readwrite', (s, m) => (m ? m.set(obj.id, obj) : s.put(obj))),
    del: (store, id) => tx(store, 'readwrite', (s, m) => (m ? m.delete(id) : s.delete(id))),
    clear: store => tx(store, 'readwrite', (s, m) => (m ? m.clear() : s.clear())),
    persistent: () => open().then(db => !!db)
  };
  root.W2GStore = api;
})(self);
