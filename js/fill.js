/* W2G AutoFill: works out what goes in each form field for a client, and writes it onto the blank PDF. */
(function (root) {
  const SOURCES = [
    ['name', 'Customer name'], ['nric', 'NRIC (digits only)'], ['nricDash', 'NRIC (with dashes)'], ['dob', 'Birthday (DD/MM/YYYY)'],
    ['dob.dd', 'Birthday: day'], ['dob.mm', 'Birthday: month'], ['dob.yyyy', 'Birthday: year'], ['gender', 'Gender (M/F)'],
    ['phone', 'Phone'], ['email', 'Email'], ['company', 'Company'], ['accountManager', 'Account manager'],
    ['policyNo', 'Policy no.'], ['plan', 'Plan'], ['address', 'Address'], ['postcode', 'Postcode'], ['town', 'Town'],
    ['laName', 'Life assured name'], ['laNric', 'Life assured NRIC (digits only)'], ['muslim', 'Muslim? (Yes/No)'],
    ['today', "Today's date (DD/MM/YYYY)"], ['today.dd', "Today: day"], ['today.mm', "Today: month"], ['today.yyyy', "Today: year"]
  ];
  const pad = n => String(n).padStart(2, '0');
  const digits = s => String(s || '').replace(/\D/g, '');

  // Returns {value, status, note} for one source key.
  function sourceValue(key, client, today = new Date()) {
    const f = client.fields;
    const take = k => f[k] ? { value: f[k].value || '', status: f[k].value ? f[k].status : 'missing', note: f[k].note || '' } : { value: '', status: 'missing', note: '' };
    const map = (v, fn) => (v.value ? { ...v, value: fn(v.value) } : v);
    const isIc = v => /^\d{6}-?\d{2}-?\d{4}$/.test(v);
    switch (key) {
      case 'nric': return map(take('nric'), v => (isIc(v) ? digits(v) : v));
      case 'nricDash': return take('nric');
      case 'laName': { const v = take('laName'); return v.value ? v : { ...take('name'), note: 'Life assured not given; using the customer name.' }; }
      case 'laNric': { let v = take('laNric'); if (!v.value) v = { ...take('nric'), note: 'Life assured not given; using the customer NRIC.' }; return map(v, x => (isIc(x) ? digits(x) : x)); }
      case 'phone': return map(take('phone'), v => v.replace(/-/g, ''));
      case 'dob.dd': case 'dob.mm': case 'dob.yyyy': {
        const v = take('dob'); const m = v.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return { ...v, value: '' };
        return { ...v, value: key === 'dob.dd' ? m[1] : key === 'dob.mm' ? m[2] : m[3] };
      }
      case 'muslim': {
        const r = take('religion');
        if (!r.value) return { value: '', status: 'missing', note: 'Religion not in the client file, so neither box is ticked.' };
        if (/non[- ]?muslim/i.test(r.value)) return { value: 'No', status: r.status, note: '' };
        if (/muslim|islam/i.test(r.value)) return { value: 'Yes', status: r.status, note: '' };
        return { value: 'No', status: 'check', note: `Religion is "${r.value}". Please confirm.` };
      }
      case 'today': return { value: `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`, status: 'ok', note: '' };
      case 'today.dd': return { value: pad(today.getDate()), status: 'ok', note: '' };
      case 'today.mm': return { value: pad(today.getMonth() + 1), status: 'ok', note: '' };
      case 'today.yyyy': return { value: String(today.getFullYear()), status: 'ok', note: '' };
      default:
        if (key.startsWith('fixed:')) return { value: key.slice(6), status: 'ok', note: '' };
        return take(key);
    }
  }

  // All field values for a template + client, with length checks for boxes.
  function resolve(template, client, today) {
    const out = {};
    for (const fd of template.fields) {
      const v = sourceValue(fd.source, client, today);
      if (fd.kind === 'boxes') v.value = v.value.toUpperCase();
      if (fd.kind === 'text' && /name/i.test(fd.source)) v.value = v.value.toUpperCase();
      out[fd.id] = v;
    }
    return out;
  }

  // Problems with a value in its field: too long, characters the PDF font can't print.
  function fieldIssue(fd, value, font) {
    if (!value) return '';
    if (fd.kind === 'boxes' && value.length > fd.cells.length) return `Too long: ${value.length} letters for ${fd.cells.length} boxes. Please shorten it.`;
    const bad = [...value].filter(ch => { try { font.encodeText(ch); return false; } catch (e) { return true; } });
    if (bad.length) return `Can't print ${[...new Set(bad)].join(' ')} on the form. Please replace.`;
    if (fd.kind === 'text' && font.widthOfTextAtSize(value, 6) > fd.rect[2]) return 'Too long for this space even at the smallest size. Please shorten it.';
    return '';
  }

  const INK = [0.05, 0.12, 0.42];

  // values: {fieldId: string}; extras: [{page, x, y, text} | {page, x, y, tick: true}] in PDF points.
  async function fill(pdfBytes, template, values, extras, PDFLib) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const ink = rgb(...INK);
    const pages = doc.getPages();
    const issues = {};
    const safe = s => [...s].map(ch => { try { font.encodeText(ch); return ch; } catch (e) { return '?'; } }).join('');
    const tick = (pg, x, y, w, h) => {
      const s = Math.min(w, h);
      pg.drawLine({ start: { x: x + 0.18 * s, y: y + 0.5 * s }, end: { x: x + 0.42 * s, y: y + 0.2 * s }, thickness: Math.max(1, s * 0.13), color: ink });
      pg.drawLine({ start: { x: x + 0.42 * s, y: y + 0.2 * s }, end: { x: x + 0.88 * s, y: y + 0.88 * s }, thickness: Math.max(1, s * 0.13), color: ink });
    };
    for (const fd of template.fields) {
      const pg = pages[fd.page - 1]; if (!pg) continue;
      const value = String(values[fd.id] ?? '');
      const issue = fieldIssue(fd, value, font); if (issue) issues[fd.id] = issue;
      if (!value) continue;
      if (fd.kind === 'tick') {
        if (value.toLowerCase() === String(fd.when || 'yes').toLowerCase() || value === '✓') for (const [x, y, w, h] of fd.cells) tick(pg, x, y, w, h);
      } else if (fd.kind === 'boxes') {
        const chars = [...safe(value)];
        fd.cells.forEach(([x, y, w, h], i) => {
          const ch = chars[i]; if (!ch || ch === ' ') return;
          const size = Math.min(h * 0.72, w * 1.05);
          const tw = font.widthOfTextAtSize(ch, size);
          pg.drawText(ch, { x: x + (w - tw) / 2, y: y + (h - size * 0.7) / 2, size, font, color: ink });
        });
      } else {
        const [x, y, w, h] = fd.rect;
        const text = safe(value);
        let size = Math.min(10, h * 0.85);
        while (size > 6 && font.widthOfTextAtSize(text, size) > w) size -= 0.25;
        pg.drawText(text, { x, y: y + 1.5, size, font, color: ink, maxWidth: w });
      }
    }
    for (const e of extras || []) {
      const pg = pages[e.page - 1]; if (!pg) continue;
      if (e.tick) tick(pg, e.x - 5, e.y - 5, 10, 10);
      else if (e.text) pg.drawText(safe(e.text), { x: e.x, y: e.y - 3.5, size: e.size || 10, font, color: ink });
    }
    doc.setProducer('W2G AutoFill'); doc.setCreator('W2G AutoFill');
    return { bytes: await doc.save(), issues };
  }

  const api = { SOURCES, sourceValue, resolve, fill, fieldIssue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.W2GFill = api;
})(typeof self !== 'undefined' ? self : this);
