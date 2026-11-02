// W2G AutoFill - places client values onto a blank (flat) PDF form using a saved template.
// Template coordinates are PDF points with the origin at the TOP-LEFT of the page (converted when drawing).
(function (root) {
  'use strict';

  const SOURCES = [
    { key: 'name', label: 'Full name', group: 'Client' },
    { key: 'nric', label: 'NRIC (750618-01-7246)', group: 'Client' },
    { key: 'nric12', label: 'NRIC digits only (750618017246)', group: 'Client' },
    { key: 'dob', label: 'Birthday DD/MM/YYYY', group: 'Client' },
    { key: 'dob8', label: 'Birthday digits DDMMYYYY', group: 'Client' },
    { key: 'dob_d', label: 'Birthday - day', group: 'Client' },
    { key: 'dob_m', label: 'Birthday - month', group: 'Client' },
    { key: 'dob_y', label: 'Birthday - year', group: 'Client' },
    { key: 'genderWord', label: 'Gender (Male/Female)', group: 'Client' },
    { key: 'phone', label: 'Mobile phone', group: 'Client' },
    { key: 'homeTel', label: 'Home / office tel', group: 'Client' },
    { key: 'email', label: 'Email', group: 'Client' },
    { key: 'address', label: 'Address (street)', group: 'Client' },
    { key: 'postcode', label: 'Postcode', group: 'Client' },
    { key: 'town', label: 'Town / city', group: 'Client' },
    { key: 'addressFull', label: 'Full address (street, postcode, town)', group: 'Client' },
    { key: 'company', label: 'Company', group: 'Client' },
    { key: 'policyNo', label: 'Policy no.', group: 'Policy' },
    { key: 'planName', label: 'Plan name', group: 'Policy' },
    { key: 'accountManager', label: 'Account manager / agent name', group: 'Agent' },
    { key: 'agentCode', label: 'Agent code (IAC)', group: 'Agent' },
    { key: 'agentPhone', label: 'Agent phone', group: 'Agent' },
    { key: 'today', label: "Today's date DD/MM/YYYY", group: 'Date' },
    { key: 'today8', label: "Today's date digits DDMMYYYY", group: 'Date' },
    { key: 'today_d', label: "Today - day", group: 'Date' },
    { key: 'today_m', label: "Today - month", group: 'Date' },
    { key: 'today_y', label: "Today - year", group: 'Date' },
    { key: 'custom', label: 'Fixed text (same on every form)', group: 'Other' },
  ];
  const SOURCE_LABEL = Object.fromEntries(SOURCES.map(s => [s.key, s.label]));
  // which client field a source comes from (for status / missing checks)
  const BASE = { nric12: 'nric', dob8: 'dob', dob_d: 'dob', dob_m: 'dob', dob_y: 'dob', genderWord: 'gender', addressFull: 'address' };

  const pad = n => String(n).padStart(2, '0');
  function todayParts(d) { d = d || new Date(); return { d: pad(d.getDate()), m: pad(d.getMonth() + 1), y: String(d.getFullYear()) }; }

  // Returns {value, status, note} for one template field and one client record.
  function valueFor(field, rec, opts) {
    opts = opts || {};
    const F = rec ? rec.fields : {};
    const get = k => (F[k] || { value: '', status: 'missing' });
    const src = field.source;
    if (src === 'custom') return { value: field.text || '', status: field.text ? 'ok' : 'missing' };
    if (src.startsWith('today')) {
      if (opts.noDate) return { value: '', status: 'blank', note: 'Date left blank (you switched it off)' };
      const t = todayParts(opts.date);
      const v = { today: `${t.d}/${t.m}/${t.y}`, today8: t.d + t.m + t.y, today_d: t.d, today_m: t.m, today_y: t.y }[src];
      return { value: v, status: 'ok' };
    }
    const base = get(BASE[src] || src);
    if (!base.value) return { value: '', status: 'missing', note: 'Not in client data - will be left blank' };
    let v = base.value;
    if (src === 'nric12') v = v.replace(/\D/g, '');
    if (src.startsWith('dob') && src !== 'dob') {
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return { value: '', status: 'check', note: 'Birthday is not DD/MM/YYYY - fix it in Clients' };
      v = { dob8: m[1] + m[2] + m[3], dob_d: m[1], dob_m: m[2], dob_y: m[3] }[src];
    }
    if (src === 'genderWord') v = v === 'M' ? 'MALE' : v === 'F' ? 'FEMALE' : v;
    if (src === 'addressFull') v = [v, [get('postcode').value, get('town').value].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return { value: v, status: base.status === 'check' ? 'check' : 'ok', note: base.note || '' };
  }

  // Characters to write for a field in "boxes" mode: number-like values lose their dashes/slashes.
  const DIGITY = /^(nric|nric12|dob|dob8|today|today8|phone|homeTel|policyNo|postcode|agentPhone|agentCode|dob_.|today_.)$/;
  function boxChars(field, value) {
    let v = String(value);
    if (DIGITY.test(field.source)) v = v.replace(/[^0-9A-Za-z]/g, '');
    return v.toUpperCase();
  }

  // Groups cells into rows (top to bottom, left to right)
  function cellRows(cells) {
    const sorted = cells.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const c of sorted) {
      const r = rows.find(r => Math.abs(r[0].y - c.y) < Math.max(2, c.h * 0.4));
      if (r) r.push(c); else rows.push([c]);
    }
    rows.forEach(r => r.sort((a, b) => a.x - b.x));
    return rows;
  }

  // Lays characters into box rows. Words are kept whole on a row when they fit. Returns {placed:[{cell,ch}], overflow}
  function layoutBoxes(field, value) {
    const rows = cellRows(field.cells || []);
    const text = boxChars(field, value);
    const placed = [];
    if (!rows.length) return { placed, overflow: !!text };
    if (rows.length === 1 || !/\s/.test(text)) {
      const flat = rows.flat(); const chars = [...text];
      chars.slice(0, flat.length).forEach((ch, i) => ch !== ' ' && placed.push({ cell: flat[i], ch }));
      return { placed, overflow: chars.length > flat.length };
    }
    const words = text.split(/\s+/).filter(Boolean);
    let r = 0, col = 0, overflow = false;
    for (const w of words) {
      let need = (col ? 1 : 0) + w.length;
      if (r < rows.length && col && col + need > rows[r].length && w.length <= rows[r].length) { r++; col = 0; need = w.length; }
      if (col) col++;
      for (const ch of w) {
        if (r < rows.length && col >= rows[r].length) { r++; col = 0; }
        if (r >= rows.length) { overflow = true; break; }
        placed.push({ cell: rows[r][col], ch }); col++;
      }
      if (overflow) break;
    }
    return { placed, overflow };
  }

  // Text mode: pick a font size that fits; wraps to more lines when the area is tall enough.
  function layoutText(field, value, font) {
    const maxSize = field.size || Math.min(10, field.h * 0.72);
    const width = s => font.widthOfTextAtSize(s, 1);
    const words = String(value).split(/\s+/).filter(Boolean);
    for (let size = maxSize; size >= 5.5; size -= 0.5) {
      const lh = size * 1.15, maxLines = Math.max(1, Math.floor((field.h + size * 0.2) / lh));
      const lines = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (width(t) * size <= field.w - 2 || !cur) cur = t; else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      const fits = lines.length <= maxLines && lines.every(l => width(l) * size <= field.w - 2);
      if (fits || size - 0.5 < 5.5) return { size, lines: lines.slice(0, maxLines), lh, overflow: !fits };
    }
  }

  // Characters Helvetica (WinAnsi) can't draw are replaced so the PDF still builds; the review flags them.
  function safeText(font, s) {
    let bad = false, out = '';
    for (const ch of String(s)) { try { font.encodeText(ch); out += ch; } catch (e) { out += '?'; bad = true; } }
    return { text: out, bad };
  }

  // Review list for one client: every field with its value + status (ok / check / missing / overflow)
  function review(template, rec, opts, font) {
    return template.fields.map(f => {
      const ov = opts && opts.overrides && opts.overrides[f.id];
      const r = ov !== undefined ? { value: ov, status: ov ? 'ok' : 'blank', note: 'Edited for this form' } : valueFor(f, rec, opts);
      if (r.value && f.mode === 'boxes') { if (layoutBoxes(f, r.value).overflow) { r.status = 'overflow'; r.note = `Too long for ${(f.cells || []).length} boxes - shorten it below`; } }
      else if (r.value && font) { const lt = layoutText(f, safeText(font, r.value).text, font); if (lt.overflow) { r.status = 'overflow'; r.note = 'Too long for the space - shorten it below'; } }
      if (r.value && font && safeText(font, r.value).bad) { r.status = 'check'; r.note = 'Has characters the PDF font cannot print (shown as ?)'; }
      return Object.assign({ field: f, label: f.label || SOURCE_LABEL[f.source] || f.source }, r);
    });
  }

  // Builds the filled PDF. Returns Uint8Array.
  async function fillPdf(PDFLib, pdfBytes, template, rec, opts) {
    const doc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const ink = PDFLib.rgb(0.04, 0.09, 0.32);
    const pages = doc.getPages();
    for (const item of review(template, rec, opts, font)) {
      const f = item.field, page = pages[f.page];
      if (!page || !item.value) continue;
      const H = page.getHeight();
      if (f.mode === 'boxes') {
        for (const { cell, ch } of layoutBoxes(f, safeText(font, item.value).text).placed) {
          const size = f.size || Math.min(cell.h * 0.62, cell.w * 0.95, 11);
          const tw = font.widthOfTextAtSize(ch, size);
          page.drawText(ch, { x: cell.x + (cell.w - tw) / 2, y: H - (cell.y + cell.h / 2) - size * 0.35, size, font, color: ink });
        }
      } else {
        const t = safeText(font, item.value).text;
        const lt = layoutText(f, t, font);
        const block = lt.lines.length * lt.lh;
        let top = f.y + Math.max(0, (f.h - block) / 2);
        for (const line of lt.lines) {
          page.drawText(line, { x: f.x + 1.5, y: H - top - lt.lh + (lt.lh - lt.size) / 2 + lt.size * 0.22, size: lt.size, font, color: ink });
          top += lt.lh;
        }
      }
    }
    doc.setProducer('W2G AutoFill');
    return doc.save();
  }

  async function reviewWithFont(PDFLib, template, rec, opts) {
    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    return review(template, rec, opts, font);
  }

  // ---------- box detection on a rendered page (designer) ----------
  // img: ImageData of the page rendered at `scale` px per point. rect in points (top-left origin).
  function detectCells(img, scale, rect) {
    const W = img.width, data = img.data;
    const x0 = Math.max(0, Math.round(rect.x * scale)), y0 = Math.max(0, Math.round(rect.y * scale));
    const x1 = Math.min(W - 1, Math.round((rect.x + rect.w) * scale)), y1 = Math.min(img.height - 1, Math.round((rect.y + rect.h) * scale));
    const dark = (x, y) => { const i = (y * W + x) * 4; return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < 165; };
    // runs of true values -> centre index of each run
    const groups = arr => { const out = []; let s = -1; for (let i = 0; i <= arr.length; i++) { const v = i < arr.length && arr[i]; if (v && s < 0) s = i; if (!v && s >= 0) { out.push((s + i - 1) / 2); s = -1; } } return out; };
    // horizontal lines -> row bands
    const hl = [];
    for (let y = y0; y <= y1; y++) { let n = 0; for (let x = x0; x <= x1; x++) n += dark(x, y); hl.push(n / (x1 - x0 + 1) > 0.45); }
    let hy = groups(hl).map(v => v + y0);
    const bands = [];
    for (let i = 0; i + 1 < hy.length; i++) if (hy[i + 1] - hy[i] > 5 * scale) bands.push([hy[i], hy[i + 1]]);
    if (!bands.length) bands.push([y0, y1]);
    const cells = [];
    for (const [a, b] of bands) {
      const ya = Math.round(a + (b - a) * 0.2), yb = Math.round(b - (b - a) * 0.2);
      const vl = [];
      for (let x = x0; x <= x1; x++) { let n = 0; for (let y = ya; y <= yb; y++) n += dark(x, y); vl.push(n / (yb - ya + 1) > 0.7); }
      const vx = groups(vl).map(v => v + x0);
      let row = [];
      for (let i = 0; i + 1 < vx.length; i++) { const w = vx[i + 1] - vx[i]; if (w > 3 * scale) row.push({ x: vx[i] / scale, y: a / scale, w: w / scale, h: (b - a) / scale }); }
      if (row.length >= 2) {
        const med = row.map(c => c.w).sort((p, q) => p - q)[Math.floor(row.length / 2)];
        row = row.filter(c => c.w > med * 0.6 && c.w < med * 1.5); // drops gaps between box groups
        // drops "boxes" that already have something printed inside (the "-" in an NRIC, the "/" in a date)
        row = row.filter(c => {
          const ax = Math.round((c.x + c.w * 0.25) * scale), bx = Math.round((c.x + c.w * 0.75) * scale);
          const ay = Math.round((c.y + c.h * 0.25) * scale), by = Math.round((c.y + c.h * 0.75) * scale);
          let n = 0, t = 0;
          for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { n += dark(x, y); t++; }
          return n / t < 0.04;
        });
      }
      cells.push(...row);
    }
    return cells.length >= 2 ? cells.map(c => ({ x: +c.x.toFixed(2), y: +c.y.toFixed(2), w: +c.w.toFixed(2), h: +c.h.toFixed(2) })) : [];
  }

  const api = { SOURCES, SOURCE_LABEL, valueFor, review, reviewWithFont, fillPdf, layoutBoxes, detectCells, cellRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.W2GFill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
