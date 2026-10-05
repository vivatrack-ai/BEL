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
const SBD_CAPACITY_SQM = SBD_HALLS.length * (4 * 108 + 4 * 54 + 4 * 36);
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
      stalls: a.stalls.map((s) => ({ hall: s.hall, name: s.name, sqm: s.sqm, size: s.size, scheme: s.scheme, price: s.price })),
      total: a.total, status: a.status, createdAt: parseTs(a.createdAt) || new Date(), slabs: slabs });
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
        source: 'demo', stalls: [{ hall: hall, name: name, sqm: sqm, size: SBD_SIZE[sqm], scheme: scheme, price: price }],
        total: price, status: status, createdAt: sbdDaysAgo(age, h), slabs: (status === 'approved' || status === 'confirmed') ? slabs : [] });
      k++;
    }
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
    sel('hall', SBD_HALLS.map((h) => [h, 'Hall ' + h]), 'All Halls') +
    sel('scheme', [['shell', 'Shell'], ['raw', 'Raw']], 'All Space Types') + (extra || '') +
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
  const capacity = SBDF.hall ? SBD_CAPACITY_SQM / SBD_HALLS.length : SBD_CAPACITY_SQM;
  const occ = Math.round((bookedSqm / capacity) * 100);
  const value = active.reduce((a, b) => a + b.total, 0);

  /* hall-wise occupancy — stacked by status, counted in stalls */
  const halls = SBDF.hall ? [SBDF.hall] : SBD_HALLS;
  const hallRows = halls.map((h) => {
    const seg = { confirmed: 0, approved: 0, pending: 0 };
    all.forEach((b) => { if (seg[b.status] != null) b.stalls.forEach((s) => { if (s.hall === h) seg[b.status]++; }); });
    const used = seg.confirmed + seg.approved + seg.pending;
    const avail = Math.max(0, SBD_STALLS_PER_HALL - used);
    const part = (k, n) => n ? '<i style="flex:' + n + ';background:' + (k === 'available' ? '#E3E8F1' : SBD_STATUS[k][2]) + '" title="Hall ' + h + ' · ' +
      (k === 'available' ? 'Available' : SBD_STATUS[k][1]) + ': ' + n + ' stall(s)"></i>' : '';
    return '<div class="occ-row"><b>Hall ' + h + '</b>' +
      '<div class="stack-bar">' + part('confirmed', seg.confirmed) + part('approved', seg.approved) + part('pending', seg.pending) + part('available', avail) + '</div>' +
      '<span class="occ-val">' + (seg.confirmed + seg.approved) + ' / ' + SBD_STALLS_PER_HALL + ' booked · ' + seg.pending + ' pending</span></div>';
  }).join('');

  const schemeRows = ['shell', 'raw'].map((sc) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.scheme === sc);
    return [sc === 'raw' ? 'Raw Space' : 'Shell Space', st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  const sizeRows = [108, 54, 36].map((q) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.sqm === q);
    return [SBD_SIZE[q] + ' (' + q + ' sqm)', st.length, money(st.reduce((a, s) => a + s.price, 0))];
  });
  const statusRows = Object.keys(SBD_STATUS).map((k) => [SBD_STATUS[k][1], by(k).length, '', SBD_STATUS[k][2]]);

  const recent = all.slice(0, 8).map((b) =>
    '<tr><td><span class="regno">' + esc(b.no) + '</span><span class="td-sub">' + sbdFmt(b.createdAt) + '</span></td>' +
    '<td><div class="profile-cell"><span class="avatar">' + esc((b.company || '?').charAt(0).toUpperCase()) + '</span>' +
      '<span><span class="td-strong">' + esc(b.company) + '</span>' + (b.regNo ? '<span class="td-sub">' + esc(b.regNo) + '</span>' : '') + '</span></div></td>' +
    '<td>' + b.stalls.map((s) => 'Hall ' + esc(s.hall) + ' · <b>' + esc(s.name) + '</b>').join('<br>') + '</td>' +
    '<td>' + b.stalls.map((s) => (s.scheme === 'raw' ? 'Raw' : 'Shell') + ' · ' + s.size).join('<br>') + '</td>' +
    '<td class="money">' + money(b.total) + '</td>' +
    '<td>' + sbdPill(b.status) + '</td></tr>').join('') ||
    '<tr><td colspan="6" style="color:var(--muted)">No applications for the selected filters.</td></tr>';

  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Dashboard</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Stall applications raised from Book Space, their approval status and hall occupancy.</p></div>' +
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
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Hall-wise Occupancy</h2>' + sbdLegend(['confirmed', 'approved', 'pending', 'available']) + '</div>' +
      hallRows + '</div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Booked Stalls by Space Type</h2>' + sbdBarRows(schemeRows, (v) => v + ' stalls') + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Booked Stalls by Stall Size</h2>' + sbdBarRows(sizeRows, (v) => v + ' stalls') + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Applications by Status</h2>' + sbdBarRows(statusRows, (v) => String(v)) + '</div>' +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Recent Applications</h2>' +
      '<a class="btn btn-outline btn-sm" href="#/space-approvals">Booking Approvals<span class="material-symbols-outlined" style="font-size:16px">chevron_right</span></a></div>' +
      '<div class="tablewrap"><table class="grid"><tr><th>Application No.</th><th>Exhibitor</th><th>Hall / Stall</th><th>Space Type</th><th>Total</th><th>Status</th></tr>' +
      recent + '</table></div></div>' + footerTools();
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
    headers: ['Txn ID', 'Paid At', 'Application No', 'Exhibitor', 'Hall', 'Stall', 'Slab', 'Method', 'Amount (INR)', 'Status'],
    rows: list.map((t) => [t.txn, sbdFmt(t.at), t.no, t.company, t.hall, t.stalls, t.slabLabel, t.method, t.amount, 'Success']),
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
  const hallRows = SBD_HALLS.filter((h) => !SBDF.hall || h === SBDF.hall).map((h) =>
    [ 'Hall ' + h, allTx.filter((t) => t.hall.split(', ').includes(h)).reduce((a, t) => a + t.amount, 0), '' ]);

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
    '<td>Hall ' + esc(t.hall) + '<span class="td-sub">' + esc(t.stalls) + '</span></td>' +
    '<td>' + esc(t.slabLabel) + '</td><td>' + esc(t.method) + '</td>' +
    '<td class="money">' + money(t.amount) + '</td><td><span class="pill green">Success</span></td></tr>').join('') ||
    '<tr><td colspan="9" style="color:var(--muted)">No transactions for the selected filters.</td></tr>';

  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Transactions</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Slab payments (25% · 50% · 25%) collected against approved and confirmed stall bookings.</p></div>' +
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
