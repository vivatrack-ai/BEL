/* ============================================================
   Evenuefy Admin — Space Booking Dashboard & Transaction Dashboard
   Data = live applications raised from the exhibitor portal
   (Book Space → approval → slab payments) + a deterministic demo
   book of applications built from the real exhibitor list, so the
   dashboards read like a running event. Rates, stall sizes, halls
   and the 25/50/25 slab plan mirror the exhibitor-side flow.
   ============================================================ */

'use strict';

const SBD_HALLS = ['A', 'B', 'C', 'D', 'E'];
const SBD_RATE = { 108: { shell: 125000, raw: 250000 }, 54: { shell: 65000, raw: 130000 }, 36: { shell: 45000, raw: 90000 } };
const SBD_SIZE = { 108: '12X9', 54: '9X6', 36: '6X6' };
const SBD_SLABS = [['Slab 1 — 25% Advance', 0.25, '15 Oct 2026'], ['Slab 2 — 50%', 0.5, '15 Dec 2026'], ['Slab 3 — 25% Balance', 0.25, '15 Jan 2027']];
const SBD_METHODS = ['Card', 'Net Banking', 'UPI', 'RTGS'];
const SBD_STALLS_PER_HALL = 12;
/* Chalet Line 1 — 10 chalets × 100 sqm, booked as 1 Floor / 2 Floor */
const SBD_CHALETS = 10;
const SBD_CHALET_RATE = { chalet1: 600000, chalet2: 1000000 };
const SBD_ZONES = SBD_HALLS.concat(['CH']);
const sbdZoneLabel = (z) => (z === 'CH' ? 'Chalet Line 1' : 'Hall ' + z);
const sbdZoneUnits = (z) => (z === 'CH' ? SBD_CHALETS : SBD_STALLS_PER_HALL);
const sbdZoneSqm = (z) => (z === 'CH' ? SBD_CHALETS * 100 : 4 * 108 + 4 * 54 + 4 * 36);
const SBD_SCHEMES = [['shell', 'Shell'], ['raw', 'Raw'], ['chalet1', 'Chalet · 1 Floor'], ['chalet2', 'Chalet · 2 Floor']];
const sbdSchemeLabel = (sc) => (SBD_SCHEMES.find((x) => x[0] === sc) || [sc, sc])[1];
const SBD_CAPACITY_SQM = SBD_ZONES.reduce((a, z) => a + sbdZoneSqm(z), 0);
const SBD_STATUS = {
  pending: ['amber', 'Waiting for Approval', '#C98514'],
  approved: ['blue', 'Approved · Payment Due', '#2F62D8'],
  confirmed: ['green', 'Confirmed', '#1E8E5A'],
  rejected: ['red', 'Rejected', '#C6432E'],
};

function sbdHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function sbdDaysAgo(n, seed) {
  const d = new Date(); d.setHours(9 + (seed % 9), (seed * 7) % 60, 0, 0); d.setDate(d.getDate() - n);
  return d;
}
const sbdFmt = (d) => d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const sbdDay = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
function sbdCompact(n) {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return money(n);
}

/* organiser decisions on demo applications (live ones are written to the exhibitor state) */
const SBD_DEC_KEY = 'evenuefy_sbd_decisions_v1';
function sbdDecisions() { try { return JSON.parse(localStorage.getItem(SBD_DEC_KEY)) || {}; } catch (e) { return {}; } }
function sbdSaveDecision(id, d) { const all = sbdDecisions(); all[id] = d; try { localStorage.setItem(SBD_DEC_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } }

/* ---------------- unified booking book ---------------- */
function sbdBookings() {
  const out = [];
  const ex = loadExState() || {};
  const orders = ex.orders || [];
  const taken = {};

  /* 1 · live applications from the exhibitor portal */
  ((ex.spaceBooking && ex.spaceBooking.applications) || []).forEach((a) => {
    const slabs = (a.slabs || []).map((sl, i) => {
      const o = orders.find((x) => x.refId === a.id + '#slab' + i);
      return { label: sl.label, amount: sl.amount, due: sl.due, paidAt: o ? (parseTs(o.paidAt) || new Date()) : null,
        method: o ? 'Card' : '', txn: o ? o.orderNo : '' };
    });
    if (a.status !== 'rejected') a.stalls.forEach((s) => { taken[s.hall + '|' + s.name] = true; });
    out.push({ id: a.id, no: a.no, company: EX_COMPANY, regNo: 'EXHC00001', source: 'live',
      stalls: a.stalls.map((s) => ({ hall: s.hall, name: s.name, sqm: s.sqm, size: s.size, scheme: s.scheme, price: s.price, sides: s.sides })),
      total: a.total, status: a.status, createdAt: parseTs(a.createdAt) || new Date(), slabs: slabs,
      remark: a.remark || '', approvedBy: a.approvedBy || '', approvedAt: a.approvedAt || '' });
  });

  /* 2 · deterministic demo applications (≈70% of inventory) */
  const exs = (window.ADMIN_DATA && ADMIN_DATA.exhibitors) || [];
  let k = 0;
  SBD_HALLS.forEach((hall, hi) => {
    for (let n = 1; n <= SBD_STALLS_PER_HALL; n++) {
      const name = hall + '8.' + n;
      const h = sbdHash('sbd' + name);
      const seedBooked = (n + hi) % 4 === 0;       // same stalls the exhibitor floor plan shows as Booked
      if (taken[hall + '|' + name] || !(seedBooked || h % 10 < 6) || !exs.length) continue;
      const sqm = n <= 4 ? 108 : n <= 8 ? 54 : 36;
      const scheme = h % 3 === 0 ? 'raw' : 'shell';
      const price = SBD_RATE[sqm][scheme];
      const r = (h >>> 4) % 10;
      const status = seedBooked ? 'confirmed' : r < 2 ? 'pending' : r === 2 ? 'rejected' : r < 6 ? 'approved' : 'confirmed';
      const age = 3 + (h % 27);
      const company = exs[(k * 7 + hi) % exs.length];
      const paidCount = status === 'confirmed' ? 3 : status === 'approved' ? (h >>> 7) % 3 : 0;
      const slabs = SBD_SLABS.map(([label, pct, due], i) => {
        const paid = i < paidCount;
        let ago = age - 2 - i * 5 - ((h >>> (i + 2)) % 3);
        if (ago < 1) ago = 1 + ((h >>> (i + 5)) % 6); // spread recent payments, no false spike on today
        return { label: label, amount: Math.round(price * pct), due: due,
          paidAt: paid ? sbdDaysAgo(ago, h >>> (i + 1)) : null,
          method: paid ? SBD_METHODS[(h >>> (i * 3)) % SBD_METHODS.length] : '',
          txn: paid ? 'TXN' + String(sbdHash(name + i)).slice(0, 9) : '' };
      });
      out.push({ id: 'sbd_' + name, no: '#' + String(40000000 + (h % 59999999)), company: company.company, regNo: company.regNo || '',
        exId: company.id, source: 'demo', stalls: [{ hall: hall, name: name, sqm: sqm, size: SBD_SIZE[sqm], scheme: scheme, price: price, sides: n % 2 ? '2 Sides' : '1 Side' }],
        total: price, status: status, createdAt: sbdDaysAgo(age, h), slabs: (status === 'approved' || status === 'confirmed') ? slabs : [] });
      k++;
    }
  });
  for (let n = 1; n <= SBD_CHALETS; n++) {
    const name = 'CH-' + String(n).padStart(2, '0');
    const h = sbdHash('sbd' + name);
    const seedBooked = n % 4 === 0;                  // same chalets the exhibitor layout shows as Booked
    if (taken['CH|' + name] || !(seedBooked || h % 10 < 6) || !exs.length) continue;
    const scheme = h % 2 === 0 ? 'chalet2' : 'chalet1';
    const price = SBD_CHALET_RATE[scheme];
    const r = (h >>> 4) % 10;
    const status = seedBooked ? 'confirmed' : r < 2 ? 'pending' : r === 2 ? 'rejected' : r < 6 ? 'approved' : 'confirmed';
    const age = 3 + (h % 27);
    const company = exs[(k * 7 + 5) % exs.length];
    const paidCount = status === 'confirmed' ? 3 : status === 'approved' ? (h >>> 7) % 3 : 0;
    const slabs = SBD_SLABS.map(([label, pct, due], i) => {
      const paid = i < paidCount;
      let ago = age - 2 - i * 5 - ((h >>> (i + 2)) % 3);
      if (ago < 1) ago = 1 + ((h >>> (i + 5)) % 6);
      return { label: label, amount: Math.round(price * pct), due: due,
        paidAt: paid ? sbdDaysAgo(ago, h >>> (i + 1)) : null,
        method: paid ? SBD_METHODS[(h >>> (i * 3)) % SBD_METHODS.length] : '',
        txn: paid ? 'TXN' + String(sbdHash(name + i)).slice(0, 9) : '' };
    });
    out.push({ id: 'sbd_' + name, no: '#' + String(40000000 + (h % 59999999)), company: company.company, regNo: company.regNo || '',
      exId: company.id, source: 'demo', stalls: [{ hall: 'CH', name: name, sqm: 100, size: '10X10', scheme: scheme, price: price, sides: '4 Sides' }],
      total: price, status: status, createdAt: sbdDaysAgo(age, h), slabs: (status === 'approved' || status === 'confirmed') ? slabs : [] });
    k++;
  }
  const dec = sbdDecisions();
  out.forEach((b) => {
    const d = b.source === 'demo' && dec[b.id];
    if (!d || b.status !== 'pending') return;
    b.status = d.status; b.remark = d.remark || ''; b.approvedBy = d.by || ''; b.approvedAt = d.at || '';
    if (d.status === 'approved') b.slabs = SBD_SLABS.map(([label, pct, due]) => ({ label: label, amount: Math.round(b.total * pct), due: due, paidAt: null, method: '', txn: '' }));
  });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

const sbdSqm = (b) => b.stalls.reduce((a, s) => a + s.sqm, 0);
const sbdPaid = (b) => b.slabs.reduce((a, s) => a + (s.paidAt ? s.amount : 0), 0);
const sbdPill = (st) => '<span class="pill ' + SBD_STATUS[st][0] + '">' + SBD_STATUS[st][1] + '</span>';

/* ---------------- shared chart pieces (accessible: labels + legend + tooltips) ---------------- */
function sbdBarRows(rows, fmtVal) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return '<div class="bar-rows">' + rows.map(([label, v, sub, color]) =>
    '<div class="bar-row" title="' + esc(label) + ': ' + esc(fmtVal(v)) + (sub ? ' · ' + esc(sub) : '') + '"><span>' + esc(label) + '</span>' +
    '<span class="track"><i class="fill" style="width:' + Math.max(v ? 2 : 0, Math.round((v / max) * 100)) + '%' + ';background:' + (color || '#2F62D8') + '"></i></span>' +
    '<span class="val">' + fmtVal(v) + '</span></div>').join('') + '</div>';
}

function sbdLegend(keys) {
  return '<div class="sbd-legend">' + keys.map((k) =>
    '<span><i style="background:' + (k === 'available' ? '#E3E8F1' : SBD_STATUS[k][2]) + '"></i>' +
    (k === 'available' ? 'Available' : SBD_STATUS[k][1]) + '</span>').join('') + '</div>';
}

/* ---------------- filters ---------------- */
const SBDF = { hall: '', scheme: '' };
function sbdSet(k, v) { SBDF[k] = v; render(); }
function sbdFilter(list) {
  return list.filter((b) =>
    (!SBDF.hall || b.stalls.some((s) => s.hall === SBDF.hall)) &&
    (!SBDF.scheme || b.stalls.some((s) => s.scheme === SBDF.scheme)));
}
function sbdFilterBar(extra) {
  const sel = (k, opts, all) => '<select onchange="sbdSet(\'' + k + '\', this.value)" style="' + dateInputStyle + ';cursor:pointer">' +
    '<option value="">' + all + '</option>' + opts.map(([v, l]) => '<option value="' + v + '"' + (SBDF[k] === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    sel('hall', SBD_ZONES.map((h) => [h, sbdZoneLabel(h)]), 'All Halls & Chalets') +
    sel('scheme', SBD_SCHEMES, 'All Space Types') + (extra || '') +
    ((SBDF.hall || SBDF.scheme) ? '<button class="btn btn-outline btn-sm" onclick="SBDF.hall=\'\';SBDF.scheme=\'\';render()"><span class="material-symbols-outlined" style="font-size:15px">filter_alt_off</span>Clear</button>' : '') +
  '</div>';
}

/* ============================================================
   VIEW · Space Booking Dashboard
   ============================================================ */
function viewBookingDashboard() {
  const all = sbdFilter(sbdBookings());
  const by = (st) => all.filter((b) => b.status === st);
  const active = all.filter((b) => b.status === 'approved' || b.status === 'confirmed');
  const bookedSqm = active.reduce((a, b) => a + sbdSqm(b), 0);
  const capacity = SBDF.hall ? sbdZoneSqm(SBDF.hall) : SBD_CAPACITY_SQM;
  const occ = Math.round((bookedSqm / capacity) * 100);
  const value = active.reduce((a, b) => a + b.total, 0);

  /* hall-wise occupancy — stacked by status, counted in stalls */
  const halls = SBDF.hall ? [SBDF.hall] : SBD_ZONES;
  const hallRows = halls.map((h) => {
    const seg = { confirmed: 0, approved: 0, pending: 0 };
    all.forEach((b) => { if (seg[b.status] != null) b.stalls.forEach((s) => { if (s.hall === h) seg[b.status]++; }); });
    const used = seg.confirmed + seg.approved + seg.pending;
    const units = sbdZoneUnits(h);
    const unit = h === 'CH' ? 'chalet(s)' : 'stall(s)';
    const avail = Math.max(0, units - used);
    const part = (k, n) => n ? '<i style="flex:' + n + ';background:' + (k === 'available' ? '#E3E8F1' : SBD_STATUS[k][2]) + '" title="' + sbdZoneLabel(h) + ' · ' +
      (k === 'available' ? 'Available' : SBD_STATUS[k][1]) + ': ' + n + ' ' + unit + '"></i>' : '';
    return '<div class="occ-row"><b>' + sbdZoneLabel(h) + '</b>' +
      '<div class="stack-bar">' + part('confirmed', seg.confirmed) + part('approved', seg.approved) + part('pending', seg.pending) + part('available', avail) + '</div>' +
      '<span class="occ-val">' + (seg.confirmed + seg.approved) + ' / ' + units + ' booked · ' + seg.pending + ' pending</span></div>';
  }).join('');

  const schemeRows = SBD_SCHEMES.map(([sc, lbl]) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.scheme === sc);
    return [sc.startsWith('chalet') ? lbl : lbl + ' Space', st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  const sizeRows = [108, 54, 36, 100].map((q) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.sqm === q);
    return [q === 100 ? 'Chalet 10X10 (100 sqm)' : SBD_SIZE[q] + ' (' + q + ' sqm)', st.length, money(st.reduce((a, s) => a + s.price, 0))];
  });
  const statusRows = Object.keys(SBD_STATUS).map((k) => [SBD_STATUS[k][1], by(k).length, '', SBD_STATUS[k][2]]);


  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Dashboard</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Stall &amp; chalet applications raised from Book Space, their approval status and hall occupancy.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile blue"><div class="t-label">Total Applications</div><div class="t-value">' + all.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Waiting for Approval</div><div class="t-value">' + by('pending').length + '</div></div>' +
      '<div class="tile"><div class="t-label">Approved · Payment Due</div><div class="t-value">' + by('approved').length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Confirmed</div><div class="t-value">' + by('confirmed').length + '</div></div>' +
      '<div class="tile"><div class="t-label">Rejected</div><div class="t-value">' + by('rejected').length + '</div></div>' +
    '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><div class="t-label">Booked Area</div><div class="t-value">' + bookedSqm.toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + capacity.toLocaleString('en-IN') + ' sqm</span></div></div>' +
      '<div class="tile"><div class="t-label">Occupancy</div><div class="t-value">' + occ + '%</div>' +
        '<div class="prog-bar" style="margin-top:6px" title="' + occ + '% of capacity booked"><i style="width:' + occ + '%"></i></div></div>' +
      '<div class="tile accent"><div class="t-label">Booking Value (Approved + Confirmed)</div><div class="t-value">' + sbdCompact(value) + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Hall &amp; Chalet Occupancy</h2>' + sbdLegend(['confirmed', 'approved', 'pending', 'available']) + '</div>' +
      hallRows + '</div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Booked Units by Space Type</h2>' + sbdBarRows(schemeRows, (v) => v + ' units') + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Booked Units by Size</h2>' + sbdBarRows(sizeRows, (v) => v + ' units') + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Applications by Status</h2>' + sbdBarRows(statusRows, (v) => String(v)) + '</div>' +
    footerTools();
}

/* ============================================================
   VIEW · Space Booking Transaction Dashboard
   ============================================================ */
const SBDT = { method: '', dateMode: '', from: '', to: '', q: '', page: 1 };
function sbdtSet(k, v) { SBDT[k] = v; SBDT.page = 1; render(); }
function sbdtSetQ(v) { SBDT.q = v; SBDT.page = 1; render(); const el = $('sbdtQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }

function sbdTransactions(bookings) {
  const tx = [];
  bookings.forEach((b) => b.slabs.forEach((s, i) => {
    if (!s.paidAt) return;
    tx.push({ txn: s.txn, at: s.paidAt, no: b.no, company: b.company, hall: b.stalls.map((x) => x.hall).join(', '),
      stalls: b.stalls.map((x) => x.name).join(', '), slab: i + 1, slabLabel: s.label, method: s.method || 'Card', amount: s.amount });
  }));
  return tx.sort((a, b) => b.at - a.at);
}

function exportSbdTransactions(list) {
  exportWorkbook('Space-Booking-Transactions-' + exportStamp(), [{
    name: 'Transactions',
    headers: ['Txn ID', 'Paid At', 'Application No', 'Exhibitor', 'Hall / Chalet Line', 'Stall / Chalet', 'Slab', 'Method', 'Amount (INR)', 'Status'],
    rows: list.map((t) => [t.txn, sbdFmt(t.at), t.no, t.company, t.hall.split(', ').map(sbdZoneLabel).join(', '), t.stalls, t.slabLabel, t.method, t.amount, 'Success']),
  }]);
}

function viewBookingTransactions() {
  const books = sbdFilter(sbdBookings()).filter((b) => b.status === 'approved' || b.status === 'confirmed');
  const value = books.reduce((a, b) => a + b.total, 0);
  const collected = books.reduce((a, b) => a + sbdPaid(b), 0);
  const outstanding = value - collected;
  const rate = value ? Math.round((collected / value) * 100) : 0;
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 864e5);
  let dueSoon = 0;
  books.forEach((b) => b.slabs.forEach((s) => { const d = parseTs(s.due); if (!s.paidAt && d && d <= soon) dueSoon += s.amount; }));

  let tx = sbdTransactions(books);
  const allTx = tx;

  /* slab-wise expected vs collected */
  const slabRows = SBD_SLABS.map(([label], i) => {
    const exp = books.reduce((a, b) => a + (b.slabs[i] ? b.slabs[i].amount : 0), 0);
    const got = books.reduce((a, b) => a + (b.slabs[i] && b.slabs[i].paidAt ? b.slabs[i].amount : 0), 0);
    const p = exp ? Math.round((got / exp) * 100) : 0;
    return '<div class="prog-row" title="' + esc(label) + ': ' + money(got) + ' collected of ' + money(exp) + '">' +
      '<div class="pr-head"><span>' + esc(label) + ' <span style="color:var(--muted);font-weight:600">· due ' + SBD_SLABS[i][2] + '</span></span>' +
      '<span>' + sbdCompact(got) + ' / ' + sbdCompact(exp) + ' (' + p + '%)</span></div>' +
      '<div class="prog-bar"><i style="width:' + p + '%"></i></div></div>';
  }).join('');

  /* 14-day collection trend (single series → no legend; hover = exact value) */
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const perDay = days.map((d) => allTx.filter((t) => { const x = new Date(t.at); x.setHours(0, 0, 0, 0); return x.getTime() === d.getTime(); })
    .reduce((a, t) => a + t.amount, 0));
  const dMax = Math.max(...perDay, 1);
  const peak = perDay.indexOf(Math.max(...perDay));
  const trend = '<div class="col-chart">' + days.map((d, i) =>
    '<div class="col" title="' + sbdDay(d) + ': ' + money(perDay[i]) + '">' +
      (i === peak && perDay[i] ? '<span class="col-lbl">' + sbdCompact(perDay[i]) + '</span>' : '') +
      '<i style="height:' + Math.max(perDay[i] ? 3 : 0, Math.round((perDay[i] / dMax) * 100)) + '%"></i>' +
      '<span class="col-x">' + (i % 2 === 0 ? sbdDay(d) : '') + '</span></div>').join('') + '</div>';

  const methodRows = SBD_METHODS.map((m) => [m, allTx.filter((t) => t.method === m).reduce((a, t) => a + t.amount, 0),
    allTx.filter((t) => t.method === m).length + ' txns']);
  const hallRows = SBD_ZONES.filter((h) => !SBDF.hall || h === SBDF.hall).map((h) =>
    [ sbdZoneLabel(h), allTx.filter((t) => t.hall.split(', ').includes(h)).reduce((a, t) => a + t.amount, 0), '' ]);

  /* table filters */
  if (SBDT.method) tx = tx.filter((t) => t.method === SBDT.method);
  const r = dateFilterRange(SBDT);
  if (r.from || r.to) tx = tx.filter((t) => inDateRange(sbdFmt(t.at), r.from, r.to));
  const q = SBDT.q.toLowerCase();
  if (q) tx = tx.filter((t) => (t.txn + ' ' + t.no + ' ' + t.company + ' ' + t.stalls).toLowerCase().includes(q));
  window.__sbdtList = tx;
  const rows = 10;
  const pages = Math.max(1, Math.ceil(tx.length / rows));
  if (SBDT.page > pages) SBDT.page = pages;
  const st = (SBDT.page - 1) * rows;
  const trs = tx.slice(st, st + rows).map((t) =>
    '<tr><td><span class="regno">' + esc(t.txn) + '</span></td><td>' + sbdFmt(t.at) + '</td>' +
    '<td><span class="regno">' + esc(t.no) + '</span></td><td class="td-strong">' + esc(t.company) + '</td>' +
    '<td>' + esc(t.hall.split(', ').map(sbdZoneLabel).join(', ')) + '<span class="td-sub">' + esc(t.stalls) + '</span></td>' +
    '<td>' + esc(t.slabLabel) + '</td><td>' + esc(t.method) + '</td>' +
    '<td class="money">' + money(t.amount) + '</td><td><span class="pill green">Success</span></td></tr>').join('') ||
    '<tr><td colspan="9" style="color:var(--muted)">No transactions for the selected filters.</td></tr>';

  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Transactions</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Slab payments (25% · 50% · 25%) collected against approved and confirmed stall &amp; chalet bookings.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile blue"><div class="t-label">Total Booking Value</div><div class="t-value">' + sbdCompact(value) + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Collected</div><div class="t-value">' + sbdCompact(collected) + '</div></div>' +
      '<div class="tile"><div class="t-label">Outstanding</div><div class="t-value">' + sbdCompact(outstanding) + '</div></div>' +
      '<div class="tile"><div class="t-label">Due in Next 30 Days</div><div class="t-value">' + sbdCompact(dueSoon) + '</div></div>' +
      '<div class="tile"><div class="t-label">Transactions</div><div class="t-value">' + allTx.length + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Collection Progress</h2><span class="result-count">' + rate + '% of booking value collected</span></div>' +
      '<div class="prog-bar" style="height:12px" title="' + money(collected) + ' of ' + money(value) + '"><i style="width:' + rate + '%"></i></div>' +
      '<div style="margin-top:18px">' + slabRows + '</div></div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Daily Collections — Last 14 Days</h2>' + trend + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Collections by Payment Method</h2>' + sbdBarRows(methodRows, sbdCompact) + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Collections by Hall</h2>' + sbdBarRows(hallRows, sbdCompact) + '</div>' +
    '<div class="card section-gap"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Transactions</h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
        '<span class="result-count">' + tx.length + ' of ' + allTx.length + '</span>' +
        '<input type="text" id="sbdtQ" value="' + esc(SBDT.q) + '" placeholder="Search txn, application, exhibitor" oninput="sbdtSetQ(this.value)" style="' + dateInputStyle + ';min-width:220px">' +
        '<select onchange="sbdtSet(\'method\', this.value)" style="' + dateInputStyle + ';cursor:pointer"><option value="">Method: All</option>' +
          SBD_METHODS.map((m) => '<option' + (SBDT.method === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
        toolbarDateSel(SBDT, 'sbdtDateMode', 'sbdtFrom', 'sbdtTo') +
        '<button class="btn btn-outline btn-sm" onclick="exportSbdTransactions(window.__sbdtList)"' + (tx.length ? '' : ' disabled') + '><span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
      '</div></div>' +
      '<div class="tablewrap"><table class="grid"><tr><th>Txn ID</th><th>Paid At</th><th>Application</th><th>Exhibitor</th><th>Hall / Stall</th><th>Slab</th><th>Method</th><th>Amount</th><th>Status</th></tr>' +
      trs + '</table></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px;font-size:0.8rem;color:var(--muted)">' +
        '<span>Total: <b>' + tx.length + '</b> · Rows ' + rows + '</span>' +
        '<span style="display:flex;align-items:center;gap:8px">Showing <b>' + (tx.length ? st + 1 : 0) + '</b> to <b>' + Math.min(st + rows, tx.length) + '</b>' +
          '<button class="btn btn-outline btn-sm" onclick="SBDT.page--;render()"' + (SBDT.page <= 1 ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_left</span></button>' +
          '<button class="btn btn-outline btn-sm" onclick="SBDT.page++;render()"' + (SBDT.page >= pages ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_right</span></button>' +
        '</span></div></div>' + footerTools();
}
function sbdtDateMode(v) { SBDT.dateMode = v; if (v !== 'custom') { SBDT.from = ''; SBDT.to = ''; } SBDT.page = 1; render(); }
function sbdtFrom(v) { SBDT.from = v; SBDT.page = 1; render(); }
function sbdtTo(v) { SBDT.to = v; SBDT.page = 1; render(); }

/* ============================================================
   VIEW · Space Applications (Booking Approvals) — platform-style
   list of every stall / chalet application with approval + payment
   progress; the ⋯ menu / row click opens a detail drawer that holds
   the space specifications, payment summary, slab schedule and the
   Approve / Reject actions — one screen for the whole flow.
   ============================================================ */
const SBA = { q: '', type: '', status: '', dateMode: '', from: '', to: '', rows: 10, page: 1 };
const SBA_STATUS = {
  pending: ['schedule', '#C98514', 'Waiting for Approval', 'amber'],
  approved: ['check_circle', '#2F62D8', 'Approved', 'blue'],
  confirmed: ['check_circle', '#1E8E5A', 'Confirmed', 'green'],
  rejected: ['cancel', '#C6432E', 'Rejected', 'red'],
};
function sbaSet(k, v) { SBA[k] = v; SBA.page = 1; render(); }
function sbaSetQ(v) { SBA.q = v; SBA.page = 1; render(); const el = $('sbaQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function sbaPage(p) { SBA.page = p; render(); }
function sbaFrom(v) { SBA.from = v; SBA.page = 1; render(); }
function sbaTo(v) { SBA.to = v; SBA.page = 1; render(); }
function sbaClear() { Object.assign(SBA, { q: '', type: '', status: '', dateMode: '', from: '', to: '', page: 1 }); render(); }

const sbaType = (b) => (b.stalls.every((s) => s.hall === 'CH') ? 'chalet' : 'space');
const sbaTypeLabel = (b) => (sbaType(b) === 'chalet' ? 'Chalet' : 'Pre-defined Space');
const sbaTypeChip = (b) => '<span class="sba-type"><span class="material-symbols-outlined">' + (sbaType(b) === 'chalet' ? 'cottage' : 'apps') + '</span>' + sbaTypeLabel(b) + '</span>';
const sbaDate = (d) => d.getDate() + ' ' + d.toLocaleString('en-US', { month: 'short' }) + ', ' + String(d.getFullYear()).slice(2);
const sbaTime = (d) => d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
const sbaStatus = (st) => '<span class="sba-status"><span class="material-symbols-outlined" style="color:' + SBA_STATUS[st][1] + '">' + SBA_STATUS[st][0] + '</span>' +
  SBA_STATUS[st][2] + '</span>';
const sbaDesign = (s) => (s.hall === 'CH' ? sbdSchemeLabel(s.scheme) : sbdSchemeLabel(s.scheme) + ' (' + (s.sides || '1 Side') + ')');
const sbaSides = (s) => (s.sides || '1 Side') + ' Open';
function sbaReceived(b) {
  const paid = sbdPaid(b);
  const pct = b.total ? Math.round((paid / b.total) * 100) : 0;
  return { paid: paid, pct: pct, due: b.total - paid };
}

function viewSpaceApprovals() {
  const every = sbdBookings();
  let list = every;
  if (SBA.type) list = list.filter((b) => sbaType(b) === SBA.type);
  if (SBA.status) list = list.filter((b) => b.status === SBA.status);
  const r = dateFilterRange(SBA);
  if (r.from || r.to) list = list.filter((b) => inDateRange(sbdFmt(b.createdAt), r.from, r.to));
  const q = SBA.q.trim().toLowerCase();
  if (q) list = list.filter((b) => (b.no + ' ' + b.company + ' ' + b.regNo + ' ' + b.stalls.map((s) => s.name).join(' ')).toLowerCase().includes(q));
  window.__sbaList = list;

  const pages = Math.max(1, Math.ceil(list.length / SBA.rows));
  if (SBA.page > pages) SBA.page = pages;
  const st = (SBA.page - 1) * SBA.rows;
  const trs = list.slice(st, st + SBA.rows).map((b) => {
    const rc = sbaReceived(b);
    return '<tr class="sba-row" onclick="sbaOpen(\'' + b.id + '\')">' +
      '<td><i class="sba-no">' + esc(b.no.replace('#', '')) + '</i></td>' +
      '<td><span class="td-strong">' + esc(b.company) + '</span>' + (b.regNo ? '<span class="td-sub">' + esc(b.regNo) + '</span>' : '') + '</td>' +
      '<td>' + sbaTypeChip(b) + '</td>' +
      '<td>' + b.stalls.map((s) => esc(sbdZoneLabel(s.hall))).join('<br>') + '</td>' +
      '<td class="sba-area">' + b.stalls.map((s) => 'Area: ' + s.sqm + 'm²<br>Size: ' + esc(s.size)).join('<br>') + '</td>' +
      '<td>' + b.stalls.map((s) => esc(sbaDesign(s))).join('<br>') + '</td>' +
      '<td><div class="sba-recv" title="' + money(rc.paid) + ' received of ' + money(b.total) + '"><span class="sba-bar"><i style="width:' + rc.pct + '%"></i></span>' +
        '<b>' + rc.pct + '%</b><span class="material-symbols-outlined">info</span></div></td>' +
      '<td>' + sbaStatus(b.status) + '</td>' +
      '<td style="white-space:nowrap">' + sbaDate(b.createdAt) + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="sba-act">' +
        '<button class="sba-dots" onclick="sbaMenu(this)" aria-label="Actions"><span class="material-symbols-outlined">more_horiz</span></button>' +
        '<div class="sba-menu"><div class="sba-menu-h">QUICK ACTIONS</div>' +
          (b.status === 'pending'
            ? '<button onclick="sbaApprove(\'' + b.id + '\')"><span class="material-symbols-outlined">check_circle</span>Approve Request</button>' +
              '<button onclick="sbaReject(\'' + b.id + '\')"><span class="material-symbols-outlined">cancel</span>Disapprove Request</button>'
            : '<button disabled title="Already ' + SBA_STATUS[b.status][2].toLowerCase() + '"><span class="material-symbols-outlined">check_circle</span>Approve Request</button>' +
              '<button disabled title="Already ' + SBA_STATUS[b.status][2].toLowerCase() + '"><span class="material-symbols-outlined">cancel</span>Disapprove Request</button>') +
          '<button class="sba-menu-view" onclick="sbaOpen(\'' + b.id + '\')"><span class="material-symbols-outlined">visibility</span>View Full Details</button>' +
        '</div></div></td></tr>';
  }).join('') ||
    '<tr><td colspan="10" style="color:var(--muted);padding:28px;text-align:center">No applications match the selected filters.</td></tr>';

  const sel = (k, opts, all) => '<select class="sba-sel" onchange="sbaSet(\'' + k + '\', this.value)">' +
    '<option value="">' + all + '</option>' + opts.map(([v, l]) => '<option value="' + v + '"' + (SBA[k] === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const dateSel = sel('dateMode', DATE_PRESET_OPTS, 'All Dates (Created)') +
    (SBA.dateMode === 'custom' ? toolbarDates(SBA.from, SBA.to, 'sbaFrom', 'sbaTo') : '');
  const pend = every.filter((b) => b.status === 'pending').length;

  return '<div class="sba-head"><span class="material-symbols-outlined">inventory_2</span><h1 class="page-title" style="margin:0">Space Applications</h1>' +
      (pend ? '<span class="pill amber">' + pend + ' waiting for approval</span>' : '') + '</div>' +
    '<div class="card sba-card">' +
      '<div class="sba-toolbar">' +
        '<label class="sba-search"><span class="material-symbols-outlined">search</span>' +
          '<input id="sbaQ" placeholder="Search by Application No, Exhibitor Name" value="' + esc(SBA.q) + '" oninput="sbaSetQ(this.value)"></label>' +
        sel('type', [['space', 'Pre-defined Space'], ['chalet', 'Chalet']], 'All Type') +
        sel('status', Object.keys(SBA_STATUS).map((k) => [k, SBA_STATUS[k][2]]), 'All Status') +
        dateSel +
        ((SBA.q || SBA.type || SBA.status || SBA.dateMode)
          ? '<button class="sba-icon" title="Clear filters" onclick="sbaClear()"><span class="material-symbols-outlined">filter_alt_off</span></button>' : '') +
        '<button class="sba-icon" title="Export to Excel" onclick="exportSbaApplications()"><span class="material-symbols-outlined">download</span></button>' +
        '<button class="sba-icon" title="Refresh" onclick="render();toast(\'Applications refreshed\')"><span class="material-symbols-outlined">refresh</span></button>' +
      '</div>' +
      '<div class="tablewrap"><table class="grid sba-table"><tr><th>Application</th><th>Exhibitor</th><th>Application Type</th><th>Hall</th><th>Area</th>' +
        '<th>Stall Design</th><th>Received</th><th>Status</th><th>Created At</th><th>Action</th></tr>' + trs + '</table></div>' +
      '<div class="sba-foot"><span class="sba-total">Total: ' + list.length + '</span><span style="flex:1"></span>' +
        '<label class="sba-rows">Rows <select onchange="SBA.rows=+this.value;SBA.page=1;render()">' +
          [10, 25, 50].map((n) => '<option' + (SBA.rows === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<span class="sba-showing">Showing ' + (list.length ? st + 1 : 0) + ' to ' + Math.min(st + SBA.rows, list.length) + '</span>' +
        '<button class="sba-icon" ' + (SBA.page <= 1 ? 'disabled' : 'onclick="sbaPage(' + (SBA.page - 1) + ')"') + ' aria-label="Previous page"><span class="material-symbols-outlined">chevron_left</span></button>' +
        '<button class="sba-icon" ' + (SBA.page >= pages ? 'disabled' : 'onclick="sbaPage(' + (SBA.page + 1) + ')"') + ' aria-label="Next page"><span class="material-symbols-outlined">chevron_right</span></button>' +
      '</div></div>' + footerTools();
}

function sbaMenu(btn) {
  const m = btn.nextElementSibling;
  const open = m.classList.contains('open');
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  if (open) return;
  /* fixed popover so the table's scroll container never clips it */
  const r = btn.getBoundingClientRect();
  m.classList.add('open');
  const h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = (r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
}
window.addEventListener('scroll', () => document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open')), true);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sba-act')) document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
});

function exportSbaApplications() {
  const list = window.__sbaList || [];
  exportWorkbook('Space-Applications-' + exportStamp(), [{
    name: 'Applications',
    headers: ['Application No', 'Exhibitor', 'Reg No', 'Application Type', 'Hall / Chalet Line', 'Stall / Chalet', 'Area (sqm)', 'Size', 'Stall Design',
      'Total (INR)', 'Received (INR)', 'Received %', 'Status', 'Created At'],
    rows: list.map((b) => {
      const rc = sbaReceived(b);
      return [b.no, b.company, b.regNo, sbaTypeLabel(b), b.stalls.map((s) => sbdZoneLabel(s.hall)).join(', '), b.stalls.map((s) => s.name).join(', '),
        sbdSqm(b), b.stalls.map((s) => s.size).join(', '), b.stalls.map(sbaDesign).join(', '), b.total, rc.paid, rc.pct + '%', SBA_STATUS[b.status][2], sbdFmt(b.createdAt)];
    }),
  }]);
}

/* ---------------- detail drawer ---------------- */
function sbaClose() { const d = $('sbaDrawer'); if (d) d.remove(); }
function sbaOpen(id) {
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  const rc = sbaReceived(b);
  let exId = b.exId;
  if (!exId && typeof A !== 'undefined' && A.exhibitors) {
    const m = A.exhibitors.find((e) => /hindustan aeronautics/i.test(e.company));
    if (m) exId = m.id;
  }

  const spec = (k, v) => '<div class="sba-spec"><small>' + k + '</small><b>' + v + '</b></div>';
  const specs = b.stalls.map((s) => {
    const ch = s.hall === 'CH';
    return (b.stalls.length > 1 ? '<div class="sba-unit">' + esc(s.name) + '<span>' + money(s.price) + '</span></div>' : '') +
      '<div class="sba-specs">' +
        spec(ch ? 'Zone' : 'Hall', esc(sbdZoneLabel(s.hall))) + spec('Area', s.sqm + 'm²') + spec('Size', esc(s.size)) +
        spec(ch ? 'Chalet Type' : 'Stall Type', esc(ch ? (s.scheme === 'chalet2' ? '2 Floor' : '1 Floor') : sbdSchemeLabel(s.scheme))) +
        spec('Open Sides', esc(sbaSides(s))) + spec(ch ? 'Chalet' : 'Booth', esc(s.name)) +
      '</div>';
  }).join('');

  const slabRows = b.slabs.map((sl) =>
    '<tr><td><b>' + esc(sl.label) + '</b><span class="td-sub">Due ' + esc(sl.due) + '</span></td>' +
    '<td class="money">' + money(sl.amount) + '</td>' +
    '<td>' + (sl.paidAt ? '<span class="pill green">Paid</span><span class="td-sub">' + sbdFmt(sl.paidAt) + '</span>' : '<span class="pill amber">Due</span>') + '</td>' +
    '<td>' + (sl.paidAt ? esc(sl.method) + '<span class="td-sub regno">' + esc(sl.txn) + '</span>' : '<span style="color:var(--muted)">—</span>') + '</td></tr>').join('');
  const schedule = b.status === 'pending'
    ? '<div class="sba-note"><span class="material-symbols-outlined">info</span>On approval, a 3-slab payment schedule (25% · 50% · 25%) is issued to the exhibitor’s portal.</div>'
    : b.status === 'rejected'
      ? '<div class="sba-note red"><span class="material-symbols-outlined">block</span>Rejected' + (b.remark ? ' — ' + esc(b.remark) : '') + '. The space is released back to inventory.</div>'
      : '<div class="tablewrap"><table class="grid"><tr><th>Slab</th><th>Amount</th><th>Status</th><th>Method / Txn</th></tr>' + slabRows + '</table></div>';

  const html =
    '<div class="sba-drawer-bg" onclick="sbaClose()"></div>' +
    '<aside class="sba-drawer" role="dialog" aria-modal="true" aria-label="Application ' + esc(b.no) + '">' +
      '<div class="sba-dhead"><h2>' + esc(b.no) + '</h2><button class="modal-close" onclick="sbaClose()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<div class="sba-dbody">' +
        '<div class="sba-exrow"><div><small class="sba-eyebrow">EXHIBITOR</small><h3>' + esc(b.company) + '</h3>' +
          '<div class="sba-when"><span class="material-symbols-outlined">calendar_today</span>' + sbaDate(b.createdAt) + ' · ' + sbaTime(b.createdAt) +
            (b.regNo ? ' · <span class="regno">' + esc(b.regNo) + '</span>' : '') + '</div></div>' +
          (exId ? '<a class="btn btn-primary sba-profile" href="#/exhibitor/' + exId + '"><span class="material-symbols-outlined">person</span>Profile</a>' : '') + '</div>' +
        '<div class="sba-chips">' + sbaTypeChip(b) +
          '<span class="sba-chip ' + SBA_STATUS[b.status][3] + '"><span class="material-symbols-outlined">' + SBA_STATUS[b.status][0] + '</span>' + SBA_STATUS[b.status][2] + '</span></div>' +
        (b.approvedBy ? '<p class="sba-meta">' + (b.status === 'rejected' ? 'Rejected' : 'Approved') + ' by ' + esc(b.approvedBy) + (b.approvedAt ? ' · ' + esc(b.approvedAt) : '') + '</p>' : '') +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">grid_view</span>Space Specifications</h4>' + specs + '</section>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">payments</span>Payment Summary</h4>' +
          '<div class="sba-pct">' + rc.pct + '% received</div>' +
          '<div class="sba-bar big" title="' + money(rc.paid) + ' of ' + money(b.total) + '"><i style="width:' + rc.pct + '%"></i></div>' +
          '<div class="sba-sum"><span>Total Payable</span><b>' + money(b.total) + '</b></div>' +
          '<div class="sba-sum"><span>Total Paid</span><b style="color:var(--green)">' + money(rc.paid) + '</b></div>' +
          '<div class="sba-sum due"><span>Balance Due</span><b>' + money(rc.due) + '</b></div>' +
        '</section>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">receipt_long</span>Payment Schedule</h4>' + schedule + '</section>' +
      '</div>' +
      (b.status === 'pending'
        ? '<div class="sba-dfoot"><button class="btn btn-danger-soft" onclick="sbaReject(\'' + b.id + '\')"><span class="material-symbols-outlined">close</span>Disapprove</button>' +
          '<button class="btn btn-primary" onclick="sbaApprove(\'' + b.id + '\')"><span class="material-symbols-outlined">check</span>Approve &amp; Issue Slabs</button></div>'
        : '') +
    '</aside>';
  sbaClose();
  const wrap = document.createElement('div');
  wrap.id = 'sbaDrawer';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sbaClose(); });
window.addEventListener('hashchange', sbaClose);

/* ---------------- approve / reject (live → exhibitor state, demo → decision store) ---------------- */
function sbaApprove(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'pending') return;
  if (!confirm('Approve application ' + b.no + ' (' + b.stalls.map((s) => s.name).join(', ') + ' · ' + money(b.total) + ')?\nThe slab payment schedule will be issued to the exhibitor.')) return;
  if (b.source === 'live') {
    const ex = loadExState();
    const a = ex && ex.spaceBooking && ex.spaceBooking.applications.find((x) => x.id === id);
    if (!a) return;
    a.status = 'approved'; a.approvedAt = nowStr(); a.approvedBy = 'Organiser Admin';
    a.slabs = SBD_SLABS.map(([label, p, due]) => ({ label: label, amount: Math.round(a.total * p), due: due }));
    saveExState(ex);
  } else sbdSaveDecision(id, { status: 'approved', by: 'Organiser Admin', at: nowStr() });
  render(); sbaOpen(id);
  toast('Application ' + b.no + ' approved — slab payments issued.', 'success');
}
function sbaReject(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'pending') return;
  sbaClose();
  openModal('Disapprove Application ' + esc(b.no),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · ' + b.stalls.map((s) => esc(sbdZoneLabel(s.hall)) + ' ' + esc(s.name)).join(', ') + '</p>' +
    '<label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:6px">Reason for disapproval (shown to the exhibitor)</label>' +
    '<textarea id="sbaRemark" rows="3" style="width:100%;box-sizing:border-box;' + dateInputStyle + '"></textarea>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-danger-soft" onclick="sbaDoReject(\'' + id + '\')">Disapprove Application</button>');
}
function sbaDoReject(id) {
  const remark = ($('sbaRemark').value || '').trim() || 'Rejected by organiser';
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  if (b.source === 'live') {
    const ex = loadExState();
    const a = ex.spaceBooking.applications.find((x) => x.id === id);
    a.status = 'rejected'; a.remark = remark; a.rejectedBy = 'Organiser Admin'; a.approvedBy = 'Organiser Admin'; a.approvedAt = nowStr();
    saveExState(ex);
  } else sbdSaveDecision(id, { status: 'rejected', remark: remark, by: 'Organiser Admin', at: nowStr() });
  closeModal(); render(); sbaOpen(id);
  toast('Application ' + b.no + ' rejected — space released.', 'error');
}
