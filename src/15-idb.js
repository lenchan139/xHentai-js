  // ---------------------------------------------------------------------------
  // IndexedDB metadata cache (favorites + gallery metadata)
  // ---------------------------------------------------------------------------
  // HTML responses stay in the Cache API; this store is for parsed metadata
  // that benefits from structured storage and a larger quota than localStorage.
  const IDB_NAME = 'ehx';
  const IDB_VERSION = 1;
  let idbPromise = null;
  let idbMigration = null;

  function idbSupported() {
    return typeof indexedDB !== 'undefined';
  }

  function idbOpen() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if (!idbSupported()) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'url' });
        if (!db.objectStoreNames.contains('galleries')) db.createObjectStore('galleries', { keyPath: 'gid' });
        if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags', { keyPath: 'full' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    }).catch((e) => {
      idbPromise = null;
      throw e;
    });
    return idbPromise;
  }

  async function idbGet(storeName, key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(storeName, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB aborted'));
    });
  }

  async function idbDelete(storeName, key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbClear(storeName) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbAll(storeName) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbMigrate() {
    try {
      const legacy = store.get('favorites', null);
      if (legacy && legacy.url && legacy.data) {
        await idbPut('favorites', legacy);
        store.del('favorites');
      }
    } catch { /* private mode / no IDB */ }
  }

  function idbEnsure() {
    if (!idbMigration) idbMigration = idbOpen().then(idbMigrate).catch(() => null);
    return idbMigration;
  }

  async function persistedFavoritesEntry(url) {
    await idbEnsure();
    const hit = await idbGet('favorites', url).catch(() => null);
    if (hit) return hit;
    const legacy = store.get('favorites', null);
    if (legacy && legacy.url === url && legacy.data) {
      idbPut('favorites', legacy).catch(() => { /* keep legacy */ });
      store.del('favorites');
      return legacy;
    }
    return null;
  }

  function persistFavoritesEntry(url, data) {
    if (!url || !data || !Array.isArray(data.items) || data.loggedOut || data.sad) return;
    const entry = { url, at: Date.now(), data };
    idbPut('favorites', entry).catch(() => {
      try { store.set('favorites', entry); } catch { /* quota */ }
    });
  }

  function cacheGalleryMetadata(items) {
    if (!Array.isArray(items) || !items.length) return;
    const now = Date.now();
    for (const g of items.slice(0, 80)) {
      if (!g || !g.gid) continue;
      const rec = {
        gid: String(g.gid),
        title: g.title || '',
        category: g.category || '',
        cover: g.cover || '',
        pages: g.pages || 0,
        language: g.language || '',
        rating: g.rating || 0,
        uploader: g.uploader || '',
        tags: (g.tags || []).map((t) => ({ ns: t.ns || '', name: t.name || '', watched: !!t.watched })),
        updatedAt: now,
      };
      idbPut('galleries', rec).catch(() => { /* noop */ });
    }
  }

  async function localTagSuggestions(keyword, limit = 10) {
    const k = String(keyword || '').trim().toLowerCase();
    if (!k) return [];
    const all = await idbAll('galleries').catch(() => []);
    const seen = new Set();
    const out = [];
    for (const g of all) {
      for (const t of g.tags || []) {
        const full = `${t.ns}:${t.name}`;
        if (seen.has(full)) continue;
        if (full.toLowerCase().includes(k) || String(t.name).toLowerCase().includes(k)) {
          seen.add(full);
          out.push({ ns: t.ns, name: t.name, full });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  function clearMetadataCaches() {
    store.del('favorites');
    idbClear('favorites').catch(() => { /* noop */ });
    idbClear('galleries').catch(() => { /* noop */ });
    idbClear('tags').catch(() => { /* noop */ });
  }
