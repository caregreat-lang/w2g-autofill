/* W2G AutoFill: reads client details from Excel / CSV, PDF (ePartner printouts or customer lists) and pictures.
 * Every value gets a status: ok (read cleanly), check (found, but please confirm) or missing (left blank, never guessed). */
(function (root) {
  // ---------- Client fields ----------
  const FIELDS = [
    ['name', 'Customer name'], ['nric', 'NRIC / Passport'], ['dob', 'Birthday'], ['gender', 'Gender'],
    ['phone', 'Phone'], ['email', 'Email'], ['company', 'Company'], ['accountManager', 'Account manager'],
    ['policyNo', 'Policy no.'], ['plan', 'Plan'], ['policyStatus', 'Policy status'], ['religion', 'Religion'],
    ['address', 'Address'], ['postcode', 'Postcode'], ['town', 'Town'], ['laName', 'Life assured name'], ['laNric', 'Life assured NRIC']
  ];
  // The six details from the brief; the rest are extra and only flagged when a form needs them.
  const CORE = ['name', 'company', 'dob', 'phone', 'email', 'accountManager'];

  const HEADERS = {
    name: ['customer name', 'client name', 'name', 'full name', 'nama', 'customer', 'client', 'policy owner', 'policyowner', 'policy owner name', 'proposer'],
    nric: ['nric', 'nric no', 'ic', 'ic no', 'id no', 'id', 'mykad', 'passport', 'passport no', 'ic passport', 'nric passport', 'new ic', 'client id', 'id number'],
    dob: ['birthday', 'dob', 'date of birth', 'birth date', 'birthdate', 'tarikh lahir'],
    gender: ['gender', 'sex', 'jantina'],
    phone: ['phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'mobile number', 'contact', 'contact no', 'contact number', 'tel', 'tel no', 'telephone', 'hp', 'hp no', 'handphone'],
    email: ['email', 'e mail', 'email address'],
    company: ['company', 'company name', 'employer', 'syarikat', 'organisation', 'organization', 'firm'],
    accountManager: ['account manager', 'acct manager', 'manager', 'agent', 'servicing agent', 'agent name', 'relationship manager', 'rm', 'advisor', 'adviser', 'am'],
    policyNo: ['policy no', 'policy number', 'policy', 'p n', 'polisi', 'no polisi'],
    plan: ['plan', 'plan name', 'product'],
    policyStatus: ['status', 'policy status'],
    religion: ['religion', 'agama'],
    address: ['address', 'mailing address', 'alamat'],
    postcode: ['postcode', 'post code', 'poskod', 'zip'],
    town: ['town', 'city', 'bandar']
  };
  const normHead = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const HEAD_INDEX = {};
  for (const [k, list] of Object.entries(HEADERS)) for (const h of list) HEAD_INDEX[h] = k;
  const headerKey = s => HEAD_INDEX[normHead(s)] || null;

  // ---------- Cleaning and checking ----------
  const pad = n => String(n).padStart(2, '0');
  const validDate = (d, m, y) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
  const fullYear = y => (y < 100 ? (y > (new Date().getFullYear() % 100) ? 1900 + y : 2000 + y) : y);
  const nricDigits = s => String(s || '').replace(/\D/g, '');
  const isMyNric = s => /^\d{12}$/.test(nricDigits(s)) && /^\s*\d{6}-?\d{2}-?\d{4}\s*$/.test(String(s));
  function nricBirth(nric) {
    const d = nricDigits(nric); if (d.length !== 12) return null;
    const yy = +d.slice(0, 2), mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    if (!validDate(dd, mm, 2000)) return null;
    return { yy, mm, dd };
  }

  // Returns {value, status, note}
  function cleanDob(raw, nric) {
    if (raw == null || String(raw).trim() === '' || raw === '-') return null;
    let d, m, y, twoWays = false;
    if (raw instanceof Date && !isNaN(raw)) { d = raw.getDate(); m = raw.getMonth() + 1; y = raw.getFullYear(); }
    else if (typeof raw === 'number' && raw > 1000 && raw < 80000) { // Excel serial date
      const t = new Date(Math.round((raw - 25569) * 86400000)); d = t.getUTCDate(); m = t.getUTCMonth() + 1; y = t.getUTCFullYear();
    } else {
      const s = String(raw).trim();
      let mt;
      if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
      else if ((mt = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/))) {
        d = +mt[1]; m = +mt[2]; y = fullYear(+mt[3]);
        if (d <= 12 && m <= 12 && d !== m) twoWays = true;
        if (m > 12 && d <= 12) { [d, m] = [m, d]; twoWays = false; } // clearly month/day
      } else if ((mt = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/))) {
        const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(mt[2].slice(0, 3).toLowerCase());
        if (mi >= 0) { d = +mt[1]; m = mi + 1; y = +mt[3]; }
      }
    }
    if (!d || !validDate(d, m, y)) return { value: String(raw).trim(), status: 'check', note: 'Not a date I can read. Please type it as DD/MM/YYYY.' };
    const b = nricBirth(nric);
    if (b) {
      const fits = (dd, mm) => dd === b.dd && mm === b.mm && y % 100 === b.yy;
      if (fits(d, m)) return { value: `${pad(d)}/${pad(m)}/${y}`, status: 'ok', note: twoWays ? 'Could be read two ways; confirmed with the NRIC.' : '' };
      if (twoWays && fits(m, d)) return { value: `${pad(m)}/${pad(d)}/${y}`, status: 'ok', note: 'Day and month were swapped in the file; confirmed with the NRIC.' };
      return { value: `${pad(d)}/${pad(m)}/${y}`, status: 'check', note: 'Does not match the birth date inside the NRIC.' };
    }
    if (twoWays) return { value: `${pad(d)}/${pad(m)}/${y}`, status: 'check', note: `${pad(d)} ${monthName(m)} or ${pad(m)} ${monthName(d)}?` };
    return { value: `${pad(d)}/${pad(m)}/${y}`, status: 'ok', note: '' };
  }
  const monthName = m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];

  function cleanPhone(raw) {
    if (raw == null) return null;
    let s = String(raw).trim(); if (!s || s === '-') return null;
    let digits = s.replace(/[^\d]/g, '');
    if (s.startsWith('+') && !digits.startsWith('60')) return { value: s, status: 'check', note: 'Overseas number. Please confirm.' };
    if (digits.startsWith('60') && digits.length >= 11) digits = '0' + digits.slice(2);
    if (/^1\d{8,9}$/.test(digits)) return { value: fmtPhone('0' + digits), status: 'check', note: `Added the missing 0 (file shows ${s}).` };
    if (/^01\d{8,9}$/.test(digits)) return { value: fmtPhone(digits), status: 'ok', note: '' };
    if (/^0[3-9]\d{7,8}$/.test(digits)) return { value: digits, status: 'ok', note: 'Landline' };
    return { value: s, status: 'check', note: 'Not a usual Malaysian phone number. Please confirm.' };
  }
  const fmtPhone = d => d.slice(0, 3) + '-' + d.slice(3);

  function cleanEmail(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().replace(/^mailto:/i, ''); if (!s || s === '-') return null;
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) return { value: s.toLowerCase(), status: 'ok', note: '' };
    return { value: s, status: 'check', note: 'Looks incomplete.' };
  }

  function cleanNric(raw) {
    if (raw == null) return null;
    const s = String(raw).trim(); if (!s || s === '-') return null;
    const d = nricDigits(s);
    if (d.length === 12 && /^[\d\s-]+$/.test(s)) {
      if (!nricBirth(d)) return { value: `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`, status: 'check', note: 'The first 6 digits are not a valid birth date.' };
      return { value: `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`, status: 'ok', note: '' };
    }
    if (/^\d+$/.test(d) && d.length > 8 && d.length < 12 && /^[\d\s-]+$/.test(s)) return { value: s, status: 'check', note: `Only ${d.length} digits; a MyKad NRIC has 12.` };
    if (/^[A-Z]{1,2}\d{6,9}$/i.test(s.replace(/\s/g, ''))) return { value: s.replace(/\s/g, '').toUpperCase(), status: 'ok', note: 'Passport number' };
    return { value: s, status: 'check', note: 'Not a usual NRIC or passport number. Please confirm.' };
  }

  function cleanGender(raw, nric) {
    const s = String(raw ?? '').trim().toUpperCase();
    const fromIc = isMyNric(nric) ? (+nricDigits(nric).slice(-1) % 2 ? 'M' : 'F') : null;
    let g = null;
    if (/^(M|MALE|L|LELAKI|MR)$/.test(s)) g = 'M'; else if (/^(F|FEMALE|P|PEREMPUAN|MS|MDM|MADAM|MRS)$/.test(s)) g = 'F';
    if (g && fromIc && g !== fromIc) return { value: g, status: 'check', note: 'Does not match the NRIC (last digit).' };
    if (g) return { value: g, status: 'ok', note: '' };
    if (fromIc) return { value: fromIc, status: 'ok', note: 'Worked out from the NRIC (last digit).' };
    return s ? { value: s, status: 'check', note: 'Not M or F. Please confirm.' } : null;
  }

  const cleanText = raw => { if (raw == null) return null; const s = String(raw).replace(/\s+/g, ' ').trim(); return s && s !== '-' ? { value: s, status: 'ok', note: '' } : null; };
  const cleanName = raw => { const t = cleanText(raw); if (!t) return null; t.value = t.value.toUpperCase(); if (/\d/.test(t.value)) { t.status = 'check'; t.note = 'Has numbers in it. Please confirm.'; } return t; };

  // raw: {field: value}. fromPicture marks everything "check" because it was read from an image.
  function buildClient(raw, opts = {}) {
    const f = {};
    const nric = cleanNric(raw.nric);
    f.nric = nric;
    f.name = cleanName(raw.name);
    f.dob = cleanDob(raw.dob, nric && nric.value);
    f.gender = cleanGender(raw.gender, nric && nric.value);
    f.phone = cleanPhone(raw.phone);
    f.email = cleanEmail(raw.email);
    f.company = cleanText(raw.company);
    f.accountManager = cleanName(raw.accountManager);
    const pol = cleanText(raw.policyNo); if (pol) { pol.value = pol.value.replace(/\s/g, ''); if (!/^\d{6,12}$/.test(pol.value)) { pol.status = 'check'; pol.note = 'Not a usual policy number. Please confirm.'; } }
    f.policyNo = pol;
    f.plan = cleanText(raw.plan);
    f.policyStatus = cleanText(raw.policyStatus);
    if (f.policyStatus && !/^(in ?force|active|regular)$/i.test(f.policyStatus.value)) { f.policyStatus.status = 'check'; f.policyStatus.note = `Policy is ${f.policyStatus.value}.`; }
    f.religion = cleanText(raw.religion);
    f.address = cleanText(raw.address); f.postcode = cleanText(raw.postcode); f.town = cleanText(raw.town);
    f.laName = cleanName(raw.laName); f.laNric = cleanNric(raw.laNric);
    for (const [k] of FIELDS) {
      if (!f[k]) f[k] = { value: '', status: 'missing', note: '' };
      else if (opts.fromPicture && f[k].status === 'ok') { f[k].status = 'check'; f[k].note = (f[k].note ? f[k].note + ' ' : '') + 'Read from a picture.'; }
    }
    if (!f.company.value && opts.noCompanyInSource) f.company.note = 'Not in this file.';
    return { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), fields: f, source: opts.source || '', added: new Date().toISOString() };
  }

  // ---------- Positioned text (PDF text or picture words) ----------
  // items: [{str, x, y, h, page}] with y growing downwards. Groups into lines, then joins close words into phrases.
  function toLines(items) {
    const sorted = items.filter(i => i.str && i.str.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const l = lines.length && lines[lines.length - 1];
      if (l && l.page === it.page && Math.abs(l.y - it.y) <= Math.max(2, 0.45 * it.h)) l.items.push(it);
      else lines.push({ page: it.page, y: it.y, h: it.h, items: [it] });
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      const ph = [];
      for (const it of l.items) {
        const p = ph[ph.length - 1];
        if (p && it.x - p.x2 < 0.6 * Math.max(p.h, it.h) && !it.joinBlocked) { p.str += ' ' + it.str.trim(); p.x2 = it.x + it.w; }
        else ph.push({ str: it.str.trim(), x: it.x, x2: it.x + (it.w || it.str.length * it.h * 0.5), h: it.h });
      }
      l.items = ph; l.text = ph.map(p => p.str).join('  ');
    }
    return lines;
  }

  // ePartner "Policy Detail Information" printout (one policy per file).
  function looksLikeEpartner(lines) { const t = lines.map(l => l.text).join('\n'); return /Policy Detail Information/i.test(t) || (/PAYER DETAILS/i.test(t) && /AGENT DETAILS/i.test(t)); }

  function parseEpartner(lines) {
    const raw = {};
    const all = lines.map(l => l.text).join('\n');
    const pn = all.match(/P\s*[\/|]\s*N\s*:?\s*(\d{6,12})/i); if (pn) raw.policyNo = pn[1];

    // Proposer / Life Assured rows: read each value by its shape, so merged or shifted columns don't matter.
    const rowOf = label => lines.find(l => l.items[0] && new RegExp('^\\W*' + label + '\\b', 'i').test(l.items[0].str));
    function readRow(line, label) {
      const out = {}; if (!line) return out;
      const text = line.items.map(i => i.str).join('  ').replace(new RegExp('^\\W*' + label + '\\s*', 'i'), '').replace(/[\[\]|{}]/g, ' ');
      const ic = text.match(/\b\d{6}-\d{2}-\d{4}\b/) || text.match(/\b[A-Z]{1,2}\d{6,9}\b/); if (ic) out.nric = ic[0];
      const dob = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/); if (dob) out.dob = dob[0];
      if (/non[- ]?mus/i.test(text)) out.religion = 'Non-Muslim'; else if (/\bmuslim\b/i.test(text)) out.religion = 'Muslim';
      const nm = text.match(/^\s*([A-Z][A-Z@'./ -]*?[A-Z.])(?:\s+([MF]))?(?=\s{2,}|\s+[MF]\s|\s+\d|$)/);
      if (nm) { out.name = nm[1].trim(); if (nm[2]) out.gender = nm[2]; }
      if (!out.gender) { const g = text.match(/\s([MF])\s/); if (g) out.gender = g[1]; }
      return out;
    }
    const prop = readRow(rowOf('Proposer'), 'Proposer'), la = readRow(rowOf('Life Assured'), 'Life Assured');
    raw.name = prop.name; raw.nric = prop.nric; raw.dob = prop.dob || la.dob; raw.gender = prop.gender;
    raw.laName = la.name; raw.laNric = la.nric; raw.religion = la.religion || prop.religion;

    // label → value pairs inside a section
    const sectionLines = (title, next) => {
      const s = lines.findIndex(l => new RegExp('^' + title, 'i').test(l.text)); if (s < 0) return [];
      let e = lines.findIndex((l, i) => i > s && next.some(n => new RegExp('^' + n, 'i').test(l.text)));
      return lines.slice(s + 1, e < 0 ? undefined : e);
    };
    const valueOf = (ls, label) => {
      for (let i = 0; i < ls.length; i++) {
        const items = ls[i].items;
        const k = items.findIndex(it => new RegExp('^' + label + '$', 'i').test(it.str));
        if (k >= 0 && items[k + 1]) {
          const v = items[k + 1];
          // An item right of the label but at the next label's column belongs to that label, not this one.
          return { str: v.str, x: v.x, line: i, lines: ls };
        }
      }
      return null;
    };
    const payer = sectionLines('PAYER DETAILS', ['PAYEE DETAILS', 'AGENT DETAILS', 'ASSIGNEE']);
    const nm = valueOf(payer, 'Name'); if (nm && !raw.name) raw.name = nm.str;
    const id = valueOf(payer, 'ID No'); if (id && !raw.nric) raw.nric = id.str;
    const em = valueOf(payer, 'Email'); if (em) raw.email = em.str;
    const mob = valueOf(payer, 'Mobile No'); if (mob) raw.phone = mob.str;
    else { const rt = valueOf(payer, 'Residence Tel'); if (rt) raw.phone = rt.str; }
    const ad = valueOf(payer, 'Address');
    if (ad) {
      const parts = [ad.str];
      for (let i = ad.line + 1; i < payer.length; i++) {
        const same = payer[i].items.filter(it => Math.abs(it.x - ad.x) <= 3);
        if (!same.length) continue;
        parts.push(...same.map(s => s.str));
      }
      raw.address = parts.join(', ');
      const pc = raw.address.match(/\b(\d{5})\s*,?\s*([A-Za-z][A-Za-z .'-]+)$/);
      if (pc) { raw.postcode = pc[1]; raw.town = pc[2].trim(); }
    }
    const agent = sectionLines('AGENT DETAILS', ['Immediate officer', 'GSM', 'TRANSACTION HISTORY']);
    const an = valueOf(agent, 'Name'); if (an) raw.accountManager = an.str;
    const st = lines.find(l => /^Policy Status\b/i.test(l.text)); if (st && st.items[1]) raw.policyStatus = st.items[1].str;
    // Plan name: the first benefit row's left column (may wrap over several lines)
    const bi = lines.findIndex(l => /^BENEFIT DETAILS/i.test(l.text));
    if (bi >= 0) {
      const planCol = lines.slice(bi + 1).filter(l => l.items[0] && l.items[0].x < lines[bi].items[0].x + 5);
      const words = [];
      let prevY = null;
      for (const l of planCol) {
        const s = l.items[0].str;
        if (/^https?:/i.test(s) || (words.length && prevY != null && l.y - prevY > 2.5 * l.h)) break;
        prevY = l.y;
        if (/^(Benefit|POLICY VALUES)/i.test(s)) { if (words.length) break; continue; }
        if (/^\d+(\.\d+)?$/.test(s) && !words.length) continue;
        words.push(s); if (l.items.length > 1 && words.length > 1) break;
      }
      if (words.length) raw.plan = words.join(' ');
    }
    return raw;
  }

  // A table with a header row (customer list in a PDF or a picture).
  function parseTableLines(lines) {
    let hi = -1, cols = null;
    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      const c = lines[i].items.map(it => ({ key: headerKey(it.str), x: it.x, label: it.str }));
      if (c.filter(x => x.key).length >= 2) { hi = i; cols = c; break; }
    }
    if (hi < 0) return null;
    const rows = [];
    for (const l of lines.slice(hi + 1)) {
      if (l.items.length < 2) continue;
      const r = {};
      for (const it of l.items) {
        let best = null; for (const c of cols) if (c.x <= it.x + Math.max(4, l.h)) best = c;
        if (best && best.key) r[best.key] = (r[best.key] ? r[best.key] + ' ' : '') + it.str;
      }
      if (Object.keys(r).length >= 2) rows.push(r);
    }
    return { rows, ignored: cols.filter(c => !c.key).map(c => c.label) };
  }

  // Grid rows from Excel/CSV: finds the header row, maps columns, skips blank rows.
  function parseGrid(grid) {
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(grid.length, 20); i++) {
      const m = (grid[i] || []).map(headerKey);
      if (m.filter(Boolean).length >= 2) { hi = i; map = m; break; }
    }
    if (hi < 0) return { rows: [], ignored: [], error: 'I could not find a title row. Put titles such as Customer Name, Phone, Email in the first row.' };
    const seen = new Set(); map = map.map(k => (k && !seen.has(k) ? (seen.add(k), k) : null));
    const rows = [];
    for (const r of grid.slice(hi + 1)) {
      if (!r || r.every(v => v == null || String(v).trim() === '')) continue;
      const o = {}; map.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim() !== '') o[k] = r[i]; });
      if (Object.keys(o).length) rows.push(o);
    }
    const ignored = (grid[hi] || []).filter((h, i) => h != null && String(h).trim() && !map[i]);
    return { rows, ignored, headerRow: hi + 1 };
  }

  // ---------- File readers (browser; libraries passed in so tests can run in Node) ----------
  async function pdfItems(bytes, pdfjs) {
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      for (const it of tc.items) if (it.str && it.str.trim()) {
        const h = Math.abs(it.transform[3]) || it.height || 8;
        items.push({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h, page: p, joinBlocked: true });
      }
    }
    return { items, pages: doc.numPages };
  }

  // Enlarges the picture, makes it black and white, and removes table grid lines, which otherwise read as "I" or "[".
  async function cleanPicture(blob) {
    if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return blob;
    const bmp = await createImageBitmap(blob);
    const k = Math.max(1, Math.min(3, 2400 / bmp.width));
    const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
    const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, W, H);
    const img = x.getImageData(0, 0, W, H), d = img.data, ink = new Uint8Array(W * H), line = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < ink.length; i++, j += 4) ink[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11 < 170 ? 1 : 0;
    const LH = Math.round(W * 0.03), LV = Math.round(Math.max(18 * k, H * 0.012));
    for (let y = 0; y < H; y++) { let s = -1; for (let i = 0; i <= W; i++) { const v = i < W && ink[y * W + i]; if (v && s < 0) s = i; if (!v && s >= 0) { if (i - s >= LH) for (let t = s; t < i; t++) line[y * W + t] = 1; s = -1; } } }
    for (let i = 0; i < W; i++) { let s = -1; for (let y = 0; y <= H; y++) { const v = y < H && ink[y * W + i]; if (v && s < 0) s = y; if (!v && s >= 0) { if (y - s >= LV) for (let t = s; t < y; t++) line[t * W + i] = 1; s = -1; } } }
    for (let i = 0, j = 0; i < ink.length; i++, j += 4) { const v = ink[i] && !line[i] ? 0 : 255; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c.convertToBlob({ type: 'image/png' });
  }

  async function ocrItems(blob, Tesseract, opts, onProgress) {
    const worker = await Tesseract.createWorker('eng', 1, Object.assign({ logger: m => onProgress && m.status === 'recognizing text' && onProgress(m.progress) }, opts));
    try {
      const { data } = await worker.recognize(await cleanPicture(blob));
      return data.words.filter(w => w.confidence > 30).map(w => ({ str: w.text, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, page: 1 }));
    } finally { await worker.terminate(); }
  }

  // Returns {clients: [...], notes: [...], error?}
  async function readFile(name, bytes, libs, onProgress) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const notes = [];
    if (['xlsx', 'xls', 'csv', 'xlsm'].includes(ext)) {
      const wb = libs.XLSX.read(bytes, { type: 'array', cellDates: true, raw: ext === 'csv' ? false : undefined });
      const clients = [];
      for (const sn of wb.SheetNames) {
        const grid = libs.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
        const g = parseGrid(grid);
        if (g.error) { if (wb.SheetNames.length === 1) return { clients: [], notes, error: g.error }; continue; }
        if (g.headerRow > 1) notes.push(`Sheet "${sn}": skipped the line${g.headerRow > 2 ? 's' : ''} above the column titles.`);
        if (g.ignored.length) notes.push(`Sheet "${sn}": column${g.ignored.length > 1 ? 's' : ''} ${g.ignored.map(x => '"' + x + '"').join(', ')} not used.`);
        for (const r of g.rows) clients.push(buildClient(r, { source: `${name} (${sn})` }));
      }
      if (!clients.length) return { clients, notes, error: 'No client rows found in this file.' };
      return { clients, notes };
    }
    if (ext === 'pdf') {
      const { items } = await pdfItems(bytes, libs.pdfjs);
      if (!items.length) return { clients: [], notes, error: 'This PDF has no text in it (it is a scan). Save it as a PNG/JPG picture and add that instead.' };
      return fromItems(items, name, false, notes);
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      if (!libs.Tesseract) return { clients: [], notes, error: 'Reading pictures needs the app opened from its Desktop shortcut or the phone link.' };
      const items = await ocrItems(new Blob([bytes]), libs.Tesseract, libs.tesseractOpts, onProgress);
      if (!items.length) return { clients: [], notes, error: 'No text found in this picture. Try a sharper screenshot.' };
      return fromItems(items, name, true, notes);
    }
    return { clients: [], notes, error: `I can't read .${ext} files. Use Excel, CSV, PDF, PNG or JPG.` };
  }

  function fromItems(items, name, fromPicture, notes) {
    const lines = toLines(items);
    if (looksLikeEpartner(lines)) {
      const raw = parseEpartner(lines);
      if (!raw.name && !raw.nric) return { clients: [], notes, error: 'This looks like an ePartner printout, but I could not find the client name or NRIC.' };
      if (fromPicture) notes.push('Read from a picture, so every detail is marked Check.');
      return { clients: [buildClient(raw, { source: name, fromPicture, noCompanyInSource: true })], notes };
    }
    const t = parseTableLines(lines);
    if (t && t.rows.length) {
      if (t.ignored.length) notes.push(`Column${t.ignored.length > 1 ? 's' : ''} ${t.ignored.map(x => '"' + x + '"').join(', ')} not used.`);
      return { clients: t.rows.map(r => buildClient(r, { source: name, fromPicture })), notes };
    }
    return { clients: [], notes, error: 'I could not find client details in this file. It needs an ePartner policy printout, or a list with titles like Customer Name, Phone, Email.' };
  }

  const api = { FIELDS, CORE, HEADERS, buildClient, cleanDob, cleanPhone, cleanEmail, cleanNric, cleanGender, parseGrid, toLines, parseEpartner, parseTableLines, fromItems, readFile, pdfItems, nricDigits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.W2GParse = api;
})(typeof self !== 'undefined' ? self : this);
