// W2G AutoFill - app screens. Client files are read in the browser; nothing leaves the device.
(function () {
  'use strict';
  const P = W2GParse, FL = W2GFill, S = W2GStore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const here = p => new URL(p, location.href).href;

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  const state = { clients: [], templates: [], tab: 'clients' };

  // ---------- small UI helpers ----------
  function toast(msg, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2600); }
  function modal(html, onMount) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
    document.body.appendChild(m); const close = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) close(); });
    if (onMount) onMount(m.querySelector('.box'), close);
    return close;
  }
  function confirmBox(title, body, okLabel, danger) {
    return new Promise(res => modal(`<h2>${esc(title)}</h2><p>${body}</p><div class="foot"><button class="btn" data-x>Cancel</button><button class="btn ${danger ? 'dark' : 'primary'}" data-ok>${esc(okLabel || 'OK')}</button></div>`,
      (b, close) => { b.querySelector('[data-x]').onclick = () => { close(); res(false); }; b.querySelector('[data-ok]').onclick = () => { close(); res(true); }; }));
  }
  const chip = (status, text) => `<span class="chip ${status}">${esc(text || { ok: 'OK', check: 'Check', missing: 'Missing', overflow: 'Too long', blank: 'Blank' }[status] || status)}</span>`;
  function counts(rec) {
    let check = 0, missing = 0;
    for (const f of P.FIELDS) { const v = rec.fields[f.key]; if (!v) continue; if (v.status === 'check') check++; if (v.status === 'missing' && f.required) missing++; }
    return { check, missing };
  }
  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

  // ---------- tabs ----------
  function showTab(t) {
    state.tab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const id of ['clients', 'forms', 'fill', 'guide']) $('#tab-' + id).hidden = id !== t;
    if (t === 'fill') renderFill();
    if (t === 'forms' && $('#designerView').hidden) renderTemplates();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // ================= 1. CLIENTS =================
  async function loadClients() { state.clients = (await S.all('clients')).sort((a, b) => (a.fields.name.value || '').localeCompare(b.fields.name.value || '')); renderClients(); }

  function renderClients() {
    const q = ($('#clientSearch').value || '').toLowerCase();
    const list = state.clients.filter(c => !q || ['name', 'nric', 'policyNo', 'company', 'email'].some(k => (c.fields[k].value || '').toLowerCase().includes(q)));
    $('#clientCount').textContent = state.clients.length ? `(${state.clients.length})` : '';
    $('#clientRows').innerHTML = list.length ? list.map(c => {
      const n = counts(c), F = c.fields;
      const st = !n.check && !n.missing ? chip('ok', 'All good') : (n.missing ? chip('missing', n.missing + ' missing') + ' ' : '') + (n.check ? chip('check', n.check + ' to check') : '');
      return `<tr class="clientrow" data-id="${c.id}"><td><b>${esc(F.name.value || '(no name)')}</b><br><small class="hint">${esc(c.source)}</small></td><td class="hide-sm">${esc(F.nric.value)}</td><td>${esc(F.policyNo.value)}</td><td class="hide-sm">${esc(F.accountManager.value)}</td><td>${st}</td><td class="hide-sm"><button class="btn small">Open</button></td></tr>`;
    }).join('') : `<tr><td colspan="6" class="empty">${state.clients.length ? 'No match.' : 'No clients yet — add a file above.'}</td></tr>`;
    $('#clientRows').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editClient(state.clients.find(c => c.id === tr.dataset.id)));
  }
  $('#clientSearch').oninput = renderClients;

  function fieldInputs(rec) {
    const nCheck = P.FIELDS.filter(f => rec.fields[f.key] && rec.fields[f.key].status === 'check').length;
    const bar = nCheck > 1 ? `<div class="row" style="margin-bottom:10px;background:var(--checkbg);padding:8px 10px;border-radius:8px"><span class="grow">${nCheck} details need a quick look. Compare them with the source, then:</span><button class="btn small" data-okall>All look right</button></div>` : '';
    return bar + `<div class="fields">${P.FIELDS.map(f => {
      const v = rec.fields[f.key] || { value: '', status: 'missing' };
      const showMissing = v.status === 'missing' && f.required;
      const cls = v.status === 'check' ? 'check' : showMissing ? 'missing' : '';
      return `<div class="fld ${cls}" data-k="${f.key}"><label><span>${esc(f.label)}</span>${v.status === 'check' ? chip('check') : showMissing ? chip('missing') : ''}</label>
        <input type="text" value="${esc(v.value)}" data-k="${f.key}">
        ${v.status === 'check' ? `<div class="note">${esc(v.note || 'Please confirm')} <button class="btn small" data-ok="${f.key}">Looks right</button></div>` : showMissing ? '<div class="note missing">Not in the file — will be left blank on forms</div>' : v.note ? `<div class="note" style="color:var(--good)">${esc(v.note)}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }
  // reads edits back into the record: anything you type yourself counts as confirmed
  function readInputs(box, rec) {
    box.querySelectorAll('input[data-k]').forEach(inp => {
      const k = inp.dataset.k, cur = rec.fields[k], val = inp.value.trim();
      if (val === (cur.value || '')) return;
      rec.fields[k] = val ? { value: val, status: 'ok', note: 'Edited by you' } : { value: '', status: 'missing' };
    });
    P.crossCheck(rec);
  }
  function bindOk(box, rec, rerender) {
    box.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => { readInputs(box, rec); const f = rec.fields[b.dataset.ok]; f.status = 'ok'; f.note = 'Confirmed by you'; rerender(); });
    const all = box.querySelector('[data-okall]');
    if (all) all.onclick = () => { readInputs(box, rec); for (const k in rec.fields) if (rec.fields[k].status === 'check') { rec.fields[k].status = 'ok'; rec.fields[k].note = 'Confirmed by you'; } rerender(); };
  }

  function editClient(rec, isNew) {
    rec = JSON.parse(JSON.stringify(rec));
    modal(`<h2>${isNew ? 'New client' : esc(rec.fields.name.value || 'Client')}</h2><p class="hint">From: ${esc(rec.source)}. Amber = please confirm, red = missing (stays blank on forms).</p><div id="ef"></div>
      <div class="foot">${isNew ? '' : '<button class="btn danger" data-del>Delete client</button><span class="grow"></span>'}<button class="btn" data-x>Cancel</button><button class="btn primary" data-save>Save</button></div>`, (b, close) => {
      const draw = () => { b.querySelector('#ef').innerHTML = fieldInputs(rec); bindOk(b, rec, draw); };
      draw();
      b.querySelector('[data-x]').onclick = close;
      b.querySelector('[data-save]').onclick = async () => { readInputs(b, rec); await S.put('clients', rec); close(); toast('Client saved'); loadClients(); };
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (await confirmBox('Delete this client?', `<b>${esc(rec.fields.name.value)}</b> will be removed from this device. This cannot be undone.`, 'Delete', true)) { await S.del('clients', rec.id); close(); toast('Client deleted'); loadClients(); } };
    });
  }
  $('#addManual').onclick = () => editClient(P.makeRecord({}, 'Typed in by you'), true);
  $('#clearClients').onclick = async () => {
    if (!state.clients.length) return;
    if (await confirmBox('Remove all clients?', `All ${state.clients.length} client records will be deleted from this device. Your form templates are kept. This cannot be undone.`, 'Delete all', true)) { await S.clear('clients'); loadClients(); toast('All client data removed'); }
  };

  // ---- reading files ----
  const logLine = (html) => { const d = document.createElement('div'); d.innerHTML = html; $('#importLog').appendChild(d); return d; };

  async function pdfLines(data, onOcr) {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    let items = [], off = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p), vp = page.getViewport({ scale: 1 });
      (await page.getTextContent()).items.forEach(i => items.push({ s: i.str, x: i.transform[4], y: off + vp.height - i.transform[5], w: i.width }));
      off += vp.height + 20;
    }
    if (items.filter(i => i.s.trim()).length > 5) return P.toLines(items);
    // scanned PDF: no text layer -> read the page pictures
    onOcr && onOcr();
    let lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
      const page = await doc.getPage(p), vp = page.getViewport({ scale: 2.5 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise;
      lines = lines.concat(await ocrLines(c, p * 100000));
    }
    return lines;
  }

  let ocrWorker = null;
  async function getOcr() {
    if (!ocrWorker) {
      if (location.protocol === 'file:') throw new Error('Reading pictures needs the app opened with "Start W2G AutoFill" or from the web link (not by double-clicking index.html).');
      ocrWorker = await Tesseract.createWorker('eng', 1, { workerPath: here('lib/worker.min.js'), corePath: here('lib/tess-core'), langPath: here('lib/tess-lang'), workerBlobURL: false, gzip: true });
    }
    return ocrWorker;
  }
  // Whitens long straight lines (table borders) so OCR reads the text between them cleanly
  function removeLines(canvas) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, im = g.getImageData(0, 0, W, H), d = im.data;
    const dark = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) dark[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11 < 205 ? 1 : 0;
    const minRun = Math.max(60, Math.round(W * 0.06)), kill = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let s = -1; for (let x = 0; x <= W; x++) { const v = x < W && dark[y * W + x]; if (v && s < 0) s = x; if (!v && s >= 0) { if (x - s >= minRun) for (let k = s; k < x; k++) kill[y * W + k] = 1; s = -1; } } }
    for (let x = 0; x < W; x++) { let s = -1; for (let y = 0; y <= H; y++) { const v = y < H && dark[y * W + x]; if (v && s < 0) s = y; if (!v && s >= 0) { if (y - s >= minRun * 0.5) for (let k = s; k < y; k++) kill[k * W + x] = 1; s = -1; } } }
    for (let i = 0; i < W * H; i++) if (kill[i]) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; }
    g.putImageData(im, 0, 0);
    return canvas;
  }
  async function ocrLines(image, yOff) {
    const w = await getOcr();
    const { data } = await w.recognize(removeLines(image));
    const items = [];
    // words close together belong to one cell ("Mobile No"); a wide gap starts the next column
    for (const line of data.lines || []) {
      let cur = null;
      for (const wd of line.words) {
        if (wd.confidence < 30 || !wd.text.trim()) continue;
        const cw = (wd.bbox.x1 - wd.bbox.x0) / Math.max(1, wd.text.length);
        if (cur && wd.bbox.x0 - cur.x1 < cw * 1.6) { cur.s += ' ' + wd.text; cur.x1 = wd.bbox.x1; }
        else { cur && items.push(cur); cur = { s: wd.text, x: wd.bbox.x0, x1: wd.bbox.x1, y: (yOff || 0) + (wd.bbox.y0 + wd.bbox.y1) / 2 }; }
      }
      cur && items.push(cur);
    }
    items.forEach(i => { i.w = i.x1 - i.x; delete i.x1; });
    // OCR pixels are ~3x PDF points: scale so the layout helpers' tolerances still fit
    const k = image.width ? 595 / image.width * 1.4 : 1;
    return P.toLines(items.map(i => ({ s: i.s, x: i.x * k, y: i.y * k, w: i.w * k })), 4);
  }
  async function imageToCanvas(file) {
    const bmp = await createImageBitmap(file);
    const k = bmp.width < 1000 ? 3 : bmp.width < 1600 ? 2 : 1; // small screenshots read better when enlarged
    const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }

  async function readClientFile(file) {
    const name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
    const line = logLine(`⏳ Reading <b>${esc(name)}</b>…`);
    try {
      let res;
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        let all = [], err = '', info = [];
        for (const sn of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
          const r = P.parseRows(rows, `${name} · ${sn}`);
          if (r.records.length) { all = all.concat(r.records); info.push({ sheet: sn, header: r.header, map: r.map, rows, headerRow: r.headerRow }); } else err = err || r.error;
        }
        res = { records: all, kind: 'customer list', error: all.length ? '' : err, sheets: info };
      } else if (ext === 'pdf' || file.type === 'application/pdf') {
        const lines = await pdfLines(new Uint8Array(await file.arrayBuffer()), () => { line.innerHTML = `⏳ <b>${esc(name)}</b> is a scanned PDF — reading the text from the picture (first time may take ~20 s)…`; });
        res = P.parseLines(lines, name);
      } else if (/^image\//.test(file.type) || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        line.innerHTML = `⏳ Reading text from picture <b>${esc(name)}</b> (first time may take ~20 s)…`;
        res = P.parseLines(await ocrLines(await imageToCanvas(file)), name);
        res.records.forEach(r => { for (const k in r.fields) if (r.fields[k].status === 'ok' && r.fields[k].value) { r.fields[k].status = 'check'; r.fields[k].note = 'Read from a picture - please confirm'; } });
      } else { line.innerHTML = `⚠️ <b>${esc(name)}</b>: this file type is not supported. Use PDF, Excel, CSV, PNG or JPG.`; return null; }
      res.records.forEach(r => { if (!r.source || r.source === 'ePartner printout') r.source = `${name} (${res.kind})`; });
      line.innerHTML = res.records.length ? `✅ <b>${esc(name)}</b>: found ${res.records.length} client${res.records.length > 1 ? 's' : ''} (${esc(res.kind)})` : `⚠️ <b>${esc(name)}</b>: ${esc(res.error || 'no client details found')}`;
      return Object.assign(res, { file: name });
    } catch (e) {
      console.error(e); line.innerHTML = `❌ <b>${esc(name)}</b>: could not read this file (${esc(e.message || e)})`; return null;
    }
  }

  async function handleClientFiles(files) {
    if (!files.length) return;
    $('#importLog').innerHTML = '';
    const found = [];
    for (const f of files) { const r = await readClientFile(f); if (r && r.records.length) found.push(r); }
    if (found.length) reviewImport(found);
  }

  // Shows what was found and asks before adding / updating anything
  function reviewImport(found) {
    const recs = found.flatMap(r => r.records);
    const sameAs = rec => state.clients.find(c => {
      const a = (rec.fields.nric.value || '').replace(/\D/g, ''), b = (c.fields.nric.value || '').replace(/\D/g, '');
      if (a && b) return a === b && (!rec.fields.policyNo.value || !c.fields.policyNo.value || rec.fields.policyNo.value === c.fields.policyNo.value);
      return rec.fields.name.value && rec.fields.name.value === c.fields.name.value && rec.fields.dob.value === c.fields.dob.value;
    });
    const sheetMaps = found.flatMap(r => r.sheets || []);
    const mapHtml = sheetMaps.map(s => `<p class="hint" style="margin:6px 0">Columns read from <b>${esc(s.sheet)}</b>: ${s.header.map((h, i) => h === '' ? '' : `${esc(h)} → ${s.map[i] ? '<b>' + esc(P.FIELDS.find(f => f.key === s.map[i]).label) + '</b>' : '<i>not used</i>'}`).filter(Boolean).join(' · ')}</p>`).join('');
    modal(`<h2>Found ${recs.length} client${recs.length > 1 ? 's' : ''}</h2>
      <p class="hint">Nothing is saved until you press Add. Open any row to correct it first.</p>${mapHtml}
      <div class="tablewrap"><table><thead><tr><th><input type="checkbox" id="imAll" checked></th><th>Name</th><th>NRIC</th><th>Policy</th><th>Data check</th><th>Already in list?</th></tr></thead><tbody>
      ${recs.map((r, i) => { const n = counts(r), dup = sameAs(r); return `<tr><td><input type="checkbox" data-i="${i}" checked></td><td><a href="#" data-open="${i}"><b>${esc(r.fields.name.value || '(no name)')}</b></a><br><small class="hint">${esc(r.source)}</small></td><td>${esc(r.fields.nric.value)}</td><td>${esc(r.fields.policyNo.value)}</td>
        <td>${!n.check && !n.missing ? chip('ok', 'All good') : (n.missing ? chip('missing', n.missing + ' missing') + ' ' : '') + (n.check ? chip('check', n.check + ' to check') : '')}</td>
        <td>${dup ? `<select data-dup="${i}"><option value="update">Yes – update it</option><option value="new">Add as new</option></select>` : '<span class="hint">New</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn primary" data-add>Add selected</button></div>`, (b, close) => {
      b.querySelector('#imAll').onchange = e => b.querySelectorAll('[data-i]').forEach(c => c.checked = e.target.checked);
      b.querySelectorAll('[data-open]').forEach(a => a.onclick = e => {
        e.preventDefault(); const i = +a.dataset.open, rec = recs[i];
        modal(`<h2>${esc(rec.fields.name.value || 'Client')}</h2><div id="ef2"></div><div class="foot"><button class="btn primary" data-done>Done</button></div>`, (b2, close2) => {
          const draw = () => { b2.querySelector('#ef2').innerHTML = fieldInputs(rec); bindOk(b2, rec, draw); }; draw();
          b2.querySelector('[data-done]').onclick = () => { readInputs(b2, rec); close2(); close(); reviewImport(found); };
        });
      });
      b.querySelector('[data-x]').onclick = close;
      b.querySelector('[data-add]').onclick = async () => {
        const chosen = [...b.querySelectorAll('[data-i]')].filter(c => c.checked).map(c => +c.dataset.i);
        let added = 0, updated = 0;
        for (const i of chosen) {
          const r = recs[i], sel = b.querySelector(`[data-dup="${i}"]`), dup = sameAs(r);
          if (dup && (!sel || sel.value === 'update')) {
            // keep what you confirmed before when the new file has nothing better
            for (const k in r.fields) if (!r.fields[k].value && dup.fields[k] && dup.fields[k].value) r.fields[k] = dup.fields[k];
            r.id = dup.id; updated++;
          } else added++;
          await S.put('clients', r);
        }
        close(); await loadClients();
        toast(`${added} added${updated ? `, ${updated} updated` : ''}`);
      };
    });
  }

  const drop = $('#clientDrop');
  $('#clientFiles').onchange = e => { handleClientFiles([...e.target.files]); e.target.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handleClientFiles([...e.dataTransfer.files]));

  // ================= 2. FORMS =================
  async function loadTemplates() { state.templates = (await S.all('templates')).sort((a, b) => a.name.localeCompare(b.name)); }

  function renderTemplates() {
    $('#tplList').innerHTML = state.templates.length ? state.templates.map(t => `<div class="tplcard"><div class="grow"><b>${esc(t.name)}</b> ${t.builtin ? '<span class="badge">READY-MADE LAYOUT</span>' : ''}<div class="meta">${t.pageCount} page${t.pageCount > 1 ? 's' : ''} · ${t.fields.length} fields · from ${esc(t.fileName || '')}</div></div>
      <button class="btn small primary" data-use="${t.id}">Fill</button><button class="btn small" data-edit="${t.id}">Edit layout</button><button class="btn small" data-exp="${t.id}">Export</button><button class="btn small danger" data-del="${t.id}">Delete</button></div>`).join('')
      : '<div class="empty">No forms yet. Start with “New form from blank PDF”.</div>';
    const T = id => state.templates.find(t => t.id === id);
    $('#tplList').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { $('#fTpl').dataset.want = b.dataset.use; showTab('fill'); });
    $('#tplList').querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => openDesigner(JSON.parse(JSON.stringify(T(b.dataset.edit))), await S.get('pdfs', b.dataset.edit)));
    $('#tplList').querySelectorAll('[data-exp]').forEach(b => b.onclick = async () => {
      const t = T(b.dataset.exp), pdf = await S.get('pdfs', t.id);
      let bin = ''; const u = new Uint8Array(pdf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      download(JSON.stringify({ w2gAutofillTemplate: 1, template: t, pdf: btoa(bin) }), safeName(t.name) + '.w2g-template.json', 'application/json');
      toast('Template file saved — import it on your phone or another PC');
    });
    $('#tplList').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const t = T(b.dataset.del);
      if (await confirmBox('Delete this form template?', `<b>${esc(t.name)}</b> and its layout will be removed. Your clients are not affected. This cannot be undone.`, 'Delete', true)) { await S.del('templates', t.id); await S.del('pdfs', t.id); await loadTemplates(); renderTemplates(); toast('Template deleted'); }
    });
  }

  $('#importTpl').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.w2gAutofillTemplate) throw new Error('not a W2G AutoFill template file');
      const t = j.template, bytes = Uint8Array.from(atob(j.pdf), c => c.charCodeAt(0)).buffer;
      if (state.templates.find(x => x.id === t.id) && !(await confirmBox('Replace existing template?', `You already have <b>${esc(t.name)}</b>. Replace it with the imported one?`, 'Replace'))) return;
      await S.put('pdfs', bytes, t.id); await S.put('templates', t); await loadTemplates(); renderTemplates(); toast('Template imported');
    } catch (err) { toast('Could not import: ' + err.message, 4000); }
  };

  $('#blankPdf').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const bytes = await f.arrayBuffer();
    let doc;
    try { doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; } catch (err) { toast('This PDF could not be opened.', 4000); return; }
    const meta = await doc.getMetadata().catch(() => ({}));
    const title = (meta.info && meta.info.Title) || '';
    const tpl = { id: 't' + Date.now().toString(36), name: f.name.replace(/\.pdf$/i, ''), fileName: f.name, pageCount: doc.numPages, fields: [] };
    const ready = (window.W2G_BUILTIN || []).find(b => b.match.test(f.name) || b.match.test(title));
    if (ready && await confirmBox('Ready-made layout available', `This looks like the <b>${esc(ready.name)}</b> form. Use the ready-made layout? You can still adjust it afterwards.`, 'Use ready-made layout')) {
      tpl.name = ready.name; tpl.builtin = ready.key; tpl.fields = JSON.parse(JSON.stringify(ready.fields)).map((x, i) => Object.assign({ id: 'f' + i + Date.now().toString(36) }, x));
    }
    openDesigner(tpl, bytes, doc);
  };

  // ---------- designer ----------
  const D = { tpl: null, bytes: null, doc: null, pages: [], sel: null, mode: 'text', source: 'name' };
  const SCALE = 2.2; // render resolution (px per point) used for box detection

  function sourceOptions(sel) {
    const groups = {}; FL.SOURCES.forEach(s => (groups[s.group] = groups[s.group] || []).push(s));
    return Object.entries(groups).map(([g, list]) => `<optgroup label="${g}">${list.map(s => `<option value="${s.key}" ${s.key === sel ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</optgroup>`).join('');
  }

  async function openDesigner(tpl, bytes, doc) {
    D.tpl = tpl; D.bytes = bytes; D.sel = null;
    D.doc = doc || await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    $('#formsHome').hidden = true; $('#designerView').hidden = false;
    $('#dName').value = tpl.name;
    $('#dSource').innerHTML = sourceOptions(D.source);
    $('#dPreviewClient').innerHTML = '<option value="">— sample text —</option>' + state.clients.map(c => `<option value="${c.id}">${esc(c.fields.name.value)}</option>`).join('');
    const wrap = $('#dPages'); wrap.innerHTML = '<div class="empty">Loading pages…</div>';
    D.pages = [];
    for (let p = 1; p <= D.doc.numPages; p++) {
      const page = await D.doc.getPage(p), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: SCALE });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise;
      D.pages.push({ w: vp1.width, h: vp1.height, canvas: c, img: null });
    }
    wrap.innerHTML = '';
    D.pages.forEach((pg, i) => {
      const pw = document.createElement('div'); pw.className = 'pagewrap'; pw.style.width = Math.min(900, pg.w * 1.5) + 'px';
      pw.appendChild(pg.canvas);
      const ov = document.createElement('div'); ov.className = 'ov'; ov.dataset.p = i; pw.appendChild(ov);
      const no = document.createElement('div'); no.className = 'pno'; no.textContent = 'Page ' + (i + 1); pw.appendChild(no);
      wrap.appendChild(pw); pg.ov = ov; bindDraw(ov, i);
    });
    // fields from a ready-made layout: find their boxes on this PDF
    for (const f of D.tpl.fields) if (f.mode === 'boxes' && !(f.cells && f.cells.length)) f.cells = detect(f);
    drawFields(); renderSel();
  }

  function pageImg(i) { const pg = D.pages[i]; if (!pg.img) pg.img = pg.canvas.getContext('2d').getImageData(0, 0, pg.canvas.width, pg.canvas.height); return pg.img; }
  function detect(f) { return FL.detectCells(pageImg(f.page), SCALE, f); }

  function bindDraw(ov, pi) {
    let start = null, box = null;
    const pt = e => { const r = ov.getBoundingClientRect(), pg = D.pages[pi]; return { x: (e.clientX - r.left) / r.width * pg.w, y: (e.clientY - r.top) / r.height * pg.h, r }; };
    ov.addEventListener('pointerdown', e => {
      if (e.target.closest('.fbox')) return; // clicking a field selects it
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      start = pt(e); ov.setPointerCapture(e.pointerId);
      box = document.createElement('div'); box.className = 'drawing'; ov.appendChild(box);
      e.preventDefault();
    });
    ov.addEventListener('pointermove', e => {
      if (!start) return; const p = pt(e), pg = D.pages[pi];
      const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
      Object.assign(box.style, { left: x / pg.w * 100 + '%', top: y / pg.h * 100 + '%', width: w / pg.w * 100 + '%', height: h / pg.h * 100 + '%' });
    });
    ov.addEventListener('pointerup', e => {
      if (!start) return; const p = pt(e); box.remove();
      const f = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), page: pi, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y), source: $('#dSource').value, mode: D.mode };
      start = null;
      if (f.w < 6 || f.h < 4) { D.sel = null; drawFields(); renderSel(); return; }
      ['x', 'y', 'w', 'h'].forEach(k => f[k] = +f[k].toFixed(2));
      if (f.source === 'custom') f.text = $('#dCustom').value;
      if (f.mode === 'boxes') { f.cells = detect(f); if (!f.cells.length) { f.mode = 'text'; toast('No boxes found there — added as normal text. Try covering the whole row of boxes.', 4000); } else toast(`${f.cells.length} boxes found`); }
      D.tpl.fields.push(f); D.sel = f.id; drawFields(); renderSel();
    });
  }

  function previewRec() { const id = $('#dPreviewClient').value; return id ? state.clients.find(c => c.id === id) : null; }
  function sampleValue(f) {
    const rec = previewRec();
    if (rec || f.source === 'custom' || f.source.startsWith('today')) return FL.valueFor(f, rec || { fields: {} }).value;
    return FL.SOURCE_LABEL[f.source].replace(/\s*\(.*\)|DD\/MM\/YYYY|DDMMYYYY/g, '').trim().toUpperCase();
  }

  function drawFields() {
    D.pages.forEach(pg => pg.ov.querySelectorAll('.fbox').forEach(n => n.remove()));
    for (const f of D.tpl.fields) {
      const pg = D.pages[f.page]; if (!pg) continue;
      const el = document.createElement('div'); el.className = 'fbox' + (f.id === D.sel ? ' sel' : '');
      Object.assign(el.style, { left: f.x / pg.w * 100 + '%', top: f.y / pg.h * 100 + '%', width: f.w / pg.w * 100 + '%', height: f.h / pg.h * 100 + '%' });
      const pxPerPt = pg.ov.getBoundingClientRect().width / pg.w;
      const val = sampleValue(f);
      if (f.mode === 'boxes') {
        const lay = FL.layoutBoxes(f, val);
        const at = new Map(lay.placed.map(p => [p.cell, p.ch]));
        for (const c of f.cells || []) {
          const ce = document.createElement('div'); ce.className = 'cell';
          Object.assign(ce.style, { left: (c.x - f.x) / f.w * 100 + '%', top: (c.y - f.y) / f.h * 100 + '%', width: c.w / f.w * 100 + '%', height: c.h / f.h * 100 + '%', fontSize: Math.min(c.h * 0.62, c.w * 0.95, 11) * pxPerPt + 'px' });
          ce.textContent = at.get(c) || ''; el.appendChild(ce);
        }
        if (lay.overflow) el.style.borderColor = '#c8372d';
      } else {
        const t = document.createElement('div'); t.className = 'txt'; t.textContent = val;
        t.style.fontSize = (f.size || Math.min(10, f.h * 0.72)) * pxPerPt + 'px'; el.appendChild(t);
      }
      const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = (f.source === 'custom' ? 'Fixed: ' + (f.text || '') : FL.SOURCE_LABEL[f.source]) + (f.mode === 'boxes' ? ` · ${(f.cells || []).length} boxes` : '');
      el.appendChild(tag);
      el.onpointerdown = e => { e.stopPropagation(); D.sel = f.id; drawFields(); renderSel(); };
      pg.ov.appendChild(el);
    }
    $('#dCount').textContent = `(${D.tpl.fields.length})`;
    $('#dList').innerHTML = D.tpl.fields.length ? D.tpl.fields.slice().sort((a, b) => a.page - b.page || a.y - b.y).map(f => `<div data-f="${f.id}" class="${f.id === D.sel ? 'sel' : ''}">${esc(f.source === 'custom' ? 'Fixed: ' + (f.text || '') : FL.SOURCE_LABEL[f.source])}<small>p.${f.page + 1}${f.mode === 'boxes' ? ' · boxes' : ''}</small></div>`).join('') : '<p class="hint">None yet.</p>';
    $('#dList').querySelectorAll('[data-f]').forEach(d => d.onclick = () => { D.sel = d.dataset.f; drawFields(); renderSel(); const f = selField(); D.pages[f.page].ov.querySelector('.fbox.sel').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  }
  const selField = () => D.tpl.fields.find(f => f.id === D.sel);

  function renderSel() {
    const f = selField(); $('#dSel').hidden = !f;
    if (!f) return;
    $('#sSource').innerHTML = sourceOptions(f.source);
    $('#sCustomWrap').hidden = f.source !== 'custom'; $('#sCustom').value = f.text || '';
    $('#sMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === f.mode));
    $('#sSize').value = f.size || 0; $('#sSizeV').textContent = f.size ? f.size + ' pt' : 'auto';
    $('#sInfo').textContent = f.mode === 'boxes' ? `${(f.cells || []).length} boxes found on page ${f.page + 1}.` : `Normal text on page ${f.page + 1}. Long values shrink to fit.`;
  }
  $('#dMode').querySelectorAll('button').forEach(b => b.onclick = () => { D.mode = b.dataset.m; $('#dMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#dSource').onchange = () => { D.source = $('#dSource').value; $('#dCustomWrap').hidden = D.source !== 'custom'; };
  $('#sSource').onchange = () => { const f = selField(); f.source = $('#sSource').value; drawFields(); renderSel(); };
  $('#sCustom').oninput = () => { const f = selField(); f.text = $('#sCustom').value; drawFields(); };
  $('#sMode').querySelectorAll('button').forEach(b => b.onclick = () => {
    const f = selField(); f.mode = b.dataset.m;
    if (f.mode === 'boxes') { f.cells = detect(f); if (!f.cells.length) { f.mode = 'text'; toast('No boxes found inside this field.'); } } else delete f.cells;
    drawFields(); renderSel();
  });
  $('#sSize').oninput = () => { const f = selField(); f.size = +$('#sSize').value || undefined; drawFields(); renderSel(); };
  $('#sDel').onclick = () => { D.tpl.fields = D.tpl.fields.filter(f => f.id !== D.sel); D.sel = null; drawFields(); renderSel(); };
  $('#sDup').onclick = () => {
    const f = selField(); let n = 0;
    D.pages.forEach((pg, i) => { if (i === f.page) return; const c = Object.assign({}, f, { id: f.id + 'p' + i, page: i }); delete c.cells; if (c.mode === 'boxes') { c.cells = detect(c); if (!c.cells.length) return; } D.tpl.fields.push(c); n++; });
    drawFields(); toast(n ? `Copied to ${n} other page${n > 1 ? 's' : ''} (only where the same boxes exist)` : 'No matching boxes on the other pages');
  };
  $('#dPreviewClient').onchange = drawFields;
  window.addEventListener('resize', () => { if (!$('#designerView').hidden) drawFields(); });
  document.addEventListener('keydown', e => {
    if ($('#designerView').hidden || !D.sel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const f = selField(), d = e.shiftKey ? 2 : 0.5, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (mv) { e.preventDefault(); f.x += mv[0]; f.y += mv[1]; (f.cells || []).forEach(c => { c.x += mv[0]; c.y += mv[1]; }); drawFields(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); $('#sDel').click(); }
  });
  $('#dBack').onclick = async () => { if (await confirmBox('Leave without saving?', 'Changes to this layout since you last saved will be lost.', 'Leave')) closeDesigner(); };
  function closeDesigner() { $('#designerView').hidden = true; $('#formsHome').hidden = false; renderTemplates(); }
  $('#dSave').onclick = async () => {
    D.tpl.name = $('#dName').value.trim() || D.tpl.name;
    if (!D.tpl.fields.length) { toast('Add at least one field first.'); return; }
    const exists = state.templates.find(t => t.id === D.tpl.id);
    if (exists && !(await confirmBox('Save changes?', `This replaces the saved layout of <b>${esc(D.tpl.name)}</b>.`, 'Save'))) return;
    D.tpl.savedAt = new Date().toISOString();
    await S.put('pdfs', D.bytes, D.tpl.id); await S.put('templates', D.tpl);
    await loadTemplates(); closeDesigner(); toast('Template saved');
  };

  // ================= 3. FILL =================
  const F = { picked: new Set() };
  function renderFill() {
    const want = $('#fTpl').dataset.want || $('#fTpl').value;
    $('#fTpl').innerHTML = state.templates.length ? state.templates.map(t => `<option value="${t.id}" ${t.id === want ? 'selected' : ''}>${esc(t.name)}</option>`).join('') : '<option value="">No forms yet — set one up in step 2</option>';
    delete $('#fTpl').dataset.want;
    const q = ($('#fSearch').value || '').toLowerCase();
    const list = state.clients.filter(c => !q || ['name', 'nric', 'policyNo'].some(k => (c.fields[k].value || '').toLowerCase().includes(q)));
    $('#fClients').innerHTML = list.length ? list.map(c => { const n = counts(c); return `<label class="row" style="padding:7px 10px;border-bottom:1px solid var(--line);gap:8px"><input type="checkbox" data-c="${c.id}" ${F.picked.has(c.id) ? 'checked' : ''}><b>${esc(c.fields.name.value || '(no name)')}</b><span class="hint" style="margin:0">${esc(c.fields.policyNo.value || c.fields.nric.value)}</span><span class="grow"></span>${n.missing ? chip('missing', n.missing + ' missing') : ''}${n.check ? chip('check', n.check + ' to check') : ''}</label>`; }).join('')
      : `<div class="empty">${state.clients.length ? 'No match.' : 'No clients yet — add them in step 1.'}</div>`;
    $('#fClients').querySelectorAll('[data-c]').forEach(cb => cb.onchange = () => { cb.checked ? F.picked.add(cb.dataset.c) : F.picked.delete(cb.dataset.c); selInfo(); });
    selInfo();
  }
  function selInfo() { $('#fSelInfo').textContent = F.picked.size ? `${F.picked.size} client${F.picked.size > 1 ? 's' : ''} selected` : ''; }
  $('#fSearch').oninput = renderFill;
  $('#fAll').onclick = () => { const boxes = [...$('#fClients').querySelectorAll('[data-c]')]; const all = boxes.every(b => b.checked); boxes.forEach(b => { b.checked = !all; !all ? F.picked.add(b.dataset.c) : F.picked.delete(b.dataset.c); }); selInfo(); };

  async function renderPdfPages(bytes, pages) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise, out = [];
    for (const p of pages) {
      const page = await doc.getPage(p + 1), vp = page.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise;
      out.push(c.toDataURL('image/jpeg', 0.85));
    }
    return out;
  }

  $('#fGo').onclick = async () => {
    const tpl = state.templates.find(t => t.id === $('#fTpl').value);
    if (!tpl) { toast('Set up a form first (step 2).'); return; }
    const recs = state.clients.filter(c => F.picked.has(c.id));
    if (!recs.length) { toast('Tick at least one client.'); return; }
    const pdf = await S.get('pdfs', tpl.id);
    const out = $('#fResults'); out.innerHTML = '';
    for (const rec of recs) out.appendChild(await fillCard(tpl, pdf, rec));
    if (recs.length > 1) {
      const bar = document.createElement('div'); bar.className = 'card row';
      bar.innerHTML = `<span class="grow">Download every form you have ticked as checked.</span><button class="btn primary" id="dlAll">Download all checked</button>`;
      out.prepend(bar);
      bar.querySelector('#dlAll').onclick = () => { const btns = [...out.querySelectorAll('[data-dl]:not(:disabled)')]; if (!btns.length) { toast('Tick “I have checked this form” on each one first.'); return; } btns.forEach((b, i) => setTimeout(() => b.click(), i * 400)); };
    }
    out.scrollIntoView({ behavior: 'smooth' });
  };

  async function fillCard(tpl, pdf, rec) {
    const card = document.createElement('div'); card.className = 'card';
    const overrides = {};
    const opts = () => ({ overrides, noDate: !$('#fDate').checked });
    const fileName = safeName(`${tpl.name} - ${rec.fields.name.value || 'client'}`) + '.pdf';
    let bytes = null;
    async function draw() {
      card.innerHTML = `<div class="empty">Filling ${esc(rec.fields.name.value)}…</div>`;
      const rv = await FL.reviewWithFont(PDFLib, tpl, rec, opts());
      bytes = await FL.fillPdf(PDFLib, pdf, tpl, rec, opts());
      const pages = [...new Set(tpl.fields.map(f => f.page))].sort((a, b) => a - b);
      const imgs = await renderPdfPages(bytes, pages);
      const issues = rv.filter(r => r.status !== 'ok' && r.status !== 'blank');
      card.innerHTML = `<div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">${esc(rec.fields.name.value)} <span class="hint">· ${esc(tpl.name)}</span></h2>${issues.length ? chip('check', issues.length + ' need attention') : chip('ok', 'Ready')}</div>
        <div class="fillgrid"><div class="preview">${imgs.map((src, i) => `<img src="${src}" alt="Filled page ${pages[i] + 1}">`).join('')}</div>
        <div><table class="rv"><thead><tr><th>Field</th><th>Value on the form</th><th></th></tr></thead><tbody>
        ${rv.map(r => `<tr><td>${esc(r.label)}<br><small class="hint">page ${r.field.page + 1}</small></td><td><input type="text" data-f="${r.field.id}" value="${esc(r.value)}" placeholder="(left blank)">${r.note ? `<div class="hint" style="margin:2px 0 0;color:${r.status === 'ok' ? 'var(--muted)' : r.status === 'check' ? 'var(--check)' : 'var(--miss)'}">${esc(r.note)}</div>` : ''}</td><td>${chip(r.status)}</td></tr>`).join('')}
        </tbody></table>
        <div class="row" style="margin-top:10px"><button class="btn small" data-upd>Update preview</button></div>
        <div class="card" style="background:var(--soft);border:0;margin:14px 0 0">
          <label class="row" style="gap:8px"><input type="checkbox" data-ok> <b>I have checked this form</b></label>
          <p class="hint" style="margin:6px 0 10px">Signatures, witness and tick-box choices are left blank for the client.</p>
          <div class="row"><button class="btn primary" data-dl disabled>Download PDF</button>${navigator.canShare ? '<button class="btn" data-share disabled>Share…</button>' : ''}</div>
        </div></div></div>`;
      card.querySelector('[data-upd]').onclick = () => { card.querySelectorAll('input[data-f]').forEach(i => { const r = rv.find(x => x.field.id === i.dataset.f); if (i.value !== r.value) overrides[i.dataset.f] = i.value.trim(); }); draw(); };
      card.querySelectorAll('input[data-f]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') card.querySelector('[data-upd]').click(); });
      const ok = card.querySelector('[data-ok]'), dl = card.querySelector('[data-dl]'), sh = card.querySelector('[data-share]');
      ok.onchange = () => {
        const dirty = [...card.querySelectorAll('input[data-f]')].some(i => i.value !== rv.find(x => x.field.id === i.dataset.f).value);
        if (ok.checked && dirty) { ok.checked = false; toast('You changed a value — press “Update preview” first.'); return; }
        dl.disabled = !ok.checked; if (sh) sh.disabled = !ok.checked;
      };
      dl.onclick = () => { download(bytes, fileName); toast('Downloaded ' + fileName); };
      if (sh) sh.onclick = async () => { const file = new File([bytes], fileName, { type: 'application/pdf' }); if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: fileName }).catch(() => {}); else download(bytes, fileName); };
    }
    await draw();
    return card;
  }
  $('#fDate').onchange = () => { if ($('#fResults').children.length) toast('Press “Fill & preview” again to apply.'); };

  // ---------- start ----------
  (async () => {
    await Promise.all([loadClients(), loadTemplates()]);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    window.W2G = { state, D, showTab, redraw: () => { drawFields(); renderSel(); }, detect, ocrLines }; // for troubleshooting
  })();
})();
