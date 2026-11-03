/* W2G AutoFill: screens and flow. Clients → Forms → Fill & download. Everything stays on this device. */
(async function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = W2GParse, FL = W2GFill, S = W2GStore;
  const LABEL = Object.fromEntries(P.FIELDS);
  const SRC_LABEL = Object.fromEntries(FL.SOURCES);
  const CHIP = { ok: 'OK', check: 'Check', missing: 'Missing', toolong: 'Fix' };
  const chip = st => `<span class="chip ${st}">${CHIP[st] || st}</span>`;

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const online = /^https?:$/.test(location.protocol);
  const libs = {
    pdfjs: pdfjsLib, XLSX,
    Tesseract: online && self.Tesseract ? Tesseract : null,
    tesseractOpts: { workerPath: 'lib/tesseract-worker.min.js', corePath: 'lib/tess-core', langPath: 'lib/tess-lang', gzip: true, cacheMethod: 'none' }
  };
  if (online && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ---------- small helpers ----------
  function toast(msg, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function dialog(html, buttons, onOpen) {
    const d = $('#dlg');
    $('#dlgBody').innerHTML = html;
    $('#dlgFoot').innerHTML = buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('');
    return new Promise(res => {
      const done = v => { d.close(); res(v); };
      $$('#dlgFoot button').forEach(btn => btn.onclick = () => { const b = buttons[+btn.dataset.i]; done(b.get ? b.get() : b.value); });
      d.oncancel = e => { e.preventDefault(); done(null); };
      d.showModal(); onOpen && onOpen(d);
    });
  }
  const confirmBox = (title, body, ok = 'Yes, go ahead', danger = false) =>
    dialog(`<h2>${esc(title)}</h2><div style="margin-top:8px">${body}</div>`, [{ label: 'Cancel', value: false }, { label: ok, value: true, cls: danger ? 'pri danger' : 'pri' }]);
  const promptBox = (title, label, initial = '') =>
    dialog(`<h2>${esc(title)}</h2><label class="f" for="pbIn" style="margin-top:10px">${esc(label)}</label><input id="pbIn" type="text" value="${esc(initial)}">`,
      [{ label: 'Cancel', value: null }, { label: 'OK', cls: 'pri', get: () => $('#pbIn').value }],
      () => { const i = $('#pbIn'); i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') $('#dlgFoot .pri').click(); }; });
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function download(bytes, name, type = 'application/pdf') {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nricKey = c => P.nricDigits(c.fields.nric.value);
  const toCheck = c => P.FIELDS.filter(([k]) => c.fields[k].status === 'check').length;

  // ---------- data ----------
  let clients = (await S.all('clients')) || [];
  let custom = (await S.all('templates')) || [];
  let settings = (await S.get('settings', 'main')) || { id: 'main', autoFill: 'off' };
  const builtin = W2GTemplates.BUILTIN;
  const allTemplates = () => [...builtin, ...custom.sort((a, b) => a.name.localeCompare(b.name))];
  const tplById = id => allTemplates().find(t => t.id === id);
  const tplBytes = t => (t.builtin ? b64ToBytes(W2GFormsData[t.pdf]) : new Uint8Array(t.pdfBytes));
  clients.sort((a, b) => a.fields.name.value.localeCompare(b.fields.name.value));

  // ---------- tabs ----------
  function showTab(name) {
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
    if (name === 'fill') renderFillPick();
    if (name === 'forms') renderForms();
    scrollTo(0, 0);
  }
  $$('#nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // ---------- PDF page rendering ----------
  // Renders every page of `bytes` into `host`, reusing page boxes so edits don't flicker.
  async function renderPages(host, bytes, prev) {
    const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const width = Math.min(host.clientWidth || 800, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      const base = pg.getViewport({ scale: 1 });
      const scale = width / base.width;
      const vp = pg.getViewport({ scale: scale * dpr });
      const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise; // 'print' draws without waiting for screen frames
      let box = prev && prev[n - 1] && prev[n - 1].box;
      if (!box) {
        box = document.createElement('div'); box.className = 'pagebox'; box.dataset.page = n;
        box.innerHTML = '<div class="ov"></div>'; host.appendChild(box);
      }
      box.style.width = width + 'px';
      const old = box.querySelector('canvas'); if (old) old.replaceWith(canvas); else box.prepend(canvas);
      pages.push({ n, box, ov: box.querySelector('.ov'), scale, wPt: base.width, hPt: base.height, pg });
    }
    if (prev) for (const p of prev.slice(doc.numPages)) p.box.remove();
    return pages;
  }
  // PDF points ↔ on-screen pixels inside a page box
  // Marks are placed in % of the page, and clicks are converted with the page's current on-screen width, so a resize never shifts them.
  const shown = p => p.ov.clientWidth / p.wPt;
  const toPx = (p, [x, y, w, h]) => ({ left: x / p.wPt * 100, top: (p.hPt - y - h) / p.hPt * 100, width: w / p.wPt * 100, height: h / p.hPt * 100 });
  const toPt = (p, px, py) => ({ x: px / shown(p), y: p.hPt - py / shown(p) });
  const place = (el, r, u = '%') => Object.assign(el.style, { left: r.left + u, top: r.top + u, width: r.width + u, height: r.height + u });
  const fieldRects = fd => (fd.kind === 'text' ? [fd.rect] : fd.cells);

  // =====================================================================
  // 1 · CLIENTS
  // =====================================================================
  let review = null; // {items: [{client, dup, action}], notes, errors}

  function renderAutoFill() {
    $('#autoFill').innerHTML = `<option value="off">Off (just save)</option>` + allTemplates().map(t => `<option value="${t.id}">${esc(t.short || t.name)}</option>`).join('');
    $('#autoFill').value = tplById(settings.autoFill) ? settings.autoFill : 'off';
  }
  $('#autoFill').onchange = async e => { settings.autoFill = e.target.value; await S.put('settings', settings); };

  const drop = $('#drop');
  drop.onclick = () => $('#fileIn').click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readFiles([...e.dataTransfer.files]); };
  $('#fileIn').onchange = e => { readFiles([...e.target.files]); e.target.value = ''; };

  async function readFiles(files) {
    if (!files.length) return;
    const bar = $('#readProgress'), fillBar = bar.firstElementChild; bar.hidden = false;
    const found = [], notes = [], errors = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      fillBar.style.width = (i / files.length * 100) + '%';
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const r = await P.readFile(f.name, bytes, libs, p => { fillBar.style.width = ((i + p) / files.length * 100) + '%'; });
        if (r.error) errors.push(`<b>${esc(f.name)}</b>: ${esc(r.error)}`);
        r.notes.forEach(n => notes.push(`<b>${esc(f.name)}</b>: ${esc(n)}`));
        found.push(...r.clients);
      } catch (e) {
        console.error(e); errors.push(`<b>${esc(f.name)}</b>: could not be opened (${esc(e.message || e)}).`);
      }
    }
    bar.hidden = true; fillBar.style.width = '0';
    // Same person + same policy as a saved client (or earlier in this batch) → ask before changing.
    const items = [];
    for (const c of found) {
      const k = nricKey(c), pol = c.fields.policyNo.value, nm = c.fields.name.value;
      const same = x => (k ? nricKey(x) === k : x.fields.name.value === nm && !nricKey(x)) && x.fields.policyNo.value === pol;
      const dup = clients.find(same);
      const batchDup = items.find(it => same(it.client));
      items.push({ client: c, dup, action: batchDup ? 'skip' : dup ? 'update' : 'add', batchDup: !!batchDup });
    }
    review = { items, notes, errors };
    renderReview();
  }

  function cell(c, k) {
    const v = c.fields[k];
    if (v.status === 'missing') return `<td>${chip('missing')}${v.note ? `<span class="nt">${esc(v.note)}</span>` : ''}</td>`;
    return `<td><span class="v">${esc(v.value)} ${v.status !== 'ok' ? chip(v.status) : ''}</span>${v.note ? `<span class="nt">${esc(v.note)}</span>` : ''}</td>`;
  }
  const COLS = ['nric', 'dob', 'phone', 'email', 'company', 'accountManager', 'policyNo', 'policyStatus'];

  function renderReview() {
    const r = review; $('#review').hidden = !r;
    if (!r) return;
    $('#reviewNotes').innerHTML = r.notes.join('<br>');
    $('#reviewErrs').innerHTML = r.errors.map(e => `<div class="err">${e}</div>`).join('');
    const n = a => r.items.filter(i => i.action === a).length;
    $('#reviewCount').textContent = r.items.length ? `${r.items.length} found · ${n('add')} new · ${n('update')} update · ${n('skip')} skip` : '';
    $('#reviewTable').innerHTML = r.items.length ? `<thead><tr><th>Action</th><th>Name</th>${COLS.map(k => `<th>${esc(LABEL[k])}</th>`).join('')}<th>From</th></tr></thead><tbody>` +
      r.items.map((it, i) => `<tr class="${it.dup || it.batchDup ? 'dup' : ''}"><td>${it.dup || it.batchDup
        ? `<select data-i="${i}" class="ract" style="min-width:150px"><option value="update" ${it.action === 'update' ? 'selected' : ''} ${it.dup ? '' : 'disabled'}>Update saved client</option><option value="add" ${it.action === 'add' ? 'selected' : ''}>Add as new</option><option value="skip" ${it.action === 'skip' ? 'selected' : ''}>Skip</option></select><span class="nt">${it.batchDup ? 'Same as another row in these files' : 'Already in your list'}</span>`
        : `<select data-i="${i}" class="ract"><option value="add" selected>Add</option><option value="skip">Skip</option></select>`}</td>
        <td><a href="#" data-i="${i}" class="redit"><b>${esc(it.client.fields.name.value || '(no name)')}</b></a>${it.client.fields.name.status !== 'ok' ? ' ' + chip(it.client.fields.name.status) : ''}</td>
        ${COLS.map(k => cell(it.client, k)).join('')}<td class="small muted">${esc(it.client.source)}</td></tr>`).join('') + '</tbody>'
      : '';
    $$('.ract').forEach(s => s.onchange = () => { r.items[+s.dataset.i].action = s.value; renderReview(); });
    $$('.redit').forEach(a => a.onclick = async e => { e.preventDefault(); const it = r.items[+a.dataset.i]; if (await editClient(it.client)) renderReview(); });
    $('#reviewSave').disabled = !r.items.some(i => i.action !== 'skip');
    $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#reviewCancel').onclick = () => { review = null; renderReview(); };
  $('#reviewSave').onclick = async () => {
    const adds = review.items.filter(i => i.action === 'add'), ups = review.items.filter(i => i.action === 'update' && i.dup);
    const body = `<p>${adds.length ? `Add <b>${adds.length}</b> new client${adds.length > 1 ? 's' : ''}.` : ''} ${ups.length ? `Update <b>${ups.length}</b> saved client${ups.length > 1 ? 's' : ''}: ${ups.map(u => esc(u.dup.fields.name.value)).join(', ')}. New details replace the old ones; details missing from the new file are kept.` : ''}</p>` +
      (review.items.some(i => i.action !== 'skip' && toCheck(i.client)) ? '<p class="small muted">Details marked Check are saved as they are. You can still fix them before filling a form.</p>' : '');
    if (!await confirmBox('Save these clients?', body, 'Save')) return;
    const saved = [];
    for (const it of adds) { await S.put('clients', it.client); clients.push(it.client); saved.push(it.client); }
    for (const it of ups) {
      const old = it.dup;
      for (const [k] of P.FIELDS) {
        const nv = it.client.fields[k], ov = old.fields[k];
        if (nv.status !== 'missing' && (nv.value !== ov.value || ov.status === 'missing')) old.fields[k] = nv; // same value: keep the earlier (maybe confirmed) one
      }
      old.source = it.client.source; old.updated = new Date().toISOString();
      await S.put('clients', old); saved.push(old);
    }
    clients.sort((a, b) => a.fields.name.value.localeCompare(b.fields.name.value));
    review = null; renderReview(); renderClients();
    toast(`Saved ${saved.length} client${saved.length > 1 ? 's' : ''}.`);
    const t = tplById(settings.autoFill);
    if (t && saved.length) { showTab('fill'); $('#fillForm').value = t.id; fillPicked = new Set(saved.map(c => c.id)); renderFillPick(); startPreview(); }
  };

  async function editClient(c, isSaved) {
    const rows = P.FIELDS.map(([k, lab]) => {
      const v = c.fields[k];
      return `<div class="lab">${esc(lab)} ${v.status !== 'ok' ? chip(v.status) : ''}</div><div><input type="text" data-k="${k}" value="${esc(v.value)}">${v.note ? `<div class="small muted">${esc(v.note)}</div>` : ''}</div>`;
    }).join('');
    const ok = await dialog(`<h2>${esc(c.fields.name.value || 'Client')}</h2><p class="small muted">Fix or confirm any detail. Saving marks what you typed as checked.</p><div class="ef" style="margin-top:10px">${rows}</div>`,
      [{ label: 'Cancel', value: false }, { label: isSaved ? 'Save changes' : 'Done', value: true, cls: 'pri' }]);
    if (!ok) return false;
    // Values must be read before the dialog content is replaced; dialog() resolves after close, inputs still exist.
    $$('#dlgBody input[data-k]').forEach(inp => {
      const k = inp.dataset.k, v = c.fields[k], nv = inp.value.trim();
      if (nv === v.value && v.status !== 'check') return;
      if (!nv) c.fields[k] = { value: '', status: 'missing', note: '' };
      else c.fields[k] = { value: nv, status: 'ok', note: nv === v.value ? 'Confirmed by you.' : 'Typed by you.' };
    });
    if (isSaved) { c.updated = new Date().toISOString(); await S.put('clients', c); }
    return true;
  }

  function renderClients() {
    const q = $('#clientSearch').value.trim().toLowerCase();
    const list = clients.filter(c => !q || [c.fields.name.value, c.fields.nric.value, c.fields.policyNo.value, c.fields.company.value, c.fields.phone.value].join(' ').toLowerCase().includes(q));
    $('#clientCount').textContent = clients.length ? `(${clients.length})` : '';
    $('#clearAll').hidden = !clients.length;
    $('#clientTable').innerHTML = !clients.length ? '<tr><td class="empty">No clients yet. Drop a file above to start.</td></tr>'
      : `<thead><tr><th>Name</th>${COLS.map(k => `<th>${esc(LABEL[k])}</th>`).join('')}<th></th></tr></thead><tbody>` +
      list.map(c => `<tr><td><b>${esc(c.fields.name.value || '(no name)')}</b>${toCheck(c) ? ` <span class="chip check">${toCheck(c)} to check</span>` : ''}<span class="nt small muted">${esc(c.source)}</span></td>${COLS.map(k => cell(c, k)).join('')}
        <td style="white-space:nowrap"><button class="btn sm cedit" data-id="${c.id}">Edit</button> <button class="btn sm danger cdel" data-id="${c.id}" aria-label="Delete">✕</button></td></tr>`).join('') + '</tbody>';
    $$('.cedit').forEach(b => b.onclick = async () => { const c = clients.find(x => x.id === b.dataset.id); if (await editClient(c, true)) { renderClients(); toast('Saved.'); } });
    $$('.cdel').forEach(b => b.onclick = async () => {
      const c = clients.find(x => x.id === b.dataset.id);
      if (!await confirmBox('Delete this client?', `<p><b>${esc(c.fields.name.value)}</b> ${esc(c.fields.policyNo.value)} will be removed from this device. Forms you already downloaded are not affected.</p>`, 'Delete', true)) return;
      await S.del('clients', c.id); clients = clients.filter(x => x !== c); renderClients(); toast('Deleted.');
    });
  }
  $('#clientSearch').oninput = renderClients;
  $('#clearAll').onclick = async () => {
    if (!await confirmBox('Clear all clients?', `<p>All <b>${clients.length}</b> clients will be removed from this device. This can't be undone. Your forms stay.</p>`, 'Clear all', true)) return;
    await S.clear('clients'); clients = []; renderClients(); toast('All clients cleared.');
  };
  $('#tplXlsx').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Customer Name', 'NRIC', 'Company', 'Birthday', 'Phone', 'Email', 'Account Manager', 'Policy No']]);
    ws['!cols'] = [28, 16, 24, 12, 14, 26, 20, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, 'W2G AutoFill - client list template.xlsx');
  };

  // =====================================================================
  // 2 · FORMS
  // =====================================================================
  function renderForms() {
    $('#formsHome').hidden = !$('#builder').hidden;
    $('#formTable').innerHTML = `<thead><tr><th>Form</th><th>Fields</th><th></th></tr></thead><tbody>` + allTemplates().map(t => `<tr>
      <td><b>${esc(t.name)}</b>${t.builtin ? '<span class="tag">BUILT IN</span>' : ''}</td><td>${t.fields.length}</td>
      <td style="white-space:nowrap"><button class="btn sm fview" data-id="${t.id}">${t.builtin ? 'View layout' : 'Edit'}</button>
      <button class="btn sm fexp" data-id="${t.id}">Export</button>${t.builtin ? '' : ` <button class="btn sm danger fdel" data-id="${t.id}" aria-label="Delete">✕</button>`}</td></tr>`).join('') + '</tbody>';
    $$('.fview').forEach(b => b.onclick = () => openBuilder(tplById(b.dataset.id)));
    $$('.fexp').forEach(b => b.onclick = () => {
      const t = tplById(b.dataset.id);
      const json = JSON.stringify({ w2gTemplate: 1, name: t.name, fields: t.fields, pdf: bytesToB64(tplBytes(t)) });
      download(new TextEncoder().encode(json), safeName(t.name) + '.w2g.json', 'application/json');
    });
    $$('.fdel').forEach(b => b.onclick = async () => {
      const t = tplById(b.dataset.id);
      if (!await confirmBox('Delete this form?', `<p><b>${esc(t.name)}</b> and its layout will be removed from this device. Your clients stay.</p>`, 'Delete', true)) return;
      await S.del('templates', t.id); custom = custom.filter(x => x.id !== t.id); renderForms(); renderAutoFill(); toast('Form deleted.');
    });
  }
  $('#newForm').onclick = () => $('#newFormIn').click();
  $('#newFormIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    openBuilder({ id: 't' + Date.now().toString(36), name: f.name.replace(/\.pdf$/i, ''), pdfBytes: bytes, fields: [], isNew: true });
  };
  $('#importTpl').onclick = () => $('#importIn').click();
  $('#importIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.w2gTemplate || !j.pdf || !Array.isArray(j.fields)) throw new Error('not a W2G template file');
      const same = allTemplates().find(t => t.name === j.name);
      if (same && same.builtin) { toast('That form is already built in.'); return; }
      if (same && !await confirmBox('Replace this form?', `<p>You already have <b>${esc(j.name)}</b>. Replace its layout with the imported one?</p>`, 'Replace')) return;
      const t = { id: same ? same.id : 't' + Date.now().toString(36), name: j.name, short: j.name, pdfBytes: b64ToBytes(j.pdf), fields: j.fields, created: new Date().toISOString() };
      await S.put('templates', t); custom = custom.filter(x => x.id !== t.id).concat(t); renderForms(); renderAutoFill(); toast('Form imported.');
    } catch (err) { dialog(`<h2>Can't import</h2><p>${esc(f.name)} is not a W2G AutoFill template file.</p>`, [{ label: 'OK', value: 1, cls: 'pri' }]); }
  };

  // --- builder ---
  let B = null; // {t, pages, fields, hiRes: {}, readOnly}
  function sourceOptions() {
    return FL.SOURCES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('') + '<option value="fixed">Fixed text (same every time)…</option>';
  }
  $('#bSource').innerHTML = sourceOptions();
  $('#bSource').onchange = () => { $('#bFixed').hidden = $('#bSource').value !== 'fixed'; if ($('#bSource').value === 'muslim') { $('#bKind').value = 'tick'; $('#bKind').onchange(); } };
  $('#bKind').onchange = () => {
    const k = $('#bKind').value; $('#bWhenWrap').hidden = k !== 'tick';
    $('#bHint').textContent = k === 'boxes' ? 'For boxes, drag around the whole row of boxes. The app finds each box itself.' : k === 'tick' ? 'Drag around the tick box.' : 'Drag over the line or box where the text should go.';
  };

  async function openBuilder(t) {
    B = { t, fields: JSON.parse(JSON.stringify(t.fields)), hiRes: {}, readOnly: !!t.builtin };
    $('#builder').hidden = false; $('#formsHome').hidden = true;
    $('#bTitle').textContent = t.builtin ? 'Form layout' : t.isNew ? 'New form' : 'Edit form';
    $('#bName').value = t.name; $('#bName').disabled = B.readOnly;
    $('#bTools').hidden = B.readOnly; $('#bSave').hidden = B.readOnly;
    $('#bMsg').textContent = B.readOnly ? '' : 'Pick what goes here, then drag on the page.';
    $('#bPages').innerHTML = '';
    B.bytes = tplBytes(t);
    B.pages = await renderPages($('#bPages'), B.bytes.slice());
    B.pages.forEach(p => bindDrag(p));
    drawMarks(); updatePageLabel();
    if (B.readOnly) $('#bMsg').textContent = '';
  }
  $('#bClose').onclick = async () => {
    if (B && !B.readOnly && JSON.stringify(B.fields) !== JSON.stringify(B.t.fields) && !await confirmBox('Close without saving?', '<p>The fields you added since the last save will be lost.</p>', 'Close', true)) return;
    B = null; $('#builder').hidden = true; renderForms();
  };
  function updatePageLabel() { $('#bPage').textContent = B ? `${B.pages.length} page${B.pages.length > 1 ? 's' : ''}` : ''; }
  $('#bPrev').onclick = () => jumpPage(-1); $('#bNext').onclick = () => jumpPage(1);
  function jumpPage(d) {
    if (!B) return;
    const cur = B.pages.findIndex(p => p.box.getBoundingClientRect().bottom > 120);
    const t = B.pages[Math.max(0, Math.min(B.pages.length - 1, (cur < 0 ? 0 : cur) + d))];
    t.box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function drawMarks(focusId) {
    for (const p of B.pages) {
      p.ov.innerHTML = '';
      for (const fd of B.fields.filter(f => f.page === p.n)) {
        for (const r of fieldRects(fd)) { const m = document.createElement('div'); m.className = fd.kind === 'text' ? 'textmark' : 'cellmark'; place(m, toPx(p, r)); p.ov.appendChild(m); }
        const r0 = toPx(p, fieldRects(fd)[0]); const lab = document.createElement('div'); lab.className = 'marklabel'; lab.textContent = fd.label;
        lab.style.left = r0.left + '%'; lab.style.top = r0.top + '%'; if (fd.id === focusId) lab.style.background = '#3B6FD8'; p.ov.appendChild(lab);
      }
    }
    $('#bCount').textContent = `(${B.fields.length})`;
    $('#bFields').innerHTML = B.fields.length ? B.fields.map((fd, i) => `<div class="fitem ${fd.id === focusId ? 'focus' : ''}"><div class="top"><span>${esc(fd.label)}</span><span class="small muted">p.${fd.page} · ${fd.kind === 'boxes' ? fd.cells.length + ' boxes' : fd.kind}${B.readOnly ? '' : ` <button class="btn sm danger bdel" data-i="${i}" aria-label="Remove">✕</button>`}</span></div></div>`).join('')
      : '<p class="small muted">No fields yet.</p>';
    $$('.bdel').forEach(b => b.onclick = () => { B.fields.splice(+b.dataset.i, 1); drawMarks(); });
  }

  // Grayscale copy of a page at 3× for finding boxes (made once per page).
  async function hiRes(p) {
    if (B.hiRes[p.n]) return B.hiRes[p.n];
    const SC = 3, vp = p.pg.getViewport({ scale: SC });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await p.pg.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
    return (B.hiRes[p.n] = { g: W2GBoxes.toGray(ctx.getImageData(0, 0, c.width, c.height)), W: c.width, H: c.height, SC });
  }

  function bindDrag(p) {
    let start = null, sel = null;
    const pos = e => { const r = p.ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    p.ov.style.touchAction = 'none'; p.box.classList.add('add');
    p.ov.onpointerdown = e => {
      if (!B || B.readOnly) return;
      start = pos(e); p.ov.setPointerCapture(e.pointerId);
      sel = document.createElement('div'); sel.className = 'sel'; p.ov.appendChild(sel);
    };
    p.ov.onpointermove = e => {
      if (!start) return; const q = pos(e);
      place(sel, { left: Math.min(start.x, q.x), top: Math.min(start.y, q.y), width: Math.abs(q.x - start.x), height: Math.abs(q.y - start.y) }, 'px');
    };
    p.ov.onpointerup = async e => {
      if (!start) return; const q = pos(e), s = start; start = null; sel.remove();
      const L = Math.min(s.x, q.x), T = Math.min(s.y, q.y), Wd = Math.abs(q.x - s.x), Ht = Math.abs(q.y - s.y);
      if (Wd < 6 || Ht < 6) { $('#bMsg').textContent = 'Drag a box over the space (press, move, release).'; return; }
      await addField(p, L, T, Wd, Ht);
    };
  }

  async function addField(p, L, T, Wd, Ht) {
    let source = $('#bSource').value, kind = $('#bKind').value;
    if (source === 'fixed') { const v = $('#bFixed').value.trim(); if (!v) { $('#bMsg').textContent = 'Type the fixed text first.'; return; } source = 'fixed:' + v; }
    const label = source.startsWith('fixed:') ? `"${source.slice(6)}"` : SRC_LABEL[source];
    const a = toPt(p, L, T + Ht), b = toPt(p, L + Wd, T); // bottom-left, top-right in points
    const rect = [a.x, a.y, b.x - a.x, b.y - a.y].map(v => +v.toFixed(1));
    const fd = { id: 'f' + Date.now().toString(36), label, page: p.n, kind, source };
    if (kind === 'text') fd.rect = rect;
    else {
      const H = await hiRes(p);
      const k = H.SC / shown(p);
      const cells = W2GBoxes.detectCells(H.g, H.W, H.H, { x: L * k, y: T * k, w: Wd * k, h: Ht * k })
        .map(c => [c.x / H.SC, p.hPt - (c.y + c.h) / H.SC, c.w / H.SC, c.h / H.SC].map(v => +v.toFixed(1)));
      if (kind === 'boxes') {
        if (!cells.length) { $('#bMsg').textContent = 'No boxes found there. Drag around the boxes only, or choose "Normal text".'; return; }
        fd.cells = cells;
      } else {
        fd.when = $('#bWhen').value.trim() || 'Yes';
        fd.cells = cells.length ? [cells[0]] : [[+(rect[0] + rect[2] / 2 - 4).toFixed(1), +(rect[1] + rect[3] / 2 - 4).toFixed(1), 8, 8]];
        fd.label = `${label} = ${fd.when}`;
      }
    }
    B.fields.push(fd);
    $('#bMsg').textContent = kind === 'boxes' ? `Found ${fd.cells.length} boxes for ${label}.` : `Added ${fd.label}.`;
    drawMarks(fd.id);
  }

  $('#bSave').onclick = async () => {
    const name = $('#bName').value.trim();
    if (!name) { $('#bMsg').textContent = 'Give the form a name first.'; $('#bName').focus(); return; }
    if (!B.fields.length) { $('#bMsg').textContent = 'Add at least one field first.'; return; }
    const same = allTemplates().find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== B.t.id);
    if (same && same.builtin) { $('#bMsg').textContent = 'That name is used by a built-in form. Pick another name.'; return; }
    if (same && !await confirmBox('Replace this form?', `<p>You already have a form called <b>${esc(name)}</b>. Replace it with this one?</p>`, 'Replace')) return;
    if (!B.t.isNew && !same && !await confirmBox('Save changes to this form?', `<p>The layout of <b>${esc(name)}</b> will be updated. Forms you already downloaded are not affected.</p>`, 'Save')) return;
    const t = { id: same ? same.id : B.t.id, name, short: name, pdfBytes: B.bytes, fields: B.fields, created: B.t.created || new Date().toISOString() };
    if (same) { await S.del('templates', B.t.id); custom = custom.filter(x => x.id !== B.t.id); }
    await S.put('templates', t); custom = custom.filter(x => x.id !== t.id).concat(t);
    B.t = t; toast('Form saved.'); renderAutoFill();
    B = null; $('#builder').hidden = true; renderForms();
  };

  // =====================================================================
  // 3 · FILL & DOWNLOAD
  // =====================================================================
  let fillPicked = new Set();
  function renderFillPick() {
    const sel = $('#fillForm'), cur = sel.value;
    sel.innerHTML = allTemplates().map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    if (tplById(cur)) sel.value = cur;
    const q = $('#fillSearch').value.trim().toLowerCase();
    const list = clients.filter(c => !q || [c.fields.name.value, c.fields.nric.value, c.fields.policyNo.value].join(' ').toLowerCase().includes(q));
    $('#fillClients').innerHTML = !clients.length ? '<div class="empty">No clients yet. Add some in step 1.</div>'
      : list.map(c => `<label><input type="checkbox" data-id="${c.id}" ${fillPicked.has(c.id) ? 'checked' : ''}><span style="flex:1"><b>${esc(c.fields.name.value)}</b> <span class="small muted">${esc(c.fields.nric.value)} · ${esc(c.fields.policyNo.value || 'no policy no.')}${c.fields.plan.value ? ' · ' + esc(c.fields.plan.value) : ''}</span></span>${c.fields.policyStatus.status === 'check' ? `<span class="chip check">${esc(c.fields.policyStatus.value)}</span>` : ''}</label>`).join('');
    $$('#fillClients input').forEach(i => i.onchange = () => { i.checked ? fillPicked.add(i.dataset.id) : fillPicked.delete(i.dataset.id); updatePickCount(); });
    updatePickCount();
  }
  function updatePickCount() {
    fillPicked = new Set([...fillPicked].filter(id => clients.some(c => c.id === id)));
    $('#fillSel').textContent = fillPicked.size ? `${fillPicked.size} client${fillPicked.size > 1 ? 's' : ''} selected` : 'Tick one or more clients';
    $('#fillGo').disabled = !fillPicked.size;
  }
  $('#fillSearch').oninput = renderFillPick;
  $('#fillGo').onclick = () => startPreview();

  let V = null; // {t, queue, idx, groups, extras, pages, mode, done}
  async function startPreview() {
    const t = tplById($('#fillForm').value);
    const queue = clients.filter(c => fillPicked.has(c.id));
    if (!t || !queue.length) return;
    const bad = queue.filter(c => c.fields.policyStatus.status === 'check');
    if (bad.length && !await confirmBox('Some policies are not in force', `<p>${bad.map(c => `<b>${esc(c.fields.name.value)}</b>: ${esc(c.fields.policyStatus.value)}`).join('<br>')}</p><p>Fill the form for them anyway?</p>`, 'Fill anyway')) return;
    V = { t, queue, idx: 0, done: new Set(), mode: 'edit' };
    $('#pick').hidden = true; $('#preview').hidden = false; $('#pvPages').innerHTML = ''; V.pages = null;
    loadClient();
  }
  $('#pvBack').onclick = () => { V = null; $('#preview').hidden = true; $('#pick').hidden = false; renderFillPick(); };

  // Fields that share a source (e.g. the policy no. on 5 pages) are edited once.
  function loadClient() {
    const c = V.queue[V.idx];
    const vals = FL.resolve(V.t, c, new Date());
    const groups = [];
    for (const fd of V.t.fields) {
      let g = groups.find(g => g.source === fd.source);
      if (!g) { g = { source: fd.source, fields: [], ...vals[fd.id], label: fd.label.replace(/\s*\((page|p\.)\s*\d+\)/i, '').replace(/\s*=\s*.*$/, '').replace(/^Muslim\? (Yes|No)$/, 'Are you a Muslim?') }; groups.push(g); }
      g.fields.push(fd);
    }
    V.groups = groups; V.extras = []; V.issues = {};
    $('#pvChecked').checked = false;
    renderPreviewSide(); refresh();
  }
  const groupValue = g => (g.fields.some(f => f.kind === 'boxes') ? g.value.toUpperCase() : g.value);

  function renderPreviewSide() {
    const c = V.queue[V.idx];
    $('#pvTitle').textContent = V.t.short || V.t.name;
    $('#pvNav').innerHTML = V.queue.length > 1
      ? V.queue.map((q, i) => `<button class="btn sm ${i === V.idx ? 'on' : ''} pvc" data-i="${i}">${V.done.has(i) ? '✓ ' : ''}${esc(q.fields.name.value)}</button>`).join('')
      : `<b>${esc(c.fields.name.value)}</b>&nbsp;<span class="muted">${esc(c.fields.policyNo.value)}</span>`;
    $$('.pvc').forEach(b => b.onclick = () => { V.idx = +b.dataset.i; loadClient(); });
    $('#pvFields').innerHTML = V.groups.map((g, i) => {
      const places = g.fields.length > 1 ? ` <span class="muted small">· ${g.fields.length} places</span>` : '';
      const input = g.fields.every(f => f.kind === 'tick')
        ? `<select data-g="${i}">${['', ...new Set(g.fields.map(f => f.when || 'Yes'))].map(o => `<option ${o === g.value ? 'selected' : ''} value="${esc(o)}">${o ? esc(o) : '(leave blank)'}</option>`).join('')}</select>`
        : `<input type="text" data-g="${i}" value="${esc(g.value)}">`;
      return `<div class="fitem" id="pvg${i}"><div class="top"><span>${esc(g.label)}${places}</span><span class="st"></span></div>${input}<div class="nt"></div></div>`;
    }).join('');
    $$('#pvFields [data-g]').forEach(inp => {
      inp.oninput = inp.onchange = () => {
        const g = V.groups[+inp.dataset.g]; if (g.value === inp.value) return;
        g.value = inp.value; g.status = inp.value ? 'ok' : 'missing'; g.note = inp.value ? 'Changed by you (this form only).' : '';
        uncheck(); updateStatuses(); refreshSoon();
      };
    });
    updateStatuses();
    $('#pvExtras').innerHTML = V.extras.length ? `<h3 style="margin-top:12px">Added on the page</h3>` + V.extras.map((e, i) => `<div class="fitem"><div class="top"><span>${e.tick ? '✓ tick' : esc(e.text)} <span class="muted small">· p.${e.page}</span></span><button class="btn sm danger xdel" data-i="${i}" aria-label="Remove">✕</button></div></div>`).join('') : '';
    $$('.xdel').forEach(b => b.onclick = () => { V.extras.splice(+b.dataset.i, 1); uncheck(); renderPreviewSide(); refresh(); });
    $('#pvNext').hidden = !(V.queue.length > 1 && V.idx < V.queue.length - 1);
    updateDownload();
  }
  // Chips, notes and the summary, updated in place so typing is never interrupted.
  function updateStatuses() {
    const c = V.queue[V.idx];
    const by = { toolong: [], check: [], missing: [] };
    V.groups.forEach((g, i) => {
      const issue = g.fields.map(f => V.issues[f.id]).find(Boolean);
      const st = issue ? 'toolong' : g.value ? g.status : 'missing';
      if (by[st]) by[st].push(g.label);
      const el = $('#pvg' + i); if (!el) return;
      el.querySelector('.st').innerHTML = chip(st);
      const nt = el.querySelector('.nt');
      nt.className = 'nt' + (issue ? ' bad' : '');
      nt.textContent = issue || g.note || (!g.value ? 'Not in the client file, so left blank. Type it here if you have it.' : '');
    });
    $('#pvWarn').innerHTML = (c.fields.policyStatus.status === 'check' ? `<div class="err">⚠ Policy status: ${esc(c.fields.policyStatus.value)}</div>` : '') +
      (by.toolong.length || by.check.length || by.missing.length
        ? `<div class="notes">${[['toolong', 'Fix'], ['check', 'Check'], ['missing', 'Left blank']].filter(([k]) => by[k].length).map(([k, t]) => `<div><span class="chip ${k}">${t}</span> ${esc(by[k].join(', '))}</div>`).join('')}</div>`
        : '<div class="notes"><span class="chip ok">All OK</span> Every field was read cleanly.</div>');
  }
  function uncheck() { if ($('#pvChecked').checked) { $('#pvChecked').checked = false; updateDownload(); } }
  function updateDownload() { $('#pvDownload').disabled = !$('#pvChecked').checked || V.busy; }
  $('#pvChecked').onchange = updateDownload;

  let refreshTimer = null;
  const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 350); };
  async function build() {
    const values = {};
    for (const g of V.groups) for (const f of g.fields) values[f.id] = groupValue(g);
    return FL.fill(tplBytes(V.t), V.t, values, V.extras, PDFLib);
  }
  async function refresh() {
    if (!V) return;
    const seq = (V.seq = (V.seq || 0) + 1);
    V.busy = true; updateDownload();
    const { bytes, issues } = await build();
    if (seq !== V.seq) return;
    V.issues = issues; updateStatuses();
    V.pages = await renderPages($('#pvPages'), bytes, V.pages);
    V.busy = false; updateDownload();
    for (const p of V.pages) bindPreviewClicks(p);
  }

  $$('[data-mode]').forEach(b => b.onclick = () => {
    V.mode = b.dataset.mode; $$('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    $('#pvModeHint').textContent = { edit: 'Change any value below, or tap a filled spot on the page to jump to it. Changes apply to this form only.', text: 'Tap the page where the extra text should start (for example an amount).', tick: 'Tap the box on the page you want ticked.' }[V.mode];
    if (V.pages) V.pages.forEach(p => p.box.classList.toggle('add', V.mode !== 'edit'));
  });
  function bindPreviewClicks(p) {
    p.box.classList.toggle('add', V.mode !== 'edit');
    p.ov.onclick = async e => {
      const r = p.ov.getBoundingClientRect(), pt = toPt(p, e.clientX - r.left, e.clientY - r.top);
      if (V.mode === 'edit') {
        const gi = V.groups.findIndex(g => g.fields.some(f => f.page === p.n && fieldRects(f).some(([x, y, w, h]) => pt.x >= x - 2 && pt.x <= x + w + 2 && pt.y >= y - 2 && pt.y <= y + h + 2)));
        if (gi < 0) return;
        const el = $('#pvg' + gi); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $$('.fitem.focus').forEach(x => x.classList.remove('focus')); el.classList.add('focus');
        const inp = el.querySelector('input,select'); inp && inp.focus({ preventScroll: true });
        flash(p, V.groups[gi]);
      } else if (V.mode === 'text') {
        const text = await promptBox('Add text', 'Text to write here (this form only)');
        if (!text || !text.trim()) return;
        V.extras.push({ page: p.n, x: pt.x, y: pt.y, text: text.trim() }); uncheck(); renderPreviewSide(); refresh();
      } else {
        V.extras.push({ page: p.n, x: pt.x, y: pt.y, tick: true }); uncheck(); renderPreviewSide(); refresh();
      }
    };
  }
  function flash(p, g) {
    for (const f of g.fields.filter(f => f.page === p.n)) for (const r of fieldRects(f)) {
      const m = document.createElement('div'); m.className = 'hl'; place(m, toPx(p, r)); p.ov.appendChild(m); setTimeout(() => m.remove(), 1400);
    }
  }

  $('#pvDownload').onclick = async () => {
    const { bytes, issues } = await build();
    if (Object.keys(issues).length) {
      const list = [...new Set(Object.entries(issues).map(([id, msg]) => `<b>${esc(V.t.fields.find(f => f.id === id).label)}</b>: ${esc(msg)}`))].join('<br>');
      if (!await confirmBox('Some fields need fixing', `<p>${list}</p><p>If you download now, long values are cut off at the last box. Download anyway?</p>`, 'Download anyway')) return;
    }
    const c = V.queue[V.idx];
    download(bytes, safeName(`${V.t.short || V.t.name} - ${c.fields.name.value}${c.fields.policyNo.value ? ' - ' + c.fields.policyNo.value : ''}.pdf`));
    V.done.add(V.idx); toast('Downloaded. Check your Downloads folder.');
    renderPreviewSide();
  };
  $('#pvNext').onclick = () => { V.idx++; loadClient(); scrollTo(0, 0); };

  // ---------- clients saved by the previous version (separate storage, left untouched) ----------
  function readOldClients() {
    return new Promise(res => {
      let req;
      try { req = indexedDB.open('w2g-autofill'); } catch (e) { return res([]); }
      req.onupgradeneeded = e => { if (e.oldVersion === 0) req.transaction.abort(); }; // no old data: don't create anything
      req.onerror = () => res([]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clients')) { db.close(); return res([]); }
        const g = db.transaction('clients').objectStore('clients').getAll();
        g.onsuccess = () => { db.close(); res(g.result || []); }; g.onerror = () => { db.close(); res([]); };
      };
    });
  }
  async function offerOldClients() {
    if (settings.oldImported) return;
    const old = (await readOldClients()).filter(r => r && r.fields);
    if (!old.length) return;
    const ans = await dialog(`<h2>Bring over your clients?</h2><p>The previous version of W2G AutoFill has <b>${old.length}</b> saved client${old.length > 1 ? 's' : ''} on this device. Copy them into the new version?</p><p class="small muted">Clients already in the new list are skipped. The old copy is not changed.</p>`,
      [{ label: 'No, start fresh', value: 'no' }, { label: 'Not now', value: null }, { label: 'Bring them over', value: 'yes', cls: 'pri' }]);
    if (!ans) return;
    settings.oldImported = true; await S.put('settings', settings);
    if (ans !== 'yes') return;
    let n = 0;
    for (const r of old) {
      const f = {};
      for (const [k] of P.FIELDS) {
        const v = r.fields[k === 'plan' ? 'planName' : k] || r.fields[k];
        f[k] = v && v.value ? { value: String(v.value), status: v.status === 'ok' ? 'ok' : 'check', note: v.note || '' } : { value: '', status: 'missing', note: '' };
      }
      const c = { id: r.id || 'c' + Date.now().toString(36) + n, fields: f, source: r.source || 'Previous version', added: new Date().toISOString() };
      const k = nricKey(c);
      if (clients.some(x => (k ? nricKey(x) === k : x.fields.name.value === f.name.value) && x.fields.policyNo.value === f.policyNo.value)) continue;
      await S.put('clients', c); clients.push(c); n++;
    }
    clients.sort((a, b) => a.fields.name.value.localeCompare(b.fields.name.value));
    renderClients(); toast(`Brought over ${n} client${n === 1 ? '' : 's'}.`);
  }

  // ---------- start ----------
  renderAutoFill(); renderClients(); renderForms();
  offerOldClients();
  if (!(await S.persistent())) toast('Private browsing: clients are kept only until you close this window.', 5000);
  if (!libs.Tesseract) console.info('Picture reading is off when the app is opened as a file.');
  addEventListener('resize', () => { clearTimeout(self._rz); self._rz = setTimeout(() => { if (V && V.pages && !$('#preview').hidden) refresh(); }, 300); });
  window.W2G = { get clients() { return clients; }, get V() { return V; }, readFiles }; // for the test run
})();
