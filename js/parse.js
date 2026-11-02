// W2G AutoFill - turns client files (ePartner printouts, customer lists, Excel rows, OCR text) into client records.
// Rule: never guess. A value we are unsure about is kept but flagged "check"; a value we cannot find stays blank and is flagged "missing".
(function (root) {
  'use strict';

  const FIELDS = [
    { key: 'name', label: 'Full name', required: true },
    { key: 'nric', label: 'NRIC / ID no.', required: true },
    { key: 'dob', label: 'Birthday (DD/MM/YYYY)', required: true },
    { key: 'gender', label: 'Gender (M/F)' },
    { key: 'phone', label: 'Mobile phone', required: true },
    { key: 'homeTel', label: 'Home / office tel' },
    { key: 'email', label: 'Email', required: true },
    { key: 'address', label: 'Address (street)' },
    { key: 'postcode', label: 'Postcode' },
    { key: 'town', label: 'Town / city' },
    { key: 'company', label: 'Company' },
    { key: 'accountManager', label: 'Account manager / agent', required: true },
    { key: 'agentCode', label: 'Agent code (IAC / A/C no.)' },
    { key: 'agentPhone', label: 'Agent phone' },
    { key: 'policyNo', label: 'Policy no.' },
    { key: 'planName', label: 'Plan name' },
    { key: 'policyStatus', label: 'Policy status' },
    { key: 'religion', label: 'Religion' },
  ];

  // Column / label names people use for each field (lower case, punctuation removed)
  const SYNONYMS = {
    name: ['name', 'full name', 'customer name', 'client name', 'customer', 'client', 'policy owner', 'policyowner', 'proposer', 'nama'],
    nric: ['nric', 'ic', 'ic no', 'nric no', 'id no', 'id', 'ic number', 'identity card', 'passport', 'passport no', 'new nric', 'mykad'],
    dob: ['birthday', 'dob', 'date of birth', 'birth date', 'birthdate', 'tarikh lahir'],
    gender: ['gender', 'sex', 'jantina'],
    phone: ['phone', 'mobile', 'mobile no', 'handphone', 'hp', 'hp no', 'contact', 'contact no', 'phone no', 'phone number', 'mobile number', 'tel', 'telephone', 'no tel', 'cell'],
    homeTel: ['home tel', 'residence tel', 'office tel', 'home phone', 'office phone', 'house phone'],
    email: ['email', 'e mail', 'email address', 'emel'],
    address: ['address', 'mailing address', 'home address', 'alamat', 'street'],
    postcode: ['postcode', 'post code', 'postal code', 'zip', 'poskod'],
    town: ['town', 'city', 'bandar'],
    company: ['company', 'company name', 'employer', 'organisation', 'organization', 'syarikat'],
    accountManager: ['account manager', 'acct manager', 'manager', 'agent', 'agent name', 'servicing agent', 'rm', 'relationship manager', 'advisor', 'adviser', 'consultant'],
    agentCode: ['agent code', 'iac', 'iac no', 'agent no', 'a c no', 'agent id'],
    agentPhone: ['agent phone', 'agent contact', 'agent tel'],
    policyNo: ['policy no', 'policy number', 'policy', 'p n', 'no polisi', 'policy #'],
    planName: ['plan', 'plan name', 'product', 'benefit'],
    policyStatus: ['policy status'],
    religion: ['religion', 'agama'],
  };

  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const isBlank = v => v == null || /^[-–—\s]*$/.test(String(v)) || /^(n\/?a|nil|none|null|unknown|tbc|tba|not provided.*|ask|\?+)$/i.test(String(v).trim());

  function fieldForHeader(h) {
    const n = norm(h);
    if (!n) return null;
    for (const k in SYNONYMS) if (SYNONYMS[k].includes(n)) return k;
    // looser: header contains a synonym of 4+ letters ("Customer Email" -> email)
    let best = null, bestLen = 0;
    for (const k in SYNONYMS) for (const s of SYNONYMS[k]) if (s.length >= 4 && (' ' + n + ' ').includes(' ' + s + ' ') && s.length > bestLen) { best = k; bestLen = s.length; }
    return best;
  }

  // ---------- value cleaning: returns {value, status: 'ok'|'check'|'missing', note} ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const pad = n => String(n).padStart(2, '0');
  function validDate(d, m, y) { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; }

  function cleanDate(raw) {
    if (raw instanceof Date && !isNaN(raw)) return { value: `${pad(raw.getDate())}/${pad(raw.getMonth() + 1)}/${raw.getFullYear()}`, status: 'ok' };
    if (typeof raw === 'number' && raw > 1000 && raw < 80000) { // Excel serial date
      const t = new Date(Math.round((raw - 25569) * 86400000));
      return { value: `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`, status: 'ok' };
    }
    const s = clean(raw);
    if (isBlank(s)) return { value: '', status: 'missing' };
    let m, d, mo, y, note = '';
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) {
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (d <= 12 && mo <= 12 && d !== mo) note = 'Read as day/month/year - please confirm';
    }
    else if ((m = s.match(/^(\d{1,2})[-/ ]?([a-z]{3,9})[-/ ,]*(\d{2}|\d{4})$/i)) && MONTHS[m[2].toLowerCase().slice(0, 3)]) { d = +m[1]; mo = MONTHS[m[2].toLowerCase().slice(0, 3)]; y = +m[3]; }
    else if ((m = s.match(/^([a-z]{3,9})[ ,]+(\d{1,2})[ ,]+(\d{4})$/i)) && MONTHS[m[1].toLowerCase().slice(0, 3)]) { mo = MONTHS[m[1].toLowerCase().slice(0, 3)]; d = +m[2]; y = +m[3]; }
    else if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; note = 'Read 8 digits as DDMMYYYY - please confirm'; }
    else return { value: s, status: 'check', note: 'Birthday format not recognised' };
    if (y < 100) { y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; note = note || 'Two-digit year - please confirm century'; }
    if (!validDate(d, mo, y)) return { value: s, status: 'check', note: 'Not a real date' };
    return { value: `${pad(d)}/${pad(mo)}/${y}`, status: note ? 'check' : 'ok', note };
  }

  function cleanNric(raw) {
    const s = clean(raw).toUpperCase();
    if (isBlank(s)) return { value: '', status: 'missing' };
    const digits = s.replace(/\D/g, '');
    if (/^[\d\s-]+$/.test(s) && digits.length === 12) {
      const v = `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
      const yy = +digits.slice(0, 2), mm = +digits.slice(2, 4), dd = +digits.slice(4, 6);
      if (!validDate(dd, mm, 2000 + yy) && !validDate(dd, mm, 1900 + yy)) return { value: v, status: 'check', note: 'First 6 digits are not a valid birth date' };
      return { value: v, status: 'ok' };
    }
    if (/^[\d\s-]+$/.test(s)) return { value: s, status: 'check', note: `NRIC should have 12 digits (found ${digits.length})` };
    return { value: s, status: 'check', note: 'Not a 12-digit NRIC - passport or old IC? Please confirm' };
  }

  // Malaysian phone numbers. ePartner prints them without the leading 0 (124015618) - we add it but ask to confirm.
  function cleanPhone(raw, kind) {
    let s = clean(raw);
    if (isBlank(s)) return { value: '', status: 'missing' };
    if (typeof raw === 'number') s = String(raw);
    let d = s.replace(/[^\d+]/g, '');
    if (d.startsWith('+60')) d = '0' + d.slice(3); else if (d.startsWith('60') && d.length >= 11) d = '0' + d.slice(2);
    d = d.replace(/\D/g, '');
    if (/^1\d{8,9}$/.test(d) && kind !== 'home') return { value: '0' + d, status: 'check', note: `Leading 0 added (source shows ${s}) - please confirm` };
    if (/^01\d{8,9}$/.test(d)) return { value: d, status: 'ok' };
    if (/^0[3-9]\d{7,8}$/.test(d)) return { value: d, status: 'ok' };
    if (kind === 'home' && /^\d{7,9}$/.test(d)) return { value: d, status: 'check', note: 'Area code may be missing - please confirm' };
    return { value: s, status: 'check', note: 'Phone number looks unusual - please confirm' };
  }

  function cleanEmail(raw) {
    const s = clean(raw).replace(/\s/g, '');
    if (isBlank(s)) return { value: '', status: 'missing' };
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return { value: s, status: 'ok' };
    return { value: s, status: 'check', note: 'Email address looks incomplete' };
  }

  function cleanGender(raw) {
    const s = clean(raw).toUpperCase();
    if (isBlank(s)) return { value: '', status: 'missing' };
    if (/^(M|MALE|LELAKI|L)$/.test(s)) return { value: 'M', status: 'ok' };
    if (/^(F|FEMALE|P|PEREMPUAN|W)$/.test(s)) return { value: 'F', status: 'ok' };
    return { value: s, status: 'check', note: 'Gender not recognised' };
  }

  function cleanText(raw) {
    const s = clean(raw);
    if (isBlank(s)) return { value: '', status: 'missing' };
    return { value: s, status: 'ok' };
  }

  function cleanField(key, raw) {
    switch (key) {
      case 'dob': return cleanDate(raw);
      case 'nric': return cleanNric(raw);
      case 'phone': case 'agentPhone': return cleanPhone(raw, 'mobile');
      case 'homeTel': return cleanPhone(raw, 'home');
      case 'email': return cleanEmail(raw);
      case 'gender': return cleanGender(raw);
      case 'name': case 'accountManager': { const r = cleanText(raw); if (r.value) r.value = r.value.toUpperCase(); return r; }
      default: return cleanText(raw);
    }
  }

  // Builds a client record from {key: rawValue}. Adds cross-checks (NRIC vs birthday, policy status).
  function makeRecord(raw, source) {
    const rec = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), source: source || '', fields: {} };
    for (const f of FIELDS) {
      const r = raw[f.key] === undefined ? { value: '', status: 'missing' } : cleanField(f.key, raw[f.key]);
      rec.fields[f.key] = r;
    }
    crossCheck(rec);
    return rec;
  }

  function crossCheck(rec) {
    const F = rec.fields;
    for (const k in F) if (F[k].auto) { delete F[k].auto; if (F[k].status === 'check' && F[k].autoNote === F[k].note) { F[k].status = 'ok'; F[k].note = ''; } delete F[k].autoNote; }
    const nric = (F.nric.value || '').replace(/\D/g, ''), dob = F.dob.value;
    if (nric.length === 12 && /^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
      const [d, m, y] = dob.split('/');
      if (nric.slice(0, 6) === y.slice(2) + m + d && F.dob.status === 'check' && /day\/month|DDMMYYYY|century/.test(F.dob.note || '')) { F.dob.status = 'ok'; F.dob.note = 'Confirmed by NRIC'; }
      else if (nric.slice(0, 6) !== y.slice(2) + m + d && F.dob.status === 'ok') { F.dob.status = 'check'; F.dob.note = F.dob.autoNote = 'Birthday does not match NRIC (' + nric.slice(0, 6) + ')'; F.dob.auto = true; }
    }
    const st = F.policyStatus.value;
    if (st && !/inforce|in force|active/i.test(st)) { F.policyStatus.status = 'check'; F.policyStatus.note = F.policyStatus.autoNote = 'Policy is not in force - make sure this form is right for it'; F.policyStatus.auto = true; }
    return rec;
  }

  // Splits "L-10-5 DESA PERMAI INDAH JALAN HELANG 11700 GELUGOR" into street / postcode / town.
  function splitAddress(full) {
    const s = clean(full);
    const m = s.match(/^(.*?)[,\s]+(\d{5})\s+([A-Z][A-Z .'-]*?)[,\s]*(?:,?\s*[A-Z .]+)?$/i);
    const all = s.match(/\b\d{5}\b/g) || [];
    if (!m || all.length !== 1) return { address: s, postcode: '', town: '' , unsure: true };
    return { address: m[1].replace(/[,\s]+$/, ''), postcode: m[2], town: s.slice(s.indexOf(m[2]) + 5).replace(/^[,\s]+/, '').trim() };
  }

  // ---------- text layout helpers (pdf.js / OCR items -> lines) ----------
  // items: [{s, x, y, w}] where y grows downwards (we flip pdf.js y before calling)
  function toLines(items, tol) {
    tol = tol || 3;
    const sorted = items.filter(i => i.s && i.s.trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const l = lines.length && Math.abs(lines[lines.length - 1].y - it.y) < tol ? lines[lines.length - 1] : null;
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.s.trim()).join(' '); }
    return lines;
  }

  // ---------- ePartner (Great Eastern) policy enquiry printout ----------
  function isEPartner(text) { return /Policy\s*Detail\s*Information/i.test(text) || (/PAYER\s*DETAILS/i.test(text) && /AGENT\s*DETAILS/i.test(text)); }

  function parseEPartner(lines) {
    const text = lines.map(l => l.text).join('\n');
    const raw = {}, notes = [];
    const pn = text.match(/P\/N:\s*(\d{6,})/i); if (pn) raw.policyNo = pn[1];

    // Insured table: "Proposer <name> <M/F> <ID no> <ID type> <DOB> ..." - read by pattern, so OCR column drift doesn't matter
    const row = label => lines.find(l => new RegExp('^' + label + '\\b', 'i').test(l.text));
    const prop = row('Proposer'), la = row('Life\\s*Assured');
    const insured = l => {
      if (!l) return null;
      const t = l.text.replace(/[|~_]+/g, ' ').replace(/\s+/g, ' ');
      const m = t.match(/^(?:Proposer|Life\s*Assured)\s+(.+?)\s+([MF])\s+(\S+)\s+(?:\S+\s+)?(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (m) return { name: m[1], gender: m[2], nric: m[3], dob: m[4] };
      // OCR fallback: pick each value by its own pattern
      const nric = (t.match(/\b\d{6}-\d{2}-\d{4}\b/) || [])[0], dob = (t.match(/\b\d{2}\/\d{2}\/\d{4}\b/) || [])[0];
      const g = t.match(/\s([MF])\s/), nm = t.match(/^(?:Proposer|Life\s*Assured)\s+(.+?)(?=\s[MF]\s|\s\d{6}-)/i);
      return nric || dob ? { name: nm && nm[1], gender: g && g[1], nric, dob } : null;
    };
    const pr = insured(prop);
    if (pr) Object.assign(raw, { name: pr.name, gender: pr.gender, nric: pr.nric, dob: pr.dob });
    // religion is printed on the Life Assured row; only use it when that person is the proposer
    const rel = la && la.text.match(/\b(Non-?\s?Muslim|Muslim)\b/i);
    if (rel && (!pr || la.text.includes(pr.name))) raw.religion = rel[1];

    const section = (start, end) => {
      const a = lines.findIndex(l => new RegExp(start, 'i').test(l.text));
      if (a < 0) return [];
      let b = lines.slice(a + 1).findIndex(l => new RegExp(end, 'i').test(l.text));
      return lines.slice(a + 1, b < 0 ? undefined : a + 1 + b);
    };
    // labels compared without spaces, so OCR output like "MobileNo" still matches
    const LABEL_SET = new Set(['title', 'name', 'idno', 'idtype', 'effectivedate', 'email', 'mobileno', 'invalidaddressind', 'residencetel', 'address', 'officetel', 'a/cno', 'rank', 'contactno', 'servicingagent']);
    const labelKey = s => s.replace(/[^a-z/]/gi, '').toLowerCase();
    const isLabel = s => LABEL_SET.has(labelKey(s));
    // label/value pairs: an item matching a label, followed by the next item on the line if it is not itself a label
    const pairs = sec => {
      const out = {};
      sec.forEach((l, li) => l.items.forEach((it, i) => {
        const lab = it.s.trim();
        if (!isLabel(lab) || out[labelKey(lab)] !== undefined) return;
        const nx = l.items[i + 1];
        out[labelKey(lab)] = nx && !isLabel(nx.s.trim()) ? { v: nx.s.trim(), x: nx.x, li } : { v: '', x: null, li };
      }));
      return out;
    };

    const payer = section('^PAYER\\s*DETAILS', '^PAYEE\\s*DET|^ASSIGNEE');
    const P = pairs(payer);
    if (P.email) raw.email = P.email.v;
    if (P.mobileno) raw.phone = P.mobileno.v;
    const home = P.residencetel && !isBlank(P.residencetel.v) ? P.residencetel.v : P.officetel ? P.officetel.v : '';
    raw.homeTel = home;
    if (!raw.name && P.name) raw.name = P.name.v;
    // OCR may drop the spaces in one copy of the name; keep the copy that has them
    if (raw.name && P.name && P.name.v.replace(/\s/g, '') === raw.name.replace(/\s/g, '') && P.name.v.length > raw.name.length) raw.name = P.name.v;
    if (!raw.nric && P.idno) raw.nric = P.idno.v;
    if (P.address && P.address.x != null) {
      // address continues on following lines at the same x position
      const parts = [P.address.v];
      for (let li = P.address.li + 1; li < payer.length; li++) {
        const it = payer[li].items.find(i => Math.abs(i.x - P.address.x) < 10);
        if (!it) break; parts.push(it.s.trim());
      }
      const sp = splitAddress(parts.join(' '));
      raw.address = sp.address; raw.postcode = sp.postcode; raw.town = sp.town;
      if (sp.unsure) notes.push('address');
    }

    const agent = section('^AGENT\\s*DETAILS', '^Immediate\\s*officer|^TRANSACTION|^GSM');
    const A = pairs(agent);
    if (A.name) raw.accountManager = A.name.v;
    if (A['a/cno']) raw.agentCode = A['a/cno'].v;
    if (A.contactno) raw.agentPhone = A.contactno.v;

    // Status + first benefit (plan name may wrap over several lines in the first column)
    const st = text.match(/Policy Status\s+([A-Za-z() -]+?)(?:\s{1}Currency|\n|$)/); if (st) raw.policyStatus = st[1].trim();
    const bi = lines.findIndex(l => /^BENEFIT DETAILS/.test(l.text));
    if (bi >= 0) {
      const first = lines.slice(bi + 1).findIndex(l => /\d{2}\/\d{2}\/\d{4}/.test(l.text));
      if (first >= 0) {
        const row = lines[bi + 1 + first], x0 = row.items[0].x, parts = [row.items[0].s.trim()];
        for (const l of lines.slice(bi + 2 + first)) { if (l.items.length !== 1 && !(l.items[0].x < x0 + 3 && l.items.length <= 2)) break; if (Math.abs(l.items[0].x - x0) > 3) break; parts.push(l.items[0].s.trim()); }
        raw.planName = parts.join(' ');
      }
    }
    const rec = makeRecord(raw, 'ePartner printout');
    if (notes.includes('address')) for (const k of ['address', 'postcode', 'town']) if (rec.fields[k].status === 'ok' || k !== 'address') { rec.fields[k].status = rec.fields[k].value ? 'check' : 'missing'; rec.fields[k].note = 'Could not split postcode/town from the address - please check'; }
    return [rec];
  }

  // ---------- tables (Excel rows, or a list in a PDF / picture) ----------
  // rows: array of arrays. Finds the header row and maps columns to fields.
  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const map = {}; let hits = 0;
      (rows[r] || []).forEach((h, c) => { const k = fieldForHeader(h); if (k && !Object.values(map).includes(k)) { map[c] = k; hits++; } });
      if (hits >= 2) return { row: r, map };
    }
    return null;
  }

  function parseRows(rows, source, mapOverride) {
    const hdr = findHeader(rows);
    if (!hdr) return { records: [], error: 'Could not find a header row (e.g. Name, Birthday, Phone, Email). Add column titles to the first row and try again.' };
    const map = mapOverride || hdr.map;
    const records = [];
    for (let r = hdr.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every(isBlank)) continue;
      const raw = {};
      for (const c in map) if (map[c]) raw[map[c]] = row[c];
      if (Object.values(raw).every(isBlank)) continue;
      if (raw.address && !raw.postcode) { const sp = splitAddress(raw.address); if (!sp.unsure) Object.assign(raw, sp); }
      records.push(makeRecord(raw, source + ' row ' + (r + 1)));
    }
    return { records, header: rows[hdr.row], map, headerRow: hdr.row };
  }

  // A list laid out as a table in a PDF/picture: header line items give column x positions.
  function linesToRows(lines) {
    const hi = lines.findIndex(l => l.items.filter(i => fieldForHeader(i.s)).length >= 2);
    if (hi < 0) return null;
    const cols = lines[hi].items.map(i => ({ h: i.s.trim(), x: i.x }));
    const rows = [cols.map(c => c.h)];
    for (const l of lines.slice(hi + 1)) {
      const row = cols.map(() => '');
      for (const it of l.items) { let c = 0; cols.forEach((k, j) => { if (it.x >= k.x - 6) c = j; }); row[c] = (row[c] ? row[c] + ' ' : '') + it.s.trim(); }
      // a cell that wraps onto a second line: first column empty -> belongs to the row above
      if (!row[0] && rows.length > 1) { const prev = rows[rows.length - 1]; row.forEach((v, j) => { if (v) prev[j] = (prev[j] ? prev[j] + ' ' : '') + v; }); continue; }
      rows.push(row);
    }
    return rows;
  }

  // "Label: value" text (a client details sheet, a screenshot of a CRM page, ...)
  function parseLabelValue(lines, source) {
    const raw = {};
    for (const l of lines) {
      const segs = l.text.split(/\s{2,}|\t|(?<=:)\s+(?=[A-Z][a-z]+\s?[A-Za-z]*\s?:)/);
      for (const seg of segs) {
        const m = seg.match(/^\s*([A-Za-z][A-Za-z ./#()-]{1,30}?)\s*[:：]\s*(.+)$/);
        if (!m) continue;
        const k = fieldForHeader(m[1]);
        if (k && raw[k] === undefined) raw[k] = m[2];
      }
    }
    // email / NRIC can be recognised on their own even without a label
    const text = lines.map(l => l.text).join('\n');
    if (!raw.email) { const e = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/); if (e) raw.email = e[0]; }
    if (!raw.nric) { const n = text.match(/\b\d{6}-\d{2}-\d{4}\b/); if (n) raw.nric = n[0]; }
    const found = Object.keys(raw).length;
    if (found < 2) return [];
    return [makeRecord(raw, source)];
  }

  // Main entry for text-based sources (PDF text layer or OCR)
  function parseLines(lines, source) {
    const text = lines.map(l => l.text).join('\n');
    if (isEPartner(text)) return { records: parseEPartner(lines), kind: 'ePartner printout' };
    const rows = linesToRows(lines);
    if (rows && rows.length > 1) { const r = parseRows(rows, source); if (r.records.length) return { records: r.records, kind: 'customer list' }; }
    const lv = parseLabelValue(lines, source);
    if (lv.length) return { records: lv, kind: 'client details' };
    return { records: [], kind: 'unknown', error: 'No client details recognised in this file.' };
  }

  const api = { FIELDS, SYNONYMS, fieldForHeader, cleanField, makeRecord, crossCheck, splitAddress, toLines, parseLines, parseRows, findHeader, isEPartner };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.W2GParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
