/* ============================================================
   Evenuefy Admin — Space Applications, Booking Dashboard &
   Transaction Dashboard (AERO-245 / 3.8 / 3.9)
   Data = live applications of the exhibitor portal (HAL) + the
   shared demo book of other exhibitors (space-inventory.js). One
   application = one stall = one proforma invoice = one 100% payment
   (online gateway or offline NEFT / RTGS / Cheque / Wire). On 100%
   payment the stall is allotted automatically and locked. DEO can
   reserve a stall for any company, mark offline payments received,
   verify / reject proofs, extend validity, release, shift a stall
   (differential / credit note) and download / e-mail the proforma
   and tax invoices. Every action is written to the audit trail.
   ============================================================ */

'use strict';

const SBD_ZONES = SB_ZONES.map((z) => z.id);
const sbdZoneLabel = sbZoneLabel;
const sbdZoneUnits = (z) => sbZone(z).stalls.length;
const sbdZoneSqm = (z) => sbZone(z).stalls.reduce((a, s) => a + s.sqm, 0);
const SBD_SCHEMES = [['shell', 'Shell'], ['raw', 'Raw'], ['chalet1', 'Chalet · Single Storey'], ['chalet2', 'Chalet · Double Storey']];
const sbdSchemeLabel = sbSchemeLabel;
const SBD_CAPACITY_SQM = SBD_ZONES.reduce((a, z) => a + sbdZoneSqm(z), 0);
/* status → [pill class, label, chart colour] — DEO colour code */
const SBD_STATUS = {
  reserved: ['pink', 'Blocked · In Cart', '#E05A97'],
  payment_under_verification: ['blue', 'Payment Under Verification', '#2F62D8'],
  confirmed: ['red', 'Allotted · 100% Paid', '#C6432E'],
  expired: ['gray', 'Expired', '#8A93A5'],
  released: ['gray', 'Released', '#B9C2D2'],
};
const SBD_HOLDING = SB_HOLDING;
const SBD_ADMIN = 'DEO Admin';
const SBD_EVENT = { eventName: 'Aero India 2027', eventDates: '10th to 15th Feb 2027' };
const SBD_METHODS = ['Card', 'Net Banking', 'UPI', 'International Card', 'NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)'];
const SBD_OFFLINE = ['NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)'];
const sbdMode = (m) => (SBD_OFFLINE.includes(m) ? 'offline' : 'online');
const sbdCur = (b) => ((b.pricing && b.pricing.currency) || (b.origin === 'international' ? 'USD' : 'INR'));
const sbdBucket = (b) => (sbdCur(b) === 'USD' ? 'international' : 'national'); // currency bucket for the money tiles
const sbdAmt = (n, origin) => sbpFmt(n, origin === 'international' ? 'USD' : 'INR');
const sbdUsd = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function sbdCompact(n) {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return money(n);
}
function sbdUsdCompact(v) {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e4) return '$' + (v / 1e3).toFixed(1) + 'K';
  return sbdUsd(v);
}
const sbdCompactBy = (n, origin) => (origin === 'international' ? sbdUsdCompact(n) : sbdCompact(n));
const sbdInrEq = (usd) => Math.round(usd * sbpConfig().usdRate);
const sbdFmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const sbdDay = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const sbdStallOf = (b) => b.stalls[0];

/* field-error helpers (the exhibitor app has these in app.js) */
if (typeof setErr !== 'function') {
  window.setErr = function (id, msg) {
    const f = $(id); if (!f) return;
    const field = f.closest('.field');
    if (field) { field.classList.add('invalid'); const e = field.querySelector('.error'); if (e) e.textContent = msg; }
  };
}
if (typeof clearErrs !== 'function') {
  window.clearErrs = function (scope) { (scope || document).querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid')); };
}

/* ---------------- exhibitor portal states (one per login, see exhibitors.js) ---------------- */
function sbdLoadKey(profile) {
  const st = sbPortalState(profile);
  if (st) Object.defineProperty(st, '__profile', { value: profile, enumerable: false });
  return st;
}
function sbdSaveKey(ex) {
  const p = ex.__profile || SB_EXHIBITORS[0];
  try { localStorage.setItem(p.lsKey, JSON.stringify(ex)); } catch (e) { /* ignore */ }
}
const exProfile = (ex) => (ex && ex.__profile) || SB_EXHIBITORS[0];
const exCompany = (ex) => exProfile(ex).company;

/* ---------------- communication (demo: exhibitor bell + e-mail logs) ---------------- */
function sbdNotifyEx(ex, icon, color, text) {
  if (!ex.notifications) ex.notifications = [];
  ex.notifications.unshift({ id: 'nt_' + Date.now() + '_' + Math.floor(Math.random() * 1e4), icon: icon, color: color, text: text, time: nowStr(), read: false });
}
/* kind must be enabled in Space Booking Configuration; `to` = company (live → exhibitor's own log as well) */
function sbdEmail(kind, to, subject, body, ex) {
  const cfg = sbpConfig();
  if (cfg.emails[kind] === false) return false;
  if (typeof A !== 'undefined' && A.emailLog) {
    A.emailLog.unshift({ sentAt: nowStr(), subject: subject, recipients: [to], count: 1, kind: kind, body: body || '' });
    if (A.emailLog.length > 80) A.emailLog.length = 80;
    saveAdmin();
  }
  if (ex) {
    if (!ex.emailLog) ex.emailLog = [];
    ex.emailLog.unshift({ id: 'em_' + Date.now(), at: nowStr(), to: exProfile(ex).email, company: exCompany(ex), kind: kind, subject: subject, body: body || '' });
  }
  return true;
}

/* live applications past their validity → expired (same rule the exhibitor portal applies on every render) */
function sbdSettleLive(ex) {
  const now = Date.now();
  let changed = false;
  ((ex.spaceBooking && ex.spaceBooking.reservations) || []).forEach((r) => {
    if (r.status !== 'reserved' || new Date(r.holdUntil).getTime() >= now) return;
    r.status = 'expired'; r.expiredAt = nowStr(); r.expiredAtIso = new Date().toISOString();
    ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbpAudit(r, 'System', 'Expired', 'Validity lapsed on ' + sbpDate(r.holdUntil) + ' without 100% payment — stall released');
    sbdNotifyEx(ex, 'timer_off', 'var(--red)', 'Application ' + r.no + ' (stall ' + r.stalls[0].name + ') expired on ' + sbpDate(r.holdUntil) + ' — the stall has been released.');
    sbdEmail('expiry', exCompany(ex), 'Application ' + r.no + ' expired — stall ' + r.stalls[0].name + ' released', '', ex);
    changed = true;
  });
  if (changed) sbdSaveKey(ex);
}

/* ---------------- unified application book ---------------- */
function sbdLiveTaken(ex) {
  const taken = {};
  ((ex.spaceBooking && ex.spaceBooking.reservations) || []).forEach((r) => { if (SBD_HOLDING.includes(r.status)) r.stalls.forEach((s) => { taken[s.hall + '|' + s.name] = true; }); });
  (ex.stalls || []).forEach((st) => { taken[(st.hall === 'Chalet Line 1' ? 'CH' : String(st.hall).replace('Hall ', '')) + '|' + st.stall] = true; });
  return taken;
}
function sbdBookings() {
  const out = [];
  const taken = {};
  SB_EXHIBITORS.forEach((p) => {
    const ex = sbdLoadKey(p);
    if (!ex) return;
    if (ex.spaceBooking) sbdSettleLive(ex);
    Object.assign(taken, sbdLiveTaken(ex));
    ((ex.spaceBooking && ex.spaceBooking.reservations) || []).forEach((r) => {
      out.push({ id: r.id, no: r.no, piNo: r.piNo, piRev: r.piRev || 0, company: p.company, regNo: p.regNo, origin: p.origin, source: 'live', profile: p, type: r.type,
      stalls: r.stalls.map((s) => Object.assign({}, s)),
      status: r.status, createdAt: (r.createdAtIso ? new Date(r.createdAtIso) : parseTs(r.createdAt)) || new Date(), createdAtIso: r.createdAtIso,
      holdUntil: r.holdUntil, pausedAt: r.pausedAt || null, extensions: r.extensions || [], reminders: r.reminders || {},
      payment: r.payment || null, paidAt: r.paidAtIso ? new Date(r.paidAtIso) : (r.paidAt ? parseTs(r.paidAt) : null), paidAtIso: r.paidAtIso || '',
      orderNo: r.orderNo || '', remark: r.remark || '', expiredAt: r.expiredAt || '', releasedAt: r.releasedAt || '', audit: r.audit || [],
      allotment: r.allotment || null, adjustment: r.adjustment || null, creditNote: r.creditNote || null, reservedBy: r.source === 'admin' ? SBD_ADMIN : '',
      pricing: r.pricing, amount: r.amount, total: r.amount, value: r.pricing.grand });
    });
  });
  sbDemoBook(taken).forEach((b) => out.push(b));
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
/* occupancy map for admin pickers (same rule as the exhibitor layout; every portal is "other") */
function sbdInventory() { return sbInventory([], [], null); }

const sbdSqm = (b) => b.stalls.reduce((a, s) => a + s.sqm + Number(s.mezzSqm || 0), 0);
const sbdPill = (st) => '<span class="pill ' + SBD_STATUS[st][0] + '">' + SBD_STATUS[st][1] + '</span>';
const sbdIsOpen = (b) => b.status === 'reserved' || b.status === 'payment_under_verification'; // validity still matters
/* validity clock for one application */
function sbdHold(b) {
  if (b.status === 'payment_under_verification') return { left: sbpDaysLeft(b.holdUntil, new Date(b.pausedAt || Date.now()).getTime()), paused: true, cls: '', text: 'Clock paused' };
  const left = sbpDaysLeft(b.holdUntil);
  if (b.status !== 'reserved') return { left: left, paused: false, cls: '', text: '' };
  return { left: left, paused: false, cls: left <= 1 ? 'late' : left <= 7 ? 'warn' : '',
    text: left <= 0 ? 'Expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left' };
}
function sbdHoldCell(b) {
  if (b.status === 'confirmed') return '<span class="sba-hold"><b style="color:var(--red)">Allotted</b><small>' + (b.paidAt ? sbaDate(b.paidAt) : '—') + '</small></span>';
  if (b.status === 'expired') return '<span class="sba-hold late"><b>Expired</b><small>' + sbpDate(b.holdUntil) + '</small></span>';
  if (b.status === 'released') return '<span class="sba-hold"><b style="color:var(--muted)">Released</b><small>' + esc(b.releasedAt || '') + '</small></span>';
  const h = sbdHold(b);
  return '<span class="sba-hold ' + h.cls + '"><b>' + (h.paused ? '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">pause_circle</span> ' + h.text : h.text) + '</b>' +
    '<small>till ' + sbpDate(b.holdUntil) + (b.extensions && b.extensions.length ? ' · extended' : '') + '</small></span>';
}

/* ---------------- shared chart pieces ---------------- */
function sbdBarRows(rows, fmtVal) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return '<div class="bar-rows">' + rows.map(([label, v, sub, color]) =>
    '<div class="bar-row" title="' + esc(label) + ': ' + esc(fmtVal(v)) + (sub ? ' · ' + esc(sub) : '') + '"><span>' + esc(label) + '</span>' +
    '<span class="track"><i class="fill" style="width:' + Math.max(v ? 2 : 0, Math.round((v / max) * 100)) + '%' + ';background:' + (color || '#2F62D8') + '"></i></span>' +
    '<span class="val">' + fmtVal(v) + '</span></div>').join('') + '</div>';
}
function sbdLegend(keys) {
  return '<div class="sbd-legend">' + keys.map((k) =>
    '<span><i style="background:' + (k === 'available' ? '#1E8E5A' : SBD_STATUS[k][2]) + '"></i>' +
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
  const active = all.filter((b) => SBD_HOLDING.includes(b.status)); // inventory currently held
  const bookedSqm = active.reduce((a, b) => a + sbdSqm(b), 0);
  const mezzSqm = active.reduce((a, b) => a + b.stalls.reduce((x, s) => x + Number(s.mezzSqm || 0), 0), 0);
  const capacity = SBDF.hall ? sbdZoneSqm(SBDF.hall) : SBD_CAPACITY_SQM;
  const occ = Math.round(((bookedSqm - mezzSqm) / capacity) * 100);
  const soon = all.filter((b) => b.status === 'reserved' && sbpDaysLeft(b.holdUntil) <= 7);

  const halls = SBDF.hall ? [SBDF.hall] : SBD_ZONES;
  const hallRows = halls.map((h) => {
    const seg = { confirmed: 0, payment_under_verification: 0, reserved: 0 };
    all.forEach((b) => { if (seg[b.status] != null) b.stalls.forEach((s) => { if (s.hall === h) seg[b.status]++; }); });
    const used = seg.confirmed + seg.payment_under_verification + seg.reserved;
    const units = sbdZoneUnits(h);
    const unit = h === 'CH' ? 'chalet(s)' : 'stall(s)';
    const avail = Math.max(0, units - used);
    const part = (k, n) => n ? '<i style="flex:' + n + ';background:' + (k === 'available' ? '#1E8E5A' : SBD_STATUS[k][2]) + '" title="' + sbdZoneLabel(h) + ' · ' +
      (k === 'available' ? 'Available' : SBD_STATUS[k][1]) + ': ' + n + ' ' + unit + '"></i>' : '';
    return '<div class="occ-row"><b>' + sbdZoneLabel(h) + '</b>' +
      '<div class="stack-bar">' + part('confirmed', seg.confirmed) + part('payment_under_verification', seg.payment_under_verification) + part('reserved', seg.reserved) + part('available', avail) + '</div>' +
      '<span class="occ-val">' + used + ' / ' + units + ' held</span></div>';
  }).join('');

  const schemeRows = SBD_SCHEMES.map(([sc, lbl]) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.scheme === sc);
    return [sc.startsWith('chalet') ? lbl : lbl + ' Space', st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  const bookedUnits = active.flatMap((b) => b.stalls);
  const sizeRows = SIZE_BUCKETS.map((bk) => {
    const st = bookedUnits.filter((s) => bk.test(s.sqm));
    return [bk.label, st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  const statusRows = Object.keys(SBD_STATUS).map((k) => [SBD_STATUS[k][1], by(k).length, '', SBD_STATUS[k][2]]);

  const typeOf = (s) => (s.scheme === 'raw' ? 'raw' : s.scheme === 'shell' ? 'shell' : 'chalet');
  const stallsOf = (list) => list.flatMap((b) => b.stalls).filter((s) => !SBDF.scheme || s.scheme === SBDF.scheme);
  const bookedSt = stallsOf(active);
  const sqmOf = (list, t, h) => list.filter((s) => typeOf(s) === t && (!h || s.hall === h)).reduce((a, s) => a + s.sqm, 0);
  const AREA_TYPES = [['shell', 'Shell Space', '#2F62D8'], ['raw', 'Raw Space', '#1E8E5A'], ['chalet', 'Chalet', '#C98514']];
  const areaTotal = bookedSt.reduce((a, s) => a + s.sqm, 0);
  const fmtSq = (n) => n.toLocaleString('en-IN');
  const areaBlocks = AREA_TYPES.map(([t, lbl, col]) => {
    const sq = sqmOf(bookedSt, t);
    const n = bookedSt.filter((s) => typeOf(s) === t).length;
    const share = areaTotal ? Math.round((sq / areaTotal) * 100) : 0;
    const mz = bookedSt.filter((s) => typeOf(s) === t).reduce((a, s) => a + Number(s.mezzSqm || 0), 0);
    return '<div class="area-blk"><span class="area-k"><i style="background:' + col + '"></i>' + lbl + '</span>' +
      '<b class="area-v">' + fmtSq(sq) + ' <small>sq.m</small></b>' +
      '<span class="area-s">' + n + ' unit(s) · ' + share + '% of held area' + (mz ? ' · +' + fmtSq(mz) + ' sq.m mezzanine' : '') + '</span></div>';
  }).join('');
  const areaBar = '<div class="stack-bar area-bar">' + AREA_TYPES.map(([t, lbl, col]) => {
    const sq = sqmOf(bookedSt, t);
    return sq ? '<i style="flex:' + sq + ';background:' + col + '" title="' + lbl + ': ' + fmtSq(sq) + ' sq.m"></i>' : '';
  }).join('') + '</div>';
  const areaRows = halls.map((h) => {
    const v = AREA_TYPES.map(([t]) => sqmOf(bookedSt, t, h));
    const tot = v.reduce((a, x) => a + x, 0);
    const cap = sbdZoneSqm(h);
    const cell = (x, ok) => '<td class="num">' + (ok ? (x ? fmtSq(x) : '<span style="color:var(--muted)">0</span>') : '<span style="color:var(--muted)">—</span>') + '</td>';
    return '<tr><td class="td-strong">' + sbdZoneLabel(h) + '</td>' +
      cell(v[0], h !== 'CH') + cell(v[1], h !== 'CH') + cell(v[2], h === 'CH') +
      '<td class="num"><b>' + fmtSq(tot) + '</b></td><td class="num">' + fmtSq(cap) + '</td>' +
      '<td class="num">' + Math.round((tot / cap) * 100) + '%</td></tr>';
  }).join('');
  const areaFoot = '<tr class="area-total"><td>Total</td>' + AREA_TYPES.map(([t]) => '<td class="num">' + fmtSq(sqmOf(bookedSt, t)) + '</td>').join('') +
    '<td class="num">' + fmtSq(areaTotal) + '</td><td class="num">' + fmtSq(capacity) + '</td><td class="num">' + (capacity ? Math.round((areaTotal / capacity) * 100) : 0) + '%</td></tr>';
  const areaCard = '<div class="card"><div class="card-head-row"><h2 class="card-title">Held Area by Space Type (sq.m)</h2>' +
      '<span class="result-count">Allotted + In cart · ' + fmtSq(areaTotal) + ' sq.m floor · ' + fmtSq(mezzSqm) + ' sq.m mezzanine</span></div>' +
    '<div class="area-blks">' + areaBlocks + '</div>' + areaBar +
    '<div class="tablewrap" style="margin-top:16px"><table class="grid"><tr><th>Hall / Zone</th><th class="num">Shell (sq.m)</th><th class="num">Raw (sq.m)</th>' +
      '<th class="num">Chalet (sq.m)</th><th class="num">Total Held</th><th class="num">Capacity</th><th class="num">Occupancy</th></tr>' + areaRows + areaFoot + '</table></div></div>';

  const valueOf = (list, o) => list.filter((b) => sbdBucket(b) === o).reduce((a, b) => a + b.total, 0);
  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Dashboard</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Stall &amp; chalet applications — carts valid for ' + sbpHoldDays() + ' days, allotted automatically on 100% payment — and hall occupancy.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile"><div class="t-label">Blocked (In Cart)</div><div class="t-value" style="color:#B4336E">' + by('reserved').length + '</div>' +
        '<div class="t-sub">' + (soon.length ? soon.length + ' expiring within 7 days' : 'none expiring within 7 days') + '</div></div>' +
      '<div class="tile blue"><div class="t-label">Payment Under Verification</div><div class="t-value">' + by('payment_under_verification').length + '</div><div class="t-sub">offline proofs awaiting DEO</div></div>' +
      '<div class="tile"><div class="t-label">Allotted (100% Paid)</div><div class="t-value" style="color:var(--red)">' + by('confirmed').length + '</div><div class="t-sub">auto-allotted · locked</div></div>' +
      '<div class="tile"><div class="t-label">Expired</div><div class="t-value">' + by('expired').length + '</div><div class="t-sub">' + by('released').length + ' released</div></div>' +
    '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><div class="t-label">Held Area</div><div class="t-value">' + (bookedSqm - mezzSqm).toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + capacity.toLocaleString('en-IN') + ' sqm</span></div>' +
        '<div class="t-sub">Shell ' + fmtSq(sqmOf(bookedSt, 'shell')) + ' · Raw ' + fmtSq(sqmOf(bookedSt, 'raw')) + ' · Chalet ' + fmtSq(sqmOf(bookedSt, 'chalet')) + ' · Mezzanine ' + fmtSq(mezzSqm) + ' sq.m</div></div>' +
      '<div class="tile"><div class="t-label">Occupancy</div><div class="t-value">' + occ + '%</div>' +
        '<div class="prog-bar" style="margin-top:6px" title="' + occ + '% of capacity held"><i style="width:' + occ + '%"></i></div></div>' +
      '<div class="tile accent"><div class="t-label">Booking Value (Allotted + In Cart)</div>' +
        '<div class="t-cur"><span class="cur-tag">INR</span><b>' + sbdCompact(valueOf(active, 'national')) + '</b></div>' +
        '<div class="t-cur"><span class="cur-tag usd">USD</span><b>' + sbdUsdCompact(valueOf(active, 'international')) + '</b></div>' +
        '<div class="t-sub">incl. ' + sbdCompact(valueOf(by('payment_under_verification'), 'national')) + ' under verification</div></div>' +
    '</div>' +
    areaCard +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Hall &amp; Chalet Occupancy</h2>' + sbdLegend(['confirmed', 'payment_under_verification', 'reserved', 'available']) + '</div>' +
      hallRows + '</div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Held Units by Space Type</h2>' + sbdBarRows(schemeRows, (v) => v + ' units') + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">By Size (Shell · Raw · Chalet)</h2>' + sbdBarRows(sizeRows, (v) => String(v)) + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Applications by Status</h2>' + sbdBarRows(statusRows, (v) => String(v)) + '</div>' +
    footerTools();
}

/* ============================================================
   VIEW · Space Booking Transaction Dashboard
   ============================================================ */
const SBDT = { cur: 'national', origin: '', mode: '', method: '', dateMode: '', from: '', to: '', q: '', page: 1 };
const SBDT_ORIGIN = { national: 'National', international: 'International' };
const SBDT_MODE = { online: 'Online', offline: 'Offline' };
function sbdtSet(k, v) { SBDT[k] = v; SBDT.page = 1; render(); }
function sbdtSetQ(v) { SBDT.q = v; SBDT.page = 1; render(); const el = $('sbdtQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }

/* one 100% payment per allotted application (+ settled shift differentials) */
function sbdTransactions(bookings) {
  const tx = [];
  bookings.forEach((b) => {
    if (b.status === 'confirmed' && b.paidAt) {
      const pm = b.payment || { mode: 'online', method: 'Card' };
      const method = pm.method || 'Card';
      tx.push({ txn: pm.txn || b.orderNo || pm.ref || ('TXN' + String(sbHash(b.id)).slice(0, 9)), at: b.paidAt, no: b.piNo, company: b.company, hall: b.stalls.map((x) => x.hall).join(', '),
        stalls: b.stalls.map((x) => x.name).join(', '), method: method, mode: pm.mode || sbdMode(method), ref: pm.ref || '', origin: sbdBucket(b), cur: sbdCur(b), amount: b.total, kind: '100% payment',
        settle: sbpSettlementText(pm, sbdCur(b)), settleAmount: pm.settleAmount, fxRate: pm.fxRate });
    }
    if (b.adjustment && b.adjustment.status === 'paid') {
      const pm = b.adjustment.payment || { mode: 'online', method: 'Card' };
      tx.push({ txn: b.adjustment.orderNo || pm.ref || b.adjustment.no, at: b.adjustment.paidAtIso ? new Date(b.adjustment.paidAtIso) : (parseTs(b.adjustment.paidAt) || new Date()), no: b.adjustment.no, company: b.company,
        hall: b.stalls.map((x) => x.hall).join(', '), stalls: b.stalls.map((x) => x.name).join(', '), method: pm.method || 'Card', mode: pm.mode || 'online', ref: pm.ref || '', origin: sbdBucket(b), cur: sbdCur(b), amount: b.adjustment.amount, kind: 'Shift differential',
        settle: sbpSettlementText(pm, sbdCur(b)), settleAmount: pm.settleAmount, fxRate: pm.fxRate });
    }
  });
  return tx.sort((a, b) => b.at - a.at);
}

function exportSbdTransactions(list) {
  exportWorkbook('Space-Booking-Transactions-' + exportStamp(), [{
    name: 'Transactions',
    headers: ['Txn ID', 'Paid At', 'Invoice', 'Kind', 'Exhibitor', 'Billing', 'Hall / Chalet Line', 'Stall / Chalet', 'Online / Offline', 'Method', 'Reference', 'Billed Currency', 'Billed Amount', 'Settled In', 'Settled Amount', 'FX Rate', 'Status'],
    rows: list.map((t) => [t.txn, sbdFmt(t.at), t.no, t.kind, t.company, t.cur === 'USD' ? 'USD' : 'INR', t.hall.split(', ').map(sbdZoneLabel).join(', '), t.stalls, SBDT_MODE[t.mode], t.method, t.ref || '-', t.cur, t.amount, t.settle ? 'INR' : t.cur, t.settle ? t.settleAmount : t.amount, t.fxRate || '-', 'Success']),
  }]);
}

function viewBookingTransactions() {
  const books = sbdFilter(sbdBookings()).filter((b) => SBD_HOLDING.includes(b.status));
  const soonMs = Date.now() + 7 * 864e5;
  let tx = sbdTransactions(books);
  const allTx = tx;

  const cur = (o) => {
    const bk = books.filter((b) => sbdBucket(b) === o);
    const val = bk.reduce((a, b) => a + b.total, 0);
    const col = bk.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.total, 0) + bk.filter((b) => b.adjustment && b.adjustment.status === 'paid').reduce((a, b) => a + b.adjustment.amount, 0);
    const verif = bk.filter((b) => b.status === 'payment_under_verification').reduce((a, b) => a + b.total, 0);
    const expiring = bk.filter((b) => b.status === 'reserved' && new Date(b.holdUntil).getTime() <= soonMs).reduce((a, b) => a + b.total, 0);
    return { value: val, collected: col, outstanding: Math.max(0, val - col), verifying: verif, expiring: expiring, tx: allTx.filter((t) => t.origin === o).length };
  };
  const INR = cur('national');
  const USD = cur('international');
  const curTile = (label, k, cls, sub) => '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label + '</div>' +
    '<div class="t-cur"><span class="cur-tag">INR</span><b>' + sbdCompact(INR[k]) + '</b></div>' +
    '<div class="t-cur"><span class="cur-tag usd">USD</span><b>' + sbdUsdCompact(USD[k]) + '</b></div>' + (sub ? '<div class="t-sub">' + sub + '</div>' : '') + '</div>';

  const C = SBDT.cur;
  const isUsd = C === 'international';
  const cBooks = books.filter((b) => (b.origin || 'national') === C);
  const cTx = allTx.filter((t) => t.origin === C);
  const cFmt = (n) => sbdCompactBy(n, C);
  const cAmt = (n) => sbdAmt(n, C);
  const cValue = cBooks.reduce((a, b) => a + b.total, 0);
  const cCollected = cBooks.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.total, 0);
  const cRate = cValue ? Math.round((cCollected / cValue) * 100) : 0;
  const curSeg = '<div class="seg cur-seg">' +
    [['national', 'INR', 'National'], ['international', 'USD', 'International']].map(([v, c, l]) =>
      '<button class="' + (C === v ? 'on' : '') + '" onclick="SBDT.cur=\'' + v + '\';render()"><b>' + c + '</b>' + l + '</button>').join('') + '</div>';
  const curNote = '<span class="cur-note">' + (isUsd ? 'International exhibitors · amounts in USD' : 'National exhibitors · amounts in INR') +
    ' · ' + cBooks.length + ' applications · ' + cTx.length + ' payments</span>';

  const stRows = ['confirmed', 'payment_under_verification', 'reserved'].map((k) => {
    const v = cBooks.filter((b) => b.status === k).reduce((a, b) => a + b.total, 0);
    const p = cValue ? Math.round((v / cValue) * 100) : 0;
    return '<div class="prog-row" title="' + SBD_STATUS[k][1] + ': ' + cAmt(v) + ' of ' + cAmt(cValue) + '">' +
      '<div class="pr-head"><span>' + SBD_STATUS[k][1] + ' <span style="color:var(--muted);font-weight:600">· ' + cBooks.filter((b) => b.status === k).length + ' application(s)</span></span>' +
      '<span>' + cFmt(v) + ' (' + p + '%)</span></div>' +
      '<div class="prog-bar"><i style="width:' + p + '%;background:' + SBD_STATUS[k][2] + '"></i></div></div>';
  }).join('');

  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const perDay = days.map((d) => cTx.filter((t) => { const x = new Date(t.at); x.setHours(0, 0, 0, 0); return x.getTime() === d.getTime(); }).reduce((a, t) => a + t.amount, 0));
  const dMax = Math.max(...perDay, 1);
  const peak = perDay.indexOf(Math.max(...perDay));
  const trend = '<div class="col-chart">' + days.map((d, i) =>
    '<div class="col" title="' + sbdDay(d) + ': ' + cAmt(perDay[i]) + '">' +
      (i === peak && perDay[i] ? '<span class="col-lbl">' + cFmt(perDay[i]) + '</span>' : '') +
      '<i style="height:' + Math.max(perDay[i] ? 3 : 0, Math.round((perDay[i] / dMax) * 100)) + '%"></i>' +
      '<span class="col-x">' + (i % 2 === 0 ? sbdDay(d) : '') + '</span></div>').join('') + '</div>';

  const sumTx = (f) => { const l = allTx.filter(f); return { amt: l.reduce((a, t) => a + t.amount, 0), n: l.length }; };
  const grandTx = sumTx(() => true);
  const splitBlock = (o) => {
    const tot = sumTx((t) => t.origin === o);
    const on = sumTx((t) => t.origin === o && t.mode === 'online');
    const off = sumTx((t) => t.origin === o && t.mode === 'offline');
    const pc = (x) => (tot.amt ? Math.round((x / tot.amt) * 100) : 0);
    const cf = (n) => sbdAmt(n, o);
    const line = (k, ic, v, cls) => '<div class="split-line ' + cls + '"><span><span class="material-symbols-outlined">' + ic + '</span>' + k + '</span>' +
      '<b>' + cf(v.amt) + '</b><small>' + v.n + ' txn' + (v.n === 1 ? '' : 's') + ' · ' + pc(v.amt) + '%</small></div>';
    return '<div class="split-blk">' +
      '<div class="split-h"><span class="material-symbols-outlined">' + (o === 'national' ? 'flag' : 'public') + '</span>' + SBDT_ORIGIN[o] +
        '<span class="split-share">' + tot.n + ' of ' + grandTx.n + ' payments</span></div>' +
      '<div class="split-total"><small>TOTAL' + (o === 'international' ? ' (USD)' : ' (INR)') + '</small><b>' + cf(tot.amt) + '</b><span>' + tot.n + ' payment' + (tot.n === 1 ? '' : 's') +
        (o === 'international' ? ' · ≈ ' + money(sbdInrEq(tot.amt)) + ' @ ₹' + sbpConfig().usdRate + '/$' : '') + '</span></div>' +
      '<div class="stack-bar split-bar" title="Online ' + cf(on.amt) + ' · Offline ' + cf(off.amt) + '">' +
        (on.amt ? '<i style="flex:' + on.amt + ';background:#2F62D8"></i>' : '') + (off.amt ? '<i style="flex:' + off.amt + ';background:#C98514"></i>' : '') +
        (!tot.amt ? '<i style="flex:1;background:#E3E8F1"></i>' : '') + '</div>' +
      line('Online · gateway', 'language', on, 'online') + line('Offline · NEFT / RTGS / Cheque / Wire', 'account_balance', off, 'offline') +
    '</div>';
  };
  const splitCard = '<div class="card"><div class="card-head-row"><h2 class="card-title">National &amp; International Collections</h2>' +
      '<div class="sbd-legend"><span><i style="background:#2F62D8"></i>Online</span><span><i style="background:#C98514"></i>Offline</span></div></div>' +
    '<div class="split-grid">' + splitBlock('national') + splitBlock('international') + '</div></div>';

  const cMethods = (C === 'national' ? ['Card', 'Net Banking', 'UPI', 'NEFT', 'RTGS', 'Cheque / DD'] : ['International Card', 'SWIFT (Wire Transfer)']);
  const methodRows = cMethods.map((m) => [m + (sbdMode(m) === 'offline' ? ' (Offline)' : ' (Online)'),
    cTx.filter((t) => t.method === m).reduce((a, t) => a + t.amount, 0), cTx.filter((t) => t.method === m).length + ' txns']);
  const hallRows = SBD_ZONES.filter((h) => !SBDF.hall || h === SBDF.hall).map((h) =>
    [ sbdZoneLabel(h), cTx.filter((t) => t.hall.split(', ').includes(h)).reduce((a, t) => a + t.amount, 0), '' ]);

  if (SBDT.origin) tx = tx.filter((t) => t.origin === SBDT.origin);
  if (SBDT.mode) tx = tx.filter((t) => t.mode === SBDT.mode);
  if (SBDT.method) tx = tx.filter((t) => t.method === SBDT.method);
  const r = dateFilterRange(SBDT);
  if (r.from || r.to) tx = tx.filter((t) => inDateRange(sbdFmt(t.at), r.from, r.to));
  const q = SBDT.q.toLowerCase();
  if (q) tx = tx.filter((t) => (t.txn + ' ' + t.no + ' ' + t.company + ' ' + t.stalls + ' ' + t.ref).toLowerCase().includes(q));
  window.__sbdtList = tx;
  const sel = (k, opts, all) => '<select onchange="sbdtSet(\'' + k + '\', this.value)" style="' + dateInputStyle + ';cursor:pointer"><option value="">' + all + '</option>' +
    opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (SBDT[k] === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
  const rows = 10;
  const pages = Math.max(1, Math.ceil(tx.length / rows));
  if (SBDT.page > pages) SBDT.page = pages;
  const st = (SBDT.page - 1) * rows;
  const trs = tx.slice(st, st + rows).map((t) =>
    '<tr><td><span class="regno">' + esc(t.txn) + '</span></td><td style="white-space:nowrap">' + sbaDate(t.at) + '<span class="td-sub">' + sbaTime(t.at) + '</span></td>' +
    '<td><span class="regno">' + esc(t.no) + '</span><span class="td-sub">' + esc(t.kind) + '</span></td><td class="td-strong">' + esc(t.company) + '</td>' +
    '<td><span class="pill ' + (t.origin === 'international' ? 'blue' : 'gray') + '">' + SBDT_ORIGIN[t.origin] + '</span></td>' +
    '<td>' + esc(t.hall.split(', ').map(sbdZoneLabel).join(', ')) + '<span class="td-sub">' + esc(t.stalls) + '</span></td>' +
    '<td><span class="mode-chip ' + t.mode + '"><span class="material-symbols-outlined">' + (t.mode === 'online' ? 'language' : 'account_balance') + '</span>' + SBDT_MODE[t.mode] + '</span>' +
      '<span class="td-sub">' + esc(t.method) + (t.ref ? ' · ' + esc(t.ref) : '') + '</span></td>' +
    '<td class="money">' + sbpFmt(t.amount, t.cur) + (t.settle ? '<span class="td-sub">received ' + sbpFmt(t.settleAmount, 'INR') + ' @ ₹' + esc(String(t.fxRate)) + '/$</span>' : (t.cur === 'USD' ? '<span class="td-sub">≈ ' + money(sbdInrEq(t.amount)) + '</span>' : '')) + '</td>' +
    '<td><span class="pill green">Success</span></td></tr>').join('') ||
    '<tr><td colspan="9" style="color:var(--muted)">No payments for the selected filters.</td></tr>';

  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Transactions</h1>' +
      '<p class="page-sub" style="margin-bottom:0">One 100% payment per application — online through the gateway or offline (NEFT / RTGS / Cheque / Wire) verified by DEO against the proforma invoice — plus settled stall-shift differentials.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      curTile('Total Booking Value', 'value', 'blue', 'allotted + carts') +
      curTile('Collected', 'collected', 'accent', '100% received') +
      curTile('Outstanding (In Cart)', 'outstanding', '', 'incl. ' + sbdCompact(INR.verifying) + ' under verification') +
      curTile('Expiring in Next 7 Days', 'expiring', '', 'unpaid carts near validity end') +
      '<div class="tile"><div class="t-label">Payments</div><div class="t-value">' + allTx.length + '</div>' +
        '<div class="t-sub">' + INR.tx + ' in INR · ' + USD.tx + ' in USD</div></div>' +
    '</div>' +
    splitCard +
    '<div class="cur-head section-gap"><div><h2 class="card-title" style="margin:0">Collection Analytics</h2>' + curNote + '</div>' + curSeg + '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Collection Progress <small class="inr-eq">' + (isUsd ? 'USD' : 'INR') + '</small></h2>' +
      '<span class="result-count">' + cFmt(cCollected) + ' of ' + cFmt(cValue) + ' collected · ' + cRate + '%</span></div>' +
      '<div class="prog-bar" style="height:12px" title="' + cAmt(cCollected) + ' of ' + cAmt(cValue) + '"><i style="width:' + cRate + '%"></i></div>' +
      '<div style="margin-top:18px">' + stRows + '</div></div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Daily Collections — Last 14 Days <small class="inr-eq">' + (isUsd ? 'USD' : 'INR') + '</small></h2>' + trend + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Collections by Payment Method <small class="inr-eq">' + (isUsd ? 'USD' : 'INR') + '</small></h2>' + sbdBarRows(methodRows, cFmt) + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Collections by Hall <small class="inr-eq">' + (isUsd ? 'USD' : 'INR') + '</small></h2>' + sbdBarRows(hallRows, cFmt) + '</div>' +
    '<div class="card section-gap"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Payments</h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
        '<span class="result-count">' + tx.length + ' of ' + allTx.length + '</span>' +
        '<input type="text" id="sbdtQ" value="' + esc(SBDT.q) + '" placeholder="Search txn, PI, exhibitor, UTR" oninput="sbdtSetQ(this.value)" style="' + dateInputStyle + ';min-width:220px">' +
        sel('origin', [['national', 'National'], ['international', 'International']], 'Exhibitor: All') +
        sel('mode', [['online', 'Online'], ['offline', 'Offline']], 'Mode: All') +
        sel('method', SBD_METHODS.filter((m) => !SBDT.mode || sbdMode(m) === SBDT.mode).map((m) => [m, m]), 'Method: All') +
        toolbarDateSel(SBDT, 'sbdtDateMode', 'sbdtFrom', 'sbdtTo') +
        '<button class="btn btn-outline btn-sm" onclick="exportSbdTransactions(window.__sbdtList)"' + (tx.length ? '' : ' disabled') + '><span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
      '</div></div>' +
      '<div class="tablewrap"><table class="grid sbdt-table"><tr><th>Txn ID</th><th>Paid At</th><th>Invoice</th><th>Exhibitor</th><th>Exhibitor Type</th><th>Hall / Stall</th><th>Payment Mode</th><th>Amount</th><th>Status</th></tr>' +
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
   VIEW · Space Applications (Manage Exhibition) — every stall /
   chalet application (in cart, under verification, allotted,
   expired, released) with stall number, stage, validity and the DEO
   actions. Row click / ⋯ menu opens the detail drawer.
   ============================================================ */
const SBA = { q: '', type: '', status: '', hall: '', source: '', dateMode: '', from: '', to: '', rows: 10, page: 1 };
const SBA_STATUS = {
  reserved: ['shopping_cart', '#E05A97', 'Blocked · In Cart', 'pink'],
  payment_under_verification: ['hourglass_top', '#2F62D8', 'Payment Under Verification', 'blue'],
  confirmed: ['verified', '#C6432E', 'Allotted · 100% Paid', 'red'],
  expired: ['timer_off', '#8A93A5', 'Expired', 'gray'],
  released: ['lock_open', '#8A93A5', 'Released', 'gray'],
};
function sbaSet(k, v) { SBA[k] = v; SBA.page = 1; render(); }
function sbaSetQ(v) { SBA.q = v; SBA.page = 1; render(); const el = $('sbaQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function sbaPage(p) { SBA.page = p; render(); }
function sbaFrom(v) { SBA.from = v; SBA.page = 1; render(); }
function sbaTo(v) { SBA.to = v; SBA.page = 1; render(); }
function sbaClear() { Object.assign(SBA, { q: '', type: '', status: '', hall: '', source: '', dateMode: '', from: '', to: '', page: 1 }); render(); }

const sbaType = (b) => (b.stalls.every((s) => s.hall === 'CH') ? 'chalet' : 'space');
const sbaTypeLabel = (b) => (sbaType(b) === 'chalet' ? 'Chalet' : 'Pre-defined Space');
const sbaTypeChip = (b) => '<span class="sba-type"><span class="material-symbols-outlined">' + (sbaType(b) === 'chalet' ? 'cottage' : 'apps') + '</span>' + sbaTypeLabel(b) + '</span>';
const sbaDate = (d) => d.getDate() + ' ' + d.toLocaleString('en-US', { month: 'short' }) + ', ' + String(d.getFullYear()).slice(2);
const sbaTime = (d) => d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
const sbaStatus = (st) => '<span class="sba-status"><span class="material-symbols-outlined" style="color:' + SBA_STATUS[st][1] + '">' + SBA_STATUS[st][0] + '</span>' + SBA_STATUS[st][2] + '</span>';
const sbaDesign = (s) => (s.hall === 'CH' ? sbdSchemeLabel(s.scheme) : sbdSchemeLabel(s.scheme) + ' (' + (s.sides || '1 Side') + ')' + (s.mezzSqm ? ' + mezz ' + s.mezzSqm + ' sqm' : ''));
const sbaSides = (s) => (s.sides || '1 Side') + ' Open';
const sbaWho = (b) => ({ billedTo: b.company, regNo: b.regNo, country: b.origin === 'international' ? 'International exhibitor' : 'India', eventName: SBD_EVENT.eventName, eventDates: SBD_EVENT.eventDates });
const sbaDoc = (b) => ({ piNo: b.piNo, piRev: b.piRev, no: b.no, type: sbaTypeLabel(b), stalls: b.stalls, pricing: b.pricing, createdAt: sbdFmt(b.createdAt), holdUntil: b.holdUntil, status: b.status,
  paidAt: b.paidAt ? sbdFmt(b.paidAt) : '', payment: b.payment, orderNo: b.orderNo, allotment: b.allotment });

/* quick-action menu items for one application (shared by list + drawer) */
function sbaActionButtons(b, cls) {
  const btn = (fn, icon, label, danger) => '<button class="' + (cls || '') + (danger ? ' btn-danger-soft' : '') + '" onclick="' + fn + '(\'' + b.id + '\')"><span class="material-symbols-outlined">' + icon + '</span>' + label + '</button>';
  let out = '';
  if (b.status === 'payment_under_verification') out += btn('sbaMarkReceived', 'task_alt', 'Mark Payment Received') + btn('sbaRejectProof', 'rule', 'Reject Proof', true);
  if (b.status === 'reserved') out += btn('sbaRecordOffline', 'account_balance', 'Mark Offline Payment');
  if (b.adjustment && b.adjustment.status !== 'paid') out += btn('sbaMarkAdjReceived', 'task_alt', 'Mark Differential Received');
  if (sbdIsOpen(b)) out += btn('sbaExtend', 'more_time', 'Extend Validity') + btn('sbaRelease', 'lock_open', 'Release Now', true);
  if (SBD_HOLDING.includes(b.status)) out += btn('sbaShift', 'swap_horiz', 'Shift Stall');
  if (b.status === 'reserved') out += btn('sbaSimulateExpiry', 'bug_report', 'Simulate Expiry (debug)');
  out += btn('sbaDownloadPI', 'description', 'Proforma Invoice');
  if (SBD_HOLDING.includes(b.status) && b.status !== 'confirmed') out += btn('sbaEmailPI', 'mail', 'E-mail Proforma Invoice');
  if (b.status === 'confirmed') out += btn('sbaDownloadInvoice', 'receipt_long', 'Tax Invoice');
  return out;
}
function sbaDownloadPI(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  sbpOpenProforma(sbaDoc(b), sbaWho(b));
}
function sbaDownloadInvoice(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'confirmed') { toast('Tax invoice is issued after 100% payment.', 'error'); return; }
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  sbpOpenTaxInvoice(sbaDoc(b), sbaWho(b));
}
function sbaEmailPI(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  const subject = 'Proforma invoice ' + b.piNo + (b.piRev ? ' Rev ' + b.piRev : '') + ' — stall ' + sbdStallOf(b).name + ' reserved till ' + sbpDate(b.holdUntil);
  sbaApply(b, {}, (r, ex) => {
    sbpAudit(r, SBD_ADMIN, 'Proforma invoice e-mailed', subject);
    sbdNotifyEx(ex, 'mail', 'var(--blue)', 'DEO e-mailed proforma invoice ' + b.piNo + ' for application ' + b.no + ' (stall ' + sbdStallOf(b).name + ').');
    sbdEmail('reserved', exCompany(ex), subject, 'PI attached · ' + sbpFmt(b.total, sbdCur(b)) + ' payable within validity', ex);
  }, (d) => { d.audit = (b.audit || []).concat([{ at: nowStr(), by: SBD_ADMIN, event: 'Proforma invoice e-mailed', detail: subject }]); sbdEmail('reserved', b.company, subject, 'PI attached · ' + sbpFmt(b.total, sbdCur(b)) + ' payable within validity'); });
  toast('Proforma invoice ' + b.piNo + ' e-mailed to ' + b.company + '.', 'success');
  render(); sbaOpen(id);
}

function viewSpaceApplications() {
  const every = sbdBookings();
  let list = every;
  if (SBA.type) list = list.filter((b) => sbaType(b) === SBA.type);
  if (SBA.status) list = list.filter((b) => b.status === SBA.status);
  if (SBA.hall) list = list.filter((b) => b.stalls.some((s) => s.hall === SBA.hall));
  if (SBA.source) list = list.filter((b) => (SBA.source === 'admin' ? !!b.reservedBy : SBA.source === 'live' ? b.source === 'live' : b.origin === SBA.source));
  const r = dateFilterRange(SBA);
  if (r.from || r.to) list = list.filter((b) => inDateRange(sbdFmt(b.createdAt), r.from, r.to));
  const q = SBA.q.trim().toLowerCase();
  if (q) list = list.filter((b) => (b.no + ' ' + b.piNo + ' ' + b.company + ' ' + b.regNo + ' ' + b.stalls.map((s) => s.name).join(' ')).toLowerCase().includes(q));
  window.__sbaList = list;

  const pages = Math.max(1, Math.ceil(list.length / SBA.rows));
  if (SBA.page > pages) SBA.page = pages;
  const st = (SBA.page - 1) * SBA.rows;
  const trs = list.slice(st, st + SBA.rows).map((b) => {
    const acts = sbaActionButtons(b, '');
    const s = sbdStallOf(b);
    return '<tr class="sba-row" onclick="sbaOpen(\'' + b.id + '\')">' +
      '<td><span class="regno">' + esc(b.no) + '</span><span class="td-sub">' + esc(b.piNo) + (b.piRev ? ' R' + b.piRev : '') + (b.reservedBy ? ' · by DEO' : '') + '</span></td>' +
      '<td><span class="td-strong">' + esc(b.company) + '</span>' + (b.regNo ? '<span class="td-sub">' + esc(b.regNo) + '</span>' : '') +
        (b.origin === 'international' ? '<span class="pill blue" style="margin-top:4px">International · USD</span>' : '') + '</td>' +
      '<td><b class="regno" style="font-size:0.95rem">' + esc(s.name) + '</b><span class="td-sub">' + esc(sbdZoneLabel(s.hall)) + ' · ' + sbaTypeLabel(b) + '</span></td>' +
      '<td class="sba-area">' + s.sqm + ' m² · ' + esc(s.size || '') + (s.mezzSqm ? '<br>+ ' + s.mezzSqm + ' m² mezz.' : '') + '</td>' +
      '<td>' + esc(sbdSchemeLabel(s.scheme)) + '<span class="td-sub">' + esc(sbaSides(s)) + '</span></td>' +
      '<td class="money">' + sbpFmt(b.total, sbdCur(b)) + '<span class="td-sub">100% · ' + (b.payment && b.payment.mode ? SBDT_MODE[b.payment.mode] : 'online / offline') + (b.adjustment && b.adjustment.status !== 'paid' ? ' · +' + sbpFmt(b.adjustment.amount, sbdCur(b)) + ' diff. due' : '') + '</span></td>' +
      '<td>' + sbdHoldCell(b) + '</td>' +
      '<td>' + sbaStatus(b.status) + '</td>' +
      '<td style="white-space:nowrap">' + sbaDate(b.createdAt) + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="sba-act">' +
        '<button class="sba-dots" onclick="sbaMenu(this)" aria-label="Actions"><span class="material-symbols-outlined">more_horiz</span></button>' +
        '<div class="sba-menu"><div class="sba-menu-h">QUICK ACTIONS</div>' + acts +
          '<button class="sba-menu-view" onclick="sbaOpen(\'' + b.id + '\')"><span class="material-symbols-outlined">visibility</span>View Full Details</button>' +
        '</div></div></td></tr>';
  }).join('') ||
    '<tr><td colspan="11" style="color:var(--muted);padding:28px;text-align:center">No applications match the selected filters.</td></tr>';

  const sel = (k, opts, all) => '<select class="sba-sel" onchange="sbaSet(\'' + k + '\', this.value)">' +
    '<option value="">' + all + '</option>' + opts.map(([v, l]) => '<option value="' + v + '"' + (SBA[k] === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const dateSel = sel('dateMode', DATE_PRESET_OPTS, 'All Dates (Created)') +
    (SBA.dateMode === 'custom' ? toolbarDates(SBA.from, SBA.to, 'sbaFrom', 'sbaTo') : '');
  const verif = every.filter((b) => b.status === 'payment_under_verification').length;
  const soon = every.filter((b) => b.status === 'reserved' && sbpDaysLeft(b.holdUntil) <= 7).length;
  const count = (k) => every.filter((b) => b.status === k).length;

  return '<div class="sba-head"><span class="material-symbols-outlined">inventory_2</span><h1 class="page-title" style="margin:0">Space Applications</h1>' +
      (verif ? '<span class="pill blue">' + verif + ' payment proof' + (verif === 1 ? '' : 's') + ' to verify</span>' : '') +
      (soon ? '<span class="pill amber">' + soon + ' cart' + (soon === 1 ? '' : 's') + ' expiring within 7 days</span>' : '') +
      '<span style="flex:1"></span><button class="btn btn-primary" onclick="sbaReserveOpen()"><span class="material-symbols-outlined">add_business</span>Reserve a Stall for a Company</button></div>' +
    '<p class="page-sub">Every stall application — in cart, under verification, allotted, expired or released. Stalls go straight into the exhibitor’s cart (or DEO reserves one here) and are held for ' + sbpHoldDays() + ' days; on 100% payment the stall is allotted automatically and locked.</p>' +
    '<div class="tiles" style="margin-bottom:14px">' +
      '<div class="tile"><div class="t-label">Blocked · In Cart</div><div class="t-value" style="color:#B4336E">' + count('reserved') + '</div></div>' +
      '<div class="tile blue"><div class="t-label">Under Verification</div><div class="t-value">' + count('payment_under_verification') + '</div></div>' +
      '<div class="tile"><div class="t-label">Allotted · 100% Paid</div><div class="t-value" style="color:var(--red)">' + count('confirmed') + '</div></div>' +
      '<div class="tile"><div class="t-label">Expired / Released</div><div class="t-value">' + (count('expired') + count('released')) + '</div></div>' +
    '</div>' +
    '<div class="card sba-card">' +
      '<div class="sba-toolbar">' +
        '<label class="sba-search"><span class="material-symbols-outlined">search</span>' +
          '<input id="sbaQ" placeholder="Search by application no, PI no, exhibitor, stall" value="' + esc(SBA.q) + '" oninput="sbaSetQ(this.value)"></label>' +
        sel('status', Object.keys(SBA_STATUS).map((k) => [k, SBA_STATUS[k][2]]), 'All Stages') +
        sel('hall', SBD_ZONES.map((h) => [h, sbdZoneLabel(h)]), 'All Halls') +
        sel('type', [['space', 'Pre-defined Space'], ['chalet', 'Chalet']], 'All Types') +
        sel('source', [['national', 'National (INR)'], ['international', 'International (USD)'], ['admin', 'Reserved by DEO'], ['live', 'Exhibitor portal (HAL)']], 'All Exhibitors') +
        dateSel +
        ((SBA.q || SBA.type || SBA.status || SBA.hall || SBA.source || SBA.dateMode)
          ? '<button class="sba-icon" title="Clear filters" onclick="sbaClear()"><span class="material-symbols-outlined">filter_alt_off</span></button>' : '') +
        '<button class="sba-icon" title="Export to Excel" onclick="exportSbaApplications()"><span class="material-symbols-outlined">download</span></button>' +
        '<button class="sba-icon" title="Refresh" onclick="render();toast(\'Applications refreshed\')"><span class="material-symbols-outlined">refresh</span></button>' +
      '</div>' +
      '<div class="tablewrap"><table class="grid sba-table"><tr><th>Application</th><th>Exhibitor</th><th>Stall No.</th><th>Area</th>' +
        '<th>Scheme</th><th>Net Payable</th><th>Validity</th><th>Stage</th><th>Created</th><th>Action</th></tr>' + trs + '</table></div>' +
      '<div class="sba-foot"><span class="sba-total">Total: ' + list.length + '</span><span style="flex:1"></span>' +
        '<label class="sba-rows">Rows <select onchange="SBA.rows=+this.value;SBA.page=1;render()">' +
          [10, 25, 50].map((n) => '<option' + (SBA.rows === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<span class="sba-showing">Showing ' + (list.length ? st + 1 : 0) + ' to ' + Math.min(st + SBA.rows, list.length) + '</span>' +
        '<button class="sba-icon" ' + (SBA.page <= 1 ? 'disabled' : 'onclick="sbaPage(' + (SBA.page - 1) + ')"') + ' aria-label="Previous page"><span class="material-symbols-outlined">chevron_left</span></button>' +
        '<button class="sba-icon" ' + (SBA.page >= pages ? 'disabled' : 'onclick="sbaPage(' + (SBA.page + 1) + ')"') + ' aria-label="Next page"><span class="material-symbols-outlined">chevron_right</span></button>' +
      '</div></div>' + footerTools();
}
const viewSpaceReservations = viewSpaceApplications; // legacy route names
const viewSpaceApprovals = viewSpaceApplications;

function sbaMenu(btn) {
  const m = btn.nextElementSibling;
  const open = m.classList.contains('open');
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  if (open) return;
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
    headers: ['Application No', 'Proforma Invoice', 'Exhibitor', 'Reg No', 'Type', 'Hall / Chalet Line', 'Stall No', 'Area (sqm)', 'Mezzanine (sqm)', 'Size', 'Scheme', 'Open Sides',
      'Exhibitor Type', 'Currency', 'Net Payable', 'Stage', 'Cart Created', 'Valid Till', 'Days Left', 'Extensions', 'Payment Mode', 'Method', 'Reference', 'Paid At', 'Allotted At', 'Reserved By'],
    rows: list.map((b) => {
      const h = sbdHold(b); const s = sbdStallOf(b);
      return [b.no, b.piNo + (b.piRev ? ' R' + b.piRev : ''), b.company, b.regNo, sbaTypeLabel(b), sbdZoneLabel(s.hall), s.name, s.sqm, s.mezzSqm || 0, s.size || '', sbdSchemeLabel(s.scheme), s.sides || '1 Side',
        SBDT_ORIGIN[b.origin || 'national'], b.origin === 'international' ? 'USD' : 'INR', b.total, SBA_STATUS[b.status][2], sbdFmt(b.createdAt), sbpDate(b.holdUntil), sbdIsOpen(b) ? (h.paused ? 'Paused' : h.left) : '-',
        (b.extensions || []).length, b.payment && b.payment.mode ? SBDT_MODE[b.payment.mode] : '-', b.payment ? b.payment.method || '-' : '-', b.payment ? b.payment.ref || b.payment.txn || '-' : '-',
        b.paidAt ? sbdFmt(b.paidAt) : '-', b.allotment ? b.allotment.at : '-', b.reservedBy || 'Exhibitor'];
    }),
  }]);
}

/* ---------------- detail drawer ---------------- */
function sbaClose() { const d = $('sbaDrawer'); if (d) d.remove(); }
function sbaOpen(id) {
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  const cur = sbdCur(b);
  const f = (n) => sbpFmt(n, cur);
  const s = sbdStallOf(b);
  let exId = b.exId;
  if (!exId && typeof A !== 'undefined' && A.exhibitors) {
    const m = A.exhibitors.find((e) => /hindustan aeronautics/i.test(e.company));
    if (m) exId = m.id;
  }
  const spec = (k, v) => '<div class="sba-spec"><small>' + k + '</small><b>' + v + '</b></div>';
  const ch = s.hall === 'CH';
  const specs = '<div class="sba-specs">' +
      spec(ch ? 'Zone' : 'Hall', esc(sbdZoneLabel(s.hall))) + spec('Stall No.', esc(s.name)) + spec('Area', s.sqm + ' m² · ' + esc(s.size || '')) +
      spec(ch ? 'Chalet Type' : 'Scheme', esc(sbdSchemeLabel(s.scheme))) + spec('Open Sides', esc(sbaSides(s))) + spec('Mezzanine', s.mezzSqm ? s.mezzSqm + ' m² (' + Math.round((s.mezzSqm / s.sqm) * 100) + '%)' : 'none') +
    '</div>';

  const h = sbdHold(b);
  const ext = (b.extensions || []).map((e) =>
    '<div class="action-row" style="padding:7px 0"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">more_time</span></span>' +
    '<div class="atext"><b>Extended to ' + sbpDate(e.to) + '</b><span>' + (e.reason ? esc(e.reason) + ' · ' : '') + 'by ' + esc(e.by || SBD_ADMIN) + ' · ' + esc(e.at || '') + '</span></div></div>').join('');
  const clock = sbdIsOpen(b)
    ? '<div class="sba-specs" style="grid-template-columns:repeat(3,1fr)">' + spec('Cart Created', sbaDate(b.createdAt) + ' · ' + sbaTime(b.createdAt)) + spec('Valid Till', sbpDate(b.holdUntil) + ' 23:59 IST') +
        spec(h.paused ? 'Clock' : 'Days Left', h.paused ? 'Paused since ' + sbpDate(b.pausedAt) + ' (' + h.left + ' day' + (h.left === 1 ? '' : 's') + ' remaining)' : (h.left <= 0 ? 'Expires today' : h.left + ' day' + (h.left === 1 ? '' : 's'))) + '</div>' +
      (b.status === 'reserved' ? '<div class="sba-note' + (h.left <= 3 ? ' red' : '') + '"><span class="material-symbols-outlined">' + (h.left <= 3 ? 'warning' : 'info') + '</span>' +
        (h.left <= 0 ? 'Validity ends today — the stall is released at 23:59 IST unless 100% payment is received or validity is extended.'
          : 'Reminders go to the exhibitor at T−7, T−3 and T−1 days. Unpaid carts are released automatically on expiry; extend validity only before that.') + '</div>' : '') + ext
    : b.status === 'confirmed'
      ? '<div class="sba-specs" style="grid-template-columns:repeat(3,1fr)">' + spec('Cart Created', sbaDate(b.createdAt)) + spec('Was Valid Till', sbpDate(b.holdUntil)) + spec('Paid On', b.paidAt ? sbaDate(b.paidAt) + ' · ' + sbaTime(b.paidAt) : '—') + '</div>' + ext
      : b.status === 'expired'
        ? '<div class="sba-note red"><span class="material-symbols-outlined">timer_off</span>Expired on ' + sbpDate(b.holdUntil) + ' — validity lapsed without full payment. The space is back in inventory; the exhibitor can book again.</div>' + ext
        : '<div class="sba-note red"><span class="material-symbols-outlined">lock_open</span>Released' + (b.releasedAt ? ' on ' + esc(b.releasedAt) : '') + (b.remark ? ' — ' + esc(b.remark) : '') + '. The space is back in inventory.</div>' + ext;

  const p = b.pricing;
  const l = p.lines[0] || {};
  const sum = (k, v, st) => '<div class="sba-sum"><span>' + k + '</span><b' + (st ? ' style="' + st + '"' : '') + '>' + v + '</b></div>';
  const calc =
    sum(l.chalet ? 'Chalet <small>flat rate</small>' : 'Space Rental <small>' + l.sqm + ' sq.m × ' + f(l.rate) + '</small>', f(p.base)) +
    sum('Corner Stall Fee <small>' + (l.sidePct ? '+' + Math.round(l.sidePct * 100) + '% · ' + sbaSides(s) : (ch ? 'not applicable on chalet' : '1 side open · no premium')) + '</small>', f(p.side || 0)) +
    (p.mezz ? sum('Mezzanine Floor <small>' + p.mezzSqm + ' sq.m × ' + f(l.mezzRate) + ' · no corner premium</small>', f(p.mezz)) : '') +
    '<div class="sba-sum line"></div>' +
    sum('Subtotal', f(p.subtotal)) +
    sum('GST (' + Math.round((p.gstPct || 0.18) * 100) + '%)', f(p.gst)) +
    '<div class="sba-sum line"></div>' +
    sum('<b style="color:var(--blue)">Grand Total</b>', f(p.grand), 'color:var(--blue)') +
    (p.credit ? sum('Registration Fee <small>already paid · adjusted</small>', '− ' + f(p.credit)) : '') +
    '<div class="sba-sum line"></div>' +
    sum('<b>Net Payable (100% · single payment)</b>', f(p.payable)) +
    (b.origin === 'international' ? '<div class="sba-sum"><span><small style="margin:0">≈ ' + money(sbdInrEq(p.payable)) + ' at ₹' + sbpConfig().usdRate + ' = $1 (reference only; billed in USD)</small></span></div>' : '');

  const pm = b.payment;
  const payRow = (k, v) => '<tr><td style="color:var(--muted);width:40%">' + k + '</td><td><b>' + v + '</b></td></tr>';
  const paySec = b.status === 'payment_under_verification'
    ? '<div class="sba-note"><span class="material-symbols-outlined">hourglass_top</span>Offline payment proof uploaded by the exhibitor — verify the credit in DEO’s bank account, then mark received (the stall is allotted automatically) or reject.</div>' +
      '<div class="tablewrap"><table class="grid">' + payRow('Mode', 'Offline') + payRow('Method', esc(pm.method)) + payRow('UTR / Reference', '<span class="regno">' + esc(pm.ref) + '</span>') +
        payRow('Payment Date', esc(pm.date || '—')) + payRow('Amount Transferred', (pm.settleCurrency && pm.settleCurrency !== cur ? sbpFmt(pm.settleAmount, pm.settleCurrency) + ' <small style="color:var(--muted)">= ' + f(pm.amount || b.total) + ' at ₹' + esc(String(pm.fxRate)) + '/$</small>' : f(pm.amount || b.total))) + payRow('Proof File', pm.fileName ? esc(pm.fileName) : '<span style="color:var(--muted)">not attached</span>') +
        payRow('Submitted', esc(pm.submittedAt || '—')) + '</table></div>'
    : b.status === 'confirmed'
      ? '<div class="tablewrap"><table class="grid">' + payRow('Status', '<span class="pill green">Paid · 100%</span>') + payRow('Mode', pm ? SBDT_MODE[pm.mode || 'online'] : 'Online') +
        payRow('Method', esc(pm ? pm.method || 'Card' : 'Card')) + payRow('Txn / Reference', '<span class="regno">' + esc((pm && (pm.txn || pm.ref)) || b.orderNo || '—') + '</span>') +
        payRow('Paid At', b.paidAt ? sbdFmt(b.paidAt) : '—') + (sbpSettlementText(pm, cur) ? payRow('Settlement', esc(sbpSettlementText(pm, cur))) : '') + (pm && pm.verifiedBy ? payRow('Verified By', esc(pm.verifiedBy) + (pm.verifiedAt ? ' · ' + esc(pm.verifiedAt) : '')) : '') +
        (b.orderNo ? payRow('Tax Invoice', '<span class="regno">INV-' + esc(String(b.orderNo).replace('ORD-', '')) + '</span> <button class="btn-link" style="padding:0" onclick="sbaDownloadInvoice(\'' + b.id + '\')">Download</button>') : '') + '</table></div>'
      : b.status === 'reserved'
        ? '<div class="sba-note"><span class="material-symbols-outlined">info</span>Awaiting 100% payment of ' + f(b.total) + ' — online through the portal, or offline (NEFT / RTGS / Cheque / Wire) against proforma invoice ' + esc(b.piNo) + '. If the company has transferred directly to DEO’s account, use <b>Mark Offline Payment</b> to record it; the stall is allotted automatically.</div>' +
          (pm && pm.rejectedAt ? '<div class="sba-note red"><span class="material-symbols-outlined">rule</span>Earlier proof rejected ' + esc(pm.rejectedAt) + ' — ' + esc(pm.method) + ' · ' + esc(pm.ref) + (pm.remark ? ' · ' + esc(pm.remark) : '') + '. Clock resumed from where it paused.</div>' : '')
        : '<div class="sba-note"><span class="material-symbols-outlined">block</span>No payment was received against this application.</div>';

  const allotSec = b.status === 'confirmed'
    ? '<section class="sba-sec" style="border-color:#EFB3AA"><h4><span class="material-symbols-outlined" style="color:var(--red)">lock</span>Allotment — locked</h4>' +
        '<div class="sba-specs" style="grid-template-columns:repeat(3,1fr)">' + spec('Allotted To', esc(b.company)) + spec('Allotted On', esc(b.allotment ? b.allotment.at : (b.paidAt ? sbdFmt(b.paidAt) : '—'))) + spec('By', esc(b.allotment ? b.allotment.by : 'System (auto-allotment)')) + '</div>' +
        (b.allotment && b.allotment.entitlement ? '<div class="sba-note" style="margin-top:10px"><span class="material-symbols-outlined">badge</span>Quota released: ' + b.allotment.entitlement.allDay + ' all-day exhibitor passes · ' + b.allotment.entitlement.oneDay + ' one-day passes · ' + b.allotment.entitlement.car + ' car pass(es) for ' + b.allotment.entitlement.sqm + ' sq.m allotted in total.</div>' : '') +
        '<div class="sba-note red" style="margin-top:10px"><span class="material-symbols-outlined">block</span>No upgrade / downgrade after allotment. Only <b>Shift Stall</b> (DEO) can move this allotment; the difference is settled as a differential invoice or a credit note.</div></section>'
    : '';
  const adj = b.adjustment;
  const adjSec = adj
    ? '<section class="sba-sec"><h4><span class="material-symbols-outlined">swap_horiz</span>Shift Differential · ' + esc(adj.no) + '</h4>' +
        '<p class="sba-meta" style="margin:0 0 8px">' + esc(adj.reason || '') + '</p>' +
        '<div class="tablewrap"><table class="grid">' + payRow('Amount', f(adj.amount)) + payRow('Status', adj.status === 'paid' ? '<span class="pill green">Paid</span> ' + esc(adj.paidAt || '') : adj.status === 'under_verification' ? '<span class="pill blue">Proof under verification</span>' : '<span class="pill amber">Due</span>') +
        (adj.payment ? payRow('Payment', esc(adj.payment.method) + (adj.payment.ref ? ' · Ref ' + esc(adj.payment.ref) : '')) : '') + '</table></div></section>'
    : '';
  const cnSec = b.creditNote
    ? '<section class="sba-sec"><h4><span class="material-symbols-outlined">receipt</span>Credit Note · ' + esc(b.creditNote.no) + '</h4><div class="tablewrap"><table class="grid">' + payRow('Amount', f(b.creditNote.amount)) + payRow('Reason', esc(b.creditNote.reason || '')) + payRow('Issued', esc(b.creditNote.createdAt || '')) + '</table></div></section>'
    : '';
  const auditRows = (b.audit && b.audit.length ? b.audit : [{ at: sbdFmt(b.createdAt), by: b.reservedBy || b.company, event: 'Application created', detail: 'Stall ' + s.name + ' reserved in cart' }])
    .slice().reverse().map((e) => '<div class="action-row" style="padding:7px 0"><span class="aicon" style="background:#F1F4FA;color:var(--muted)"><span class="material-symbols-outlined">history</span></span>' +
      '<div class="atext"><b style="font-weight:600">' + esc(e.event) + (e.detail ? ' — <span style="font-weight:500">' + esc(e.detail) + '</span>' : '') + '</b><span>' + esc(e.at) + ' · ' + esc(e.by) + '</span></div></div>').join('');

  const html =
    '<div class="sba-drawer-bg" onclick="sbaClose()"></div>' +
    '<aside class="sba-drawer" role="dialog" aria-modal="true" aria-label="Application ' + esc(b.no) + '">' +
      '<div class="sba-dhead"><div><h2>' + esc(b.no) + '</h2><small style="color:var(--muted)">' + esc(b.piNo) + (b.piRev ? ' · Rev ' + b.piRev : '') + ' · Stall <b>' + esc(s.name) + '</b> · ' + esc(sbdZoneLabel(s.hall)) + '</small></div><button class="modal-close" onclick="sbaClose()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<div class="sba-dbody">' +
        '<div class="sba-exrow"><div><small class="sba-eyebrow">EXHIBITOR</small><h3>' + esc(b.company) + '</h3>' +
          '<div class="sba-when"><span class="material-symbols-outlined">calendar_today</span>' + sbaDate(b.createdAt) + ' · ' + sbaTime(b.createdAt) +
            (b.regNo ? ' · <span class="regno">' + esc(b.regNo) + '</span>' : '') + (b.reservedBy ? ' · reserved by ' + esc(b.reservedBy) : '') + '</div></div>' +
          (exId ? '<a class="btn btn-primary sba-profile" href="#/exhibitor/' + exId + '"><span class="material-symbols-outlined">person</span>Profile</a>' : '') + '</div>' +
        '<div class="sba-chips">' + sbaTypeChip(b) +
          (b.origin === 'international' ? '<span class="sba-chip blue"><span class="material-symbols-outlined">public</span>International · Billed in USD</span>' : '') +
          '<span class="sba-chip ' + SBA_STATUS[b.status][3] + '"><span class="material-symbols-outlined">' + SBA_STATUS[b.status][0] + '</span>' + SBA_STATUS[b.status][2] + '</span></div>' +
        allotSec +
        '<section class="sba-sec"><h4><span class="material-symbols-outlined">timer</span>Cart Validity (' + sbpHoldDays() + ' days)</h4>' + clock + '</section>' +
        '<section class="sba-sec"><h4><span class="material-symbols-outlined">grid_view</span>Space Specifications</h4>' + specs + '</section>' +
        '<section class="sba-sec"><h4><span class="material-symbols-outlined">payments</span>Proforma Invoice ' + esc(b.piNo) + (b.piRev ? ' · Rev ' + b.piRev : '') + '</h4>' + calc +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="sbaDownloadPI(\'' + b.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">description</span>Download PI</button>' +
          (b.status !== 'confirmed' && SBD_HOLDING.includes(b.status) ? '<button class="btn btn-outline btn-sm" onclick="sbaEmailPI(\'' + b.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">mail</span>E-mail PI</button>' : '') +
          (b.status === 'confirmed' ? '<button class="btn btn-outline btn-sm" onclick="sbaDownloadInvoice(\'' + b.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">receipt_long</span>Tax Invoice</button>' : '') + '</div></section>' +
        '<section class="sba-sec"><h4><span class="material-symbols-outlined">receipt_long</span>Payment</h4>' + paySec + '</section>' +
        adjSec + cnSec +
        '<section class="sba-sec"><h4><span class="material-symbols-outlined">history</span>Audit Trail</h4>' + auditRows + '</section>' +
      '</div>' +
      '<div class="sba-dfoot" style="flex-wrap:wrap">' + sbaActionButtons(b, 'btn btn-outline btn-sm') + '</div>' +
    '</aside>';
  sbaClose();
  const wrap = document.createElement('div');
  wrap.id = 'sbaDrawer';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sbaClose(); });
window.addEventListener('hashchange', sbaClose);

/* ---------------- DEO actions (live → exhibitor state, demo → override store) ---------------- */
/* patch: fields merged into the record · liveFx(r, ex): extra effects on the exhibitor state · demoFx(d): extra patch fields for demo rows */
function sbaApply(b, patch, liveFx, demoFx) {
  if (b.source === 'live') {
    const ex = sbdLoadKey(b.profile || SB_EXHIBITORS[0]); if (!ex || !ex.spaceBooking) return;
    const r = ex.spaceBooking.reservations.find((x) => x.id === b.id); if (!r) return;
    Object.assign(r, patch);
    if (liveFx) liveFx(r, ex);
    sbdSaveKey(ex);
  } else {
    const d = Object.assign({}, patch);
    if (demoFx) demoFx(d);
    sbDemoPatch(b.id, d);
  }
}
const sbaAuditDemo = (b, event, detail) => (b.audit || []).concat([{ at: nowStr(), atIso: new Date().toISOString(), by: SBD_ADMIN, event: event, detail: detail || '' }]);
const sbaStallNames = (b) => b.stalls.map((s) => s.name).join(', ');
function sbaRefresh(id) { render(); sbaOpen(id); }

/* automatic allotment on the exhibitor state (mirror of sbAllot in spacebooking.js) */
function sbaAllotLive(r, ex, payment, by) {
  const s = r.stalls[0];
  const at = new Date();
  if (!ex.seq.order) ex.seq.order = 0;
  ex.seq.order += 1;
  const orderNo = 'ORD-2027-' + String(ex.seq.order).padStart(4, '0');
  r.status = 'confirmed'; r.paidAt = nowStr(); r.paidAtIso = at.toISOString(); r.pausedAt = null;
  r.payment = Object.assign({}, r.payment || {}, payment); r.orderNo = orderNo;
  (ex.orders = ex.orders || []).push({
    id: 'order_' + ex.seq.order, orderNo: orderNo, type: 'space', label: 'Stall ' + s.name + ' — Application ' + r.no + ' · 100% payment',
    sub: r.piNo + ' · ' + r.payment.method + (r.payment.ref ? ' · Ref ' + r.payment.ref : ''), refId: r.id,
    amount: r.payment.settleAmount || r.amount, currency: r.payment.settleCurrency || r.pricing.currency, billedAmount: r.amount, billedCurrency: r.pricing.currency, fxRate: r.payment.fxRate || null, status: 'success', method: r.payment.method, mode: r.payment.mode, ref: r.payment.ref || '',
    paidAt: nowStr(), paidAtIso: at.toISOString(), payer: exCompany(ex),
  });
  if (!ex.stalls.some((x) => x.stall === s.name)) ex.stalls.push({ id: 'st_' + s.name, hall: sbdZoneLabel(s.hall), stall: s.name, area: s.sqm, mezzSqm: s.mezzSqm || 0, scheme: s.scheme, appId: r.id, company: exCompany(ex) });
  const ent = sbpApplyEntitlement(ex);
  r.allotment = { at: nowStr(), atIso: at.toISOString(), by: by || 'System (auto-allotment)', company: exCompany(ex), entitlement: ent, locked: true };
  ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
  sbpAudit(r, by || SBD_ADMIN, '100% payment confirmed', (r.payment.mode === 'offline' ? 'Offline · ' + r.payment.method + ' · Ref ' + r.payment.ref : 'Online · ' + r.payment.method) + ' · ' + sbpFmt(r.amount, r.pricing.currency) + (sbpSettlementText(r.payment, r.pricing.currency) ? ' · ' + sbpSettlementText(r.payment, r.pricing.currency) : '') + ' · ' + orderNo);
  sbpAudit(r, 'System', 'Stall allotted automatically', 'Stall ' + s.name + ' mapped to ' + exCompany(ex) + ' · layout updated · tax invoice ' + orderNo.replace('ORD-', 'INV-') + ' · locked');
  sbpAudit(r, 'System', 'Badge & vehicle quota released', ent.allDay + ' all-day passes, ' + ent.oneDay + ' one-day passes, ' + ent.car + ' car pass(es) for ' + ent.sqm + ' sq.m');
  sbdNotifyEx(ex, 'verified', 'var(--green)', 'DEO verified your ' + r.payment.method + ' payment' + (r.payment.ref ? ' (Ref ' + r.payment.ref + ')' : '') + ' — stall ' + s.name + ' allotted to ' + exCompany(ex) + ' (application ' + r.no + '). Tax invoice ' + orderNo.replace('ORD-', 'INV-') + ' and your badge / vehicle quota are available.');
  sbdEmail('allotment', exCompany(ex), 'Stall ' + s.name + ' allotted — application ' + r.no + ' · tax invoice ' + orderNo.replace('ORD-', 'INV-'), 'Allotment confirmation with tax invoice attached.', ex);
  return orderNo;
}
/* same outcome on a demo row (override patch) */
function sbaAllotDemoPatch(b, payment, by) {
  const at = new Date();
  const orderNo = 'ORD-2027-' + String(5000 + (sbHash(b.id + at.getTime()) % 4999));
  const ent = sbpEntitlement(sbdSqm(b));
  return { status: 'confirmed', paidAtIso: at.toISOString(), pausedAt: null, payment: Object.assign({}, b.payment || {}, payment), orderNo: orderNo,
    allotment: { at: nowStr(), atIso: at.toISOString(), by: by || 'System (auto-allotment)', company: b.company, entitlement: ent, locked: true },
    audit: sbaAuditDemo(b, '100% payment confirmed', payment.method + (payment.ref ? ' · Ref ' + payment.ref : '') + ' · ' + sbpFmt(b.total, sbdCur(b)) + ' · ' + orderNo)
      .concat([{ at: nowStr(), by: 'System', event: 'Stall allotted automatically', detail: 'Stall ' + sbdStallOf(b).name + ' mapped to ' + b.company + ' · layout updated · tax invoice ' + orderNo.replace('ORD-', 'INV-') + ' · locked' },
        { at: nowStr(), by: 'System', event: 'Badge & vehicle quota released', detail: ent.allDay + ' all-day passes, ' + ent.oneDay + ' one-day passes, ' + ent.car + ' car pass(es)' }]) };
}

/* Extend validity — allowed only before expiry */
function sbaExtend(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !sbdIsOpen(b)) { toast('Validity can be extended only while the application is in the cart (before expiry).', 'error'); return; }
  sbaClose();
  const cur = new Date(b.holdUntil);
  const def = new Date(Math.max(cur.getTime(), Date.now()) + 7 * 864e5).toISOString().slice(0, 10);
  const min = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  openModal('Extend Validity · ' + esc(b.piNo),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · stall ' + esc(sbaStallNames(b)) + ' · currently valid till <b>' + sbpDate(b.holdUntil) + '</b>' +
      (b.status === 'payment_under_verification' ? ' (clock paused — payment proof under verification)' : '') + '</p>' +
    '<div class="form-grid"><div class="field"><label>New valid-till date <span class="req">*</span></label><input type="date" id="sbaExtDate" value="' + def + '" min="' + min + '"><div class="error"></div></div>' +
    '<div class="field full"><label>Reason (shown to the exhibitor) <span class="req">*</span></label><input type="text" id="sbaExtReason" placeholder="e.g. RTGS in transit — exhibitor requested 7 more days"><div class="error"></div></div></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sbaDoExtend(\'' + id + '\')"><span class="material-symbols-outlined">more_time</span>Extend Validity</button>');
}
function sbaDoExtend(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !sbdIsOpen(b)) return;
  const date = $('sbaExtDate').value;
  const reason = ($('sbaExtReason').value || '').trim();
  clearErrs();
  let ok = true;
  if (!date) { setErr('sbaExtDate', 'Pick the new date'); ok = false; }
  else if (sbpEndOfDayIst(date) <= b.holdUntil) { setErr('sbaExtDate', 'Must be later than the current validity (' + sbpDate(b.holdUntil) + ')'); ok = false; }
  if (!reason) { setErr('sbaExtReason', 'A reason is required for case-by-case extension'); ok = false; }
  if (!ok) return;
  const to = sbpEndOfDayIst(date);
  const entry = { from: b.holdUntil, to: to, reason: reason, at: nowStr(), by: SBD_ADMIN };
  const subject = 'Validity of ' + b.piNo + ' extended to ' + sbpDate(to);
  sbaApply(b, { holdUntil: to, extensions: (b.extensions || []).concat([entry]), reminders: {} }, (r, ex) => {
    (ex.cart || []).forEach((c) => { if (c.type === 'space' && c.refId === r.id) c.sub = r.piNo + ' · valid till ' + sbpDate(to); });
    sbpAudit(r, SBD_ADMIN, 'Validity extended', 'to ' + sbpDate(to) + ' — ' + reason);
    sbdNotifyEx(ex, 'more_time', 'var(--blue)', 'DEO extended the validity of application ' + r.no + ' to ' + sbpDate(to) + ' — ' + reason + '. Pay ' + sbpFmt(r.amount, r.pricing.currency) + ' by then to confirm stall ' + r.stalls[0].name + '.');
    sbdEmail('extension', exCompany(ex), subject, reason, ex);
  }, (d) => { d.audit = sbaAuditDemo(b, 'Validity extended', 'to ' + sbpDate(to) + ' — ' + reason); sbdEmail('extension', b.company, subject, reason); });
  closeModal(); sbaRefresh(id);
  toast('Validity of ' + b.piNo + ' extended to ' + sbpDate(to) + '.', 'success');
}

/* Mark offline payment received (proof uploaded by the exhibitor) → automatic allotment */
function sbaMarkReceived(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'payment_under_verification') return;
  const pm0 = b.payment;
  const settled = pm0.settleCurrency && pm0.settleCurrency !== sbdCur(b) ? ' (received ' + sbpFmt(pm0.settleAmount, pm0.settleCurrency) + ' at ₹' + pm0.fxRate + '/$)' : '';
  if (!confirm('Confirm that ' + sbpFmt(b.total, sbdCur(b)) + ' (100%) for ' + b.piNo + settled + ' has been received in DEO’s account?\n' + pm0.method + ' · Ref ' + pm0.ref + '\nStall ' + sbaStallNames(b) + ' will be allotted to ' + b.company + ' automatically and a tax invoice issued.')) return;
  const txn = 'TXN' + String(sbHash(b.id + Date.now())).slice(0, 9);
  const payment = { verifiedAt: nowStr(), verifiedBy: SBD_ADMIN, txn: txn, amount: b.total, mode: 'offline', method: pm0.method, ref: pm0.ref, settleCurrency: pm0.settleCurrency || sbdCur(b), fxRate: pm0.fxRate || null, settleAmount: pm0.settleAmount || b.total };
  sbaApply(b, {}, (r, ex) => { sbaAllotLive(r, ex, payment, SBD_ADMIN); }, (d) => { Object.assign(d, sbaAllotDemoPatch(b, payment, SBD_ADMIN)); });
  sbaRefresh(id);
  toast(b.piNo + ' marked as paid — stall ' + sbaStallNames(b) + ' allotted to ' + b.company + '.', 'success');
}
/* Mark offline payment (direct bank transfer, no proof uploaded) → automatic allotment */
function sbaRecordOffline(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'reserved') return;
  sbaClose();
  const today = new Date().toISOString().slice(0, 10);
  const cur = sbdCur(b);
  openModal('Mark Offline Payment · ' + esc(b.piNo),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · stall <b>' + esc(sbaStallNames(b)) + '</b> · net payable <b>' + sbpFmt(b.total, cur) + '</b> (100%)</p>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Method <span class="req">*</span></label><select id="sbaOffMethod">' + (b.origin === 'international' ? ['SWIFT (Wire Transfer)', 'Cheque / DD'] : ['NEFT', 'RTGS', 'Cheque / DD']).map((m) => '<option>' + m + '</option>').join('') + '</select><div class="error"></div></div>' +
      '<div class="field"><label>UTR / Reference No. <span class="req">*</span></label><input type="text" id="sbaOffRef" placeholder="as per bank statement"><div class="error"></div></div>' +
      '<div class="field"><label>Credit Date <span class="req">*</span></label><input type="date" id="sbaOffDate" value="' + today + '" max="' + today + '"><div class="error"></div></div>' +
      (sbpInrSettlementAllowed(cur)
        ? '<div class="field"><label>Received in</label><select id="sbaOffCur" onchange="sbaOffCurChange(' + b.total + ')"><option value="USD">USD (billing currency)</option><option value="INR">INR at DEO settlement rate</option></select></div>' +
          '<div class="field"><label>Exchange rate (₹ per USD)</label><input type="number" id="sbaOffFx" value="' + sbpFxRate() + '" step="0.01" min="1" disabled oninput="sbaOffCurChange(' + b.total + ')"><div class="hint">Rate from Space Booking Configuration; override for this receipt if the bank applied a different rate.</div></div>'
        : '') +
      '<div class="field"><label><span id="sbaOffAmtLbl">Amount Received (' + cur + ')</span> <span class="req">*</span></label><input type="number" id="sbaOffAmt" value="' + b.total + '" min="1"><div class="error"></div></div>' +
      '<div class="field full"><label>Bank account credited</label><select id="sbaOffBank">' + DEO_BANK.accounts.map((a) => '<option>' + esc(a.bank + ' · ' + a.account) + '</option>').join('') + '</select></div>' +
    '</div><p style="font-size:0.76rem;color:var(--muted);margin:8px 0 0">On saving, the application is marked paid, the stall is allotted automatically to the company, a tax invoice is issued and the exhibitor is notified.</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sbaDoRecordOffline(\'' + id + '\')"><span class="material-symbols-outlined">task_alt</span>Mark Received &amp; Allot</button>');
}
function sbaOffCurChange(total) {
  const settle = $('sbaOffCur').value;
  const fx = $('sbaOffFx');
  fx.disabled = settle !== 'INR';
  $('sbaOffAmtLbl').textContent = 'Amount Received (' + settle + ')';
  $('sbaOffAmt').value = settle === 'INR' ? sbpToInr(total, Number(fx.value) || sbpFxRate()) : total;
}
function sbaDoRecordOffline(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'reserved') return;
  clearErrs();
  let ok = true;
  const cur = sbdCur(b);
  const method = $('sbaOffMethod').value, ref = ($('sbaOffRef').value || '').trim(), date = $('sbaOffDate').value, amt = Number($('sbaOffAmt').value), bank = $('sbaOffBank').value;
  const settle = $('sbaOffCur') ? $('sbaOffCur').value : cur;
  const rate = $('sbaOffFx') ? (Number($('sbaOffFx').value) || sbpFxRate()) : sbpFxRate();
  const due = sbpSettleAmount(b.total, cur, settle, rate);
  if (!ref) { setErr('sbaOffRef', 'Reference is required'); ok = false; }
  if (!date) { setErr('sbaOffDate', 'Credit date is required'); ok = false; }
  if (!amt || amt < due) { setErr('sbaOffAmt', '100% (' + sbpFmt(due, settle) + (settle !== cur ? ' = ' + sbpFmt(b.total, cur) + ' at ₹' + rate + '/$' : '') + ') must be received — part payments cannot be allotted'); ok = false; }
  if (!ok) return;
  const payment = { mode: 'offline', method: method, ref: ref, date: date, amount: b.total, bank: bank, submittedAt: nowStr(), verifiedAt: nowStr(), verifiedBy: SBD_ADMIN, txn: 'TXN' + String(sbHash(b.id + Date.now())).slice(0, 9), recordedBy: SBD_ADMIN,
    settleCurrency: settle, fxRate: settle !== cur ? rate : null, settleAmount: amt };
  const detail = method + ' · Ref ' + ref + ' · ' + bank + ' · ' + sbpFmt(amt, settle) + (settle !== cur ? ' (' + sbpFmt(b.total, cur) + ' at ₹' + rate + '/$)' : '');
  sbaApply(b, {}, (r, ex) => { sbpAudit(r, SBD_ADMIN, 'Offline payment recorded by DEO', detail); sbaAllotLive(r, ex, payment, SBD_ADMIN); },
    (d) => { Object.assign(d, sbaAllotDemoPatch(b, payment, SBD_ADMIN)); d.audit.unshift({ at: nowStr(), by: SBD_ADMIN, event: 'Offline payment recorded by DEO', detail: detail }); });
  closeModal(); sbaRefresh(id);
  toast('Offline payment recorded — stall ' + sbaStallNames(b) + ' allotted to ' + b.company + '.', 'success');
}
/* Mark a shift differential as received */
function sbaMarkAdjReceived(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !b.adjustment || b.adjustment.status === 'paid') return;
  const ref = prompt('Reference / UTR for the differential of ' + sbpFmt(b.adjustment.amount, sbdCur(b)) + ' (' + b.adjustment.no + '):', (b.adjustment.payment && b.adjustment.payment.ref) || '');
  if (ref === null) return;
  const pay = Object.assign({}, b.adjustment.payment || { mode: 'offline', method: 'NEFT' }, { ref: ref.trim(), verifiedAt: nowStr(), verifiedBy: SBD_ADMIN, amount: b.adjustment.amount });
  const adj = Object.assign({}, b.adjustment, { status: 'paid', paidAt: nowStr(), paidAtIso: new Date().toISOString(), payment: pay });
  sbaApply(b, { adjustment: adj }, (r, ex) => {
    if (!ex.seq.order) ex.seq.order = 0; ex.seq.order += 1;
    const orderNo = 'ORD-2027-' + String(ex.seq.order).padStart(4, '0'); r.adjustment.orderNo = orderNo;
    (ex.orders = ex.orders || []).push({ id: 'order_' + ex.seq.order, orderNo: orderNo, type: 'space', label: 'Stall shift differential — Application ' + r.no, sub: r.adjustment.no + ' · ' + pay.method + (pay.ref ? ' · Ref ' + pay.ref : ''), refId: r.id, amount: r.adjustment.amount, currency: r.pricing.currency, status: 'success', method: pay.method, mode: pay.mode || 'offline', ref: pay.ref || '', paidAt: nowStr(), paidAtIso: new Date().toISOString(), payer: exCompany(ex) });
    sbpAudit(r, SBD_ADMIN, 'Shift differential received', sbpFmt(r.adjustment.amount, r.pricing.currency) + (pay.ref ? ' · Ref ' + pay.ref : '') + ' · ' + orderNo);
    sbdNotifyEx(ex, 'task_alt', 'var(--green)', 'DEO recorded the shift differential of ' + sbpFmt(r.adjustment.amount, r.pricing.currency) + ' (' + r.adjustment.no + ') as received.');
  }, (d) => { d.audit = sbaAuditDemo(b, 'Shift differential received', sbpFmt(b.adjustment.amount, sbdCur(b)) + (pay.ref ? ' · Ref ' + pay.ref : '')); });
  sbaRefresh(id);
  toast('Differential ' + b.adjustment.no + ' marked received.', 'success');
}

/* Reject proof → back to reserved, clock resumes from where it paused */
function sbaRejectProof(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'payment_under_verification') return;
  sbaClose();
  openModal('Reject Payment Proof · ' + esc(b.piNo),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · ' + esc(b.payment.method) + ' · Ref ' + esc(b.payment.ref) + ' · ' + sbpFmt(b.payment.amount || b.total, sbdCur(b)) + '</p>' +
    '<p style="margin:0 0 10px;font-size:0.8rem;color:var(--muted)">The application returns to the cart and the validity clock resumes from where it paused (' + sbdHold(b).left + ' day(s) remaining).</p>' +
    '<label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:6px">Remark (shown to the exhibitor) <span style="color:var(--red)">*</span></label>' +
    '<textarea id="sbaRemark" rows="3" placeholder="e.g. UTR not traceable in DEO account / amount short by …" style="width:100%;box-sizing:border-box;' + dateInputStyle + '"></textarea>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-danger-soft" onclick="sbaDoRejectProof(\'' + id + '\')">Reject Proof</button>');
}
function sbaDoRejectProof(id) {
  const remark = ($('sbaRemark').value || '').trim();
  if (!remark) { toast('Enter a remark for the exhibitor.', 'error'); return; }
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'payment_under_verification') return;
  const pausedMs = b.pausedAt ? new Date(b.pausedAt).getTime() : Date.now();
  const holdUntil = new Date(new Date(b.holdUntil).getTime() + (Date.now() - pausedMs)).toISOString();
  const payment = Object.assign({}, b.payment, { rejectedAt: nowStr(), rejectedBy: SBD_ADMIN, remark: remark });
  const subject = 'Payment proof for ' + b.piNo + ' not accepted — ' + remark;
  sbaApply(b, { status: 'reserved', holdUntil: holdUntil, pausedAt: null, payment: payment }, (r, ex) => {
    if (!ex.seq.cart) ex.seq.cart = 0;
    ex.seq.cart += 1;
    (ex.cart = ex.cart || []).push({ id: 'cart_' + ex.seq.cart, type: 'space', refId: r.id, currency: r.pricing.currency, label: 'Stall ' + r.stalls[0].name + ' · ' + sbdZoneLabel(r.stalls[0].hall) + ' — Application ' + r.no, sub: r.piNo + ' · valid till ' + sbpDate(holdUntil), amount: r.amount });
    sbpAudit(r, SBD_ADMIN, 'Payment proof rejected', remark + ' · clock resumed, valid till ' + sbpDate(holdUntil));
    sbdNotifyEx(ex, 'rule', 'var(--red)', 'DEO could not verify your ' + r.payment.method + ' payment for application ' + r.no + ' (Ref ' + r.payment.ref + '): ' + remark + '. The cart is valid till ' + sbpDate(holdUntil) + ' — pay online or upload a fresh proof.');
    sbdEmail('verification', exCompany(ex), subject, remark, ex);
  }, (d) => { d.audit = sbaAuditDemo(b, 'Payment proof rejected', remark + ' · clock resumed'); sbdEmail('verification', b.company, subject, remark); });
  closeModal(); sbaRefresh(id);
  toast('Payment proof for ' + b.piNo + ' rejected — application back in cart, valid till ' + sbpDate(holdUntil) + '.', 'error');
}

/* Release now — stall back to inventory immediately */
function sbaRelease(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !sbdIsOpen(b)) return;
  const remark = prompt('Release application ' + b.no + ' (stall ' + sbaStallNames(b) + ') now and return the stall to inventory?\nReason (shown to the exhibitor):', 'Released by DEO on exhibitor request');
  if (remark === null) return;
  const reason = remark.trim() || 'Released by DEO';
  sbaApply(b, { status: 'released', releasedAt: nowStr(), pausedAt: null, remark: reason }, (r, ex) => {
    ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbpAudit(r, SBD_ADMIN, 'Released', reason);
    sbdNotifyEx(ex, 'lock_open', 'var(--red)', 'DEO released application ' + r.no + ' (stall ' + r.stalls[0].name + ') — ' + reason + '. The stall is back in inventory.');
  }, (d) => { d.audit = sbaAuditDemo(b, 'Released', reason); });
  sbaRefresh(id);
  toast(b.no + ' released — space back in inventory.', 'error');
}

/* Debug: move the validity into the past so the expiry rule fires on the next render */
function sbaSimulateExpiry(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'reserved') return;
  if (!confirm('Simulate expiry of ' + b.piNo + '? Its validity will be set to yesterday — the application expires and stall ' + sbaStallNames(b) + ' is released on the next render (admin and exhibitor portal).')) return;
  const past = new Date(Date.now() - 864e5).toISOString();
  sbaApply(b, { holdUntil: past }, (r) => { sbpAudit(r, SBD_ADMIN, 'Validity moved (debug)', 'Simulated expiry — valid till set to ' + sbpDate(past)); },
    (d) => { d.audit = sbaAuditDemo(b, 'Validity moved (debug)', 'Simulated expiry'); });
  sbaRefresh(id);
  toast(b.piNo + ' expired (simulated) — stall released.', 'error');
}

/* ---------------- Shift stall A → B (differential / credit note) ---------------- */
function sbaStallOptions(exclude, hall) {
  const inv = sbdInventory();
  return sbZone(hall).stalls.filter((st) => !inv[hall + '|' + st.name] || (exclude && exclude.hall === hall && exclude.name === st.name));
}
function sbaShift(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !SBD_HOLDING.includes(b.status)) return;
  sbaClose();
  const s = sbdStallOf(b);
  window.__sbaShift = { id: id, hall: s.hall, name: '', scheme: s.scheme, mezz: s.mezzSqm || 0 };
  openModal('Shift Stall · Application ' + esc(b.no),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · currently <b>' + esc(s.name) + ' · ' + esc(sbdZoneLabel(s.hall)) + '</b> · ' + esc(sbdSchemeLabel(s.scheme)) + ' · ' + s.sqm + ' sq.m' + (s.mezzSqm ? ' + ' + s.mezzSqm + ' sq.m mezzanine' : '') + ' · ' + sbpFmt(b.total, sbdCur(b)) +
      (b.status === 'confirmed' ? ' · <span class="pill red">Allotted</span> — the allotment moves to the new stall; the price difference is raised as a differential invoice or credit note.' : ' — the proforma invoice is re-issued (new revision) for the new stall.') + '</p>' +
    '<div class="form-grid">' +
      '<div class="field"><label>New hall / zone</label><select id="shHall" onchange="window.__sbaShift.hall=this.value;window.__sbaShift.name=\'\';sbaShiftRefresh()">' + SBD_ZONES.map((z) => '<option value="' + z + '"' + (z === s.hall ? ' selected' : '') + '>' + sbdZoneLabel(z) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>New stall (available only)</label><select id="shStall" onchange="window.__sbaShift.name=this.value;sbaShiftRefresh()"></select><div class="error"></div></div>' +
      '<div class="field"><label>Scheme</label><select id="shScheme" onchange="window.__sbaShift.scheme=this.value;sbaShiftRefresh()"></select></div>' +
      '<div class="field"><label>Mezzanine area (sq.m)</label><input type="number" id="shMezz" min="0" value="' + (s.mezzSqm || 0) + '" oninput="window.__sbaShift.mezz=Number(this.value)||0;sbaShiftRefresh()"><div class="hint" id="shMezzHint"></div></div>' +
      '<div class="field full"><label>Reason <span class="req">*</span></label><input type="text" id="shReason" placeholder="e.g. Hall re-planning / exhibitor request / size consolidation"><div class="error"></div></div>' +
    '</div><div id="shPreview"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sbaDoShift(\'' + id + '\')"><span class="material-symbols-outlined">swap_horiz</span>Shift Stall</button>');
  sbaShiftRefresh();
}
function sbaShiftRefresh() {
  const st = window.__sbaShift;
  const b = sbdBookings().find((x) => x.id === st.id);
  const cur = sbdCur(b);
  const old = sbdStallOf(b);
  const opts = sbaStallOptions(old, st.hall).filter((x) => !(x.hall === old.hall && x.name === old.name));
  const sel = $('shStall');
  sel.innerHTML = '<option value="">— select —</option>' + opts.map((x) => '<option value="' + x.name + '"' + (x.name === st.name ? ' selected' : '') + '>' + x.name + ' · ' + x.sqm + ' sq.m · ' + x.sides + ' open</option>').join('');
  const isCh = st.hall === 'CH';
  const schemes = isCh ? [['chalet1', 'Single Storey'], ['chalet2', 'Double Storey']] : [['shell', 'Shell'], ['raw', 'Raw']];
  if (!schemes.some((x) => x[0] === st.scheme)) st.scheme = schemes[0][0];
  $('shScheme').innerHTML = schemes.map((x) => '<option value="' + x[0] + '"' + (x[0] === st.scheme ? ' selected' : '') + '>' + x[1] + '</option>').join('');
  const master = st.name ? sbStallMaster(st.hall, st.name) : null;
  const cand = master ? Object.assign({}, master, { scheme: st.scheme, mezzSqm: st.mezz }) : null;
  const eligible = cand && sbpMezzEligible(cand);
  $('shMezz').disabled = !eligible;
  $('shMezzHint').textContent = cand ? (eligible ? 'up to ' + sbpMezzMax(cand) + ' sq.m (' + Math.round(sbpConfig().mezz.maxPct * 100) + '% of ' + cand.sqm + ' sq.m)' : 'not eligible on this stall / scheme') : '';
  if (!cand) { $('shPreview').innerHTML = ''; return; }
  const np = sbpPrice([cand], { currency: cur, withCredit: b.pricing.credit > 0 });
  const diff = np.payable - b.total;
  $('shPreview').innerHTML = '<div class="sb-gw" style="margin-top:12px">' +
    '<div class="sb-gw-sum"><span>Current · ' + esc(old.name) + '</span><b>' + sbpFmt(b.total, cur) + '</b></div>' +
    '<div class="sb-gw-sum"><span>New · ' + esc(cand.name) + ' · ' + sbdSchemeLabel(cand.scheme) + ' · ' + cand.sqm + ' sq.m' + (np.mezzSqm ? ' + ' + np.mezzSqm + ' mezz.' : '') + '</span><b>' + sbpFmt(np.payable, cur) + '</b></div>' +
    '<div class="sb-gw-sum total"><span>' + (diff > 0 ? 'Differential payable by exhibitor' : diff < 0 ? 'Credit note in exhibitor’s favour' : 'No price difference') + '</span><b style="color:' + (diff > 0 ? 'var(--red)' : 'var(--green)') + '">' + sbpFmt(Math.abs(diff), cur) + '</b></div></div>';
}
function sbaDoShift(id) {
  const st = window.__sbaShift;
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  clearErrs();
  const reason = ($('shReason').value || '').trim();
  let ok = true;
  if (!st.name) { setErr('shStall', 'Select the new stall'); ok = false; }
  if (!reason) { setErr('shReason', 'A reason is required'); ok = false; }
  if (!ok) return;
  if (sbdInventory()[st.hall + '|' + st.name]) { setErr('shStall', 'That stall is no longer available'); return; }
  const old = sbdStallOf(b);
  const master = sbStallMaster(st.hall, st.name);
  const cand = Object.assign({}, master, { scheme: st.scheme, mezzSqm: 0 });
  cand.mezzSqm = sbpMezzEligible(cand) ? Math.min(Math.max(0, Math.floor(st.mezz)), sbpMezzMax(cand)) : 0;
  const cur = sbdCur(b);
  const np = sbpPrice([cand], { currency: cur, withCredit: b.pricing.credit > 0 });
  const diff = np.payable - b.total;
  const seq = String(1000 + (sbHash(b.id + Date.now()) % 8999));
  const patch = { stalls: [cand], pricing: np, amount: np.payable, total: np.payable, piRev: (b.piRev || 0) + 1 };
  const detail = old.name + ' (' + sbdZoneLabel(old.hall) + ') → ' + cand.name + ' (' + sbdZoneLabel(cand.hall) + ') · ' + sbdSchemeLabel(cand.scheme) + ' · ' + cand.sqm + ' sq.m' + (cand.mezzSqm ? ' + ' + cand.mezzSqm + ' mezz.' : '') + ' · ' + reason;
  let adjust = null, cn = null;
  if (b.status === 'confirmed') {
    if (diff > 0) adjust = { no: 'ADJ-AI27-' + seq, amount: diff, currency: cur, status: 'due', reason: 'Stall shift ' + old.name + ' → ' + cand.name + ' — ' + reason, createdAt: nowStr() };
    else if (diff < 0) cn = { no: 'CN-AI27-' + seq, amount: -diff, currency: cur, reason: 'Stall shift ' + old.name + ' → ' + cand.name + ' — ' + reason, createdAt: nowStr() };
    if (adjust) patch.adjustment = adjust;
    if (cn) patch.creditNote = cn;
    patch.allotment = Object.assign({}, b.allotment || {}, { shiftedFrom: old.name, shiftedAt: nowStr() });
  }
  const subject = 'Stall shifted ' + old.name + ' → ' + cand.name + ' — application ' + b.no + (adjust ? ' · differential ' + sbpFmt(adjust.amount, cur) + ' payable' : cn ? ' · credit note ' + sbpFmt(cn.amount, cur) : '');
  sbaApply(b, patch, (r, ex) => {
    (ex.cart || []).forEach((c) => { if (c.type === 'space' && c.refId === r.id) { c.label = 'Stall ' + cand.name + ' · ' + sbdZoneLabel(cand.hall) + ' — Application ' + r.no; c.sub = r.piNo + ' Rev ' + r.piRev + ' · valid till ' + sbpDate(r.holdUntil); c.amount = r.amount; } });
    if (r.status === 'confirmed') {
      ex.stalls = (ex.stalls || []).filter((x) => x.stall !== old.name);
      ex.stalls.push({ id: 'st_' + cand.name, hall: sbdZoneLabel(cand.hall), stall: cand.name, area: cand.sqm, mezzSqm: cand.mezzSqm || 0, scheme: cand.scheme, appId: r.id, company: exCompany(ex) });
      const ent = sbpApplyEntitlement(ex);
      r.allotment.entitlement = ent;
    }
    sbpAudit(r, SBD_ADMIN, 'Stall shifted', detail + (adjust ? ' · differential ' + adjust.no + ' ' + sbpFmt(adjust.amount, cur) + ' raised' : cn ? ' · credit note ' + cn.no + ' ' + sbpFmt(cn.amount, cur) + ' issued' : '') + ' · PI Rev ' + r.piRev);
    sbdNotifyEx(ex, 'swap_horiz', 'var(--blue)', 'DEO shifted your stall ' + old.name + ' → ' + cand.name + ' (' + sbdZoneLabel(cand.hall) + ') on application ' + r.no + ' — ' + reason + '.' + (adjust ? ' Differential ' + sbpFmt(adjust.amount, cur) + ' (' + adjust.no + ') is payable online or offline.' : cn ? ' Credit note ' + cn.no + ' for ' + sbpFmt(cn.amount, cur) + ' issued in your favour.' : r.status === 'confirmed' ? '' : ' Proforma invoice re-issued (Rev ' + r.piRev + ').'));
    sbdEmail('shift', exCompany(ex), subject, detail, ex);
  }, (d) => { d.audit = sbaAuditDemo(b, 'Stall shifted', detail + (adjust ? ' · differential ' + adjust.no : cn ? ' · credit note ' + cn.no : '')); sbdEmail('shift', b.company, subject, detail); });
  closeModal(); sbaRefresh(id);
  toast('Stall shifted ' + old.name + ' → ' + cand.name + (adjust ? ' · differential ' + sbpFmt(adjust.amount, cur) + ' raised' : cn ? ' · credit note ' + sbpFmt(cn.amount, cur) + ' issued' : '') + '.', 'success');
}

/* ---------------- Reserve a stall for a company (admin-side cart) ---------------- */
function sbaReserveOpen() {
  window.__sbaRes = { company: 'live:' + SB_EXHIBITORS[0].id, hall: 'A', name: '', scheme: 'shell', mezz: 0, cur: '' };
  const companies = SB_EXHIBITORS.map((p) => ['live:' + p.id, p.company + ' (' + p.regNo + ') · exhibitor portal · ' + (p.origin === 'international' ? 'USD' : 'INR')])
    .concat(SB_DEMO_POOL.map((c) => [c.id, c.company + (c.regNo ? ' (' + c.regNo + ')' : '') + (c.origin === 'international' ? ' · USD' : '')]));
  openModal('Reserve a Stall for a Company',
    '<p style="margin:0 0 10px;font-size:0.8rem;color:var(--muted)">Same model as the exhibitor’s cart: the stall is blocked for ' + sbpHoldDays() + ' days, the proforma invoice is generated and e-mailed, and the company pays 100% online (from its portal) or offline (you can mark it received). On payment the stall is allotted automatically.</p>' +
    '<div class="form-grid">' +
      '<div class="field full"><label>Exhibiting company <span class="req">*</span></label><select id="rsCompany" onchange="window.__sbaRes.company=this.value;sbaReserveRefresh()">' + companies.map((c) => '<option value="' + esc(c[0]) + '">' + esc(c[1]) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Hall / zone</label><select id="rsHall" onchange="window.__sbaRes.hall=this.value;window.__sbaRes.name=\'\';sbaReserveRefresh()">' + SBD_ZONES.map((z) => '<option value="' + z + '">' + sbdZoneLabel(z) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Stall (available only) <span class="req">*</span></label><select id="rsStall" onchange="window.__sbaRes.name=this.value;sbaReserveRefresh()"></select><div class="error"></div></div>' +
      '<div class="field"><label>Scheme</label><select id="rsScheme" onchange="window.__sbaRes.scheme=this.value;sbaReserveRefresh()"></select></div>' +
      '<div class="field"><label>Mezzanine area (sq.m)</label><input type="number" id="rsMezz" min="0" value="0" oninput="window.__sbaRes.mezz=Number(this.value)||0;sbaReserveRefresh()"><div class="hint" id="rsMezzHint"></div><div class="error"></div></div>' +
      '<div class="field"><label>Bill in</label><select id="rsCur" onchange="window.__sbaRes.cur=this.value;sbaReserveRefresh()"><option value="">Default for the company (INR for Indian, USD for foreign)</option><option value="INR">INR — Indian participant rates</option><option value="USD">USD — foreign participant rates</option></select><div class="hint">A USD invoice can still be paid in INR at the settlement rate (₹' + sbpFxRate() + ' per USD).</div></div>' +
    '</div><div id="rsPreview"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sbaReserveCreate()"><span class="material-symbols-outlined">add_shopping_cart</span>Reserve &amp; E-mail PI</button>');
  sbaReserveRefresh();
}
/* registration fee is adjusted once per company — on its earliest live application */
const sbaLiveProfile = (companyId) => (String(companyId).indexOf('live:') === 0 ? sbExhibitorById(companyId.slice(5)) : null);
function sbaCreditFor(companyId) {
  const p = sbaLiveProfile(companyId);
  if (p) { const ex = sbPortalState(p) || {}; return !((ex.spaceBooking && ex.spaceBooking.reservations) || []).some((r) => SBD_HOLDING.includes(r.status) && r.pricing && r.pricing.credit > 0); }
  const comp = SB_COMPANIES.find((c) => c.id === companyId);
  return !sbdBookings().some((x) => x.company === comp.company && SBD_HOLDING.includes(x.status) && x.pricing && x.pricing.credit > 0);
}
function sbaReserveRefresh() {
  const st = window.__sbaRes;
  const comp = sbaLiveProfile(st.company) || SB_COMPANIES.find((c) => c.id === st.company);
  const cur = st.cur || (comp.origin === 'international' ? 'USD' : 'INR');
  const opts = sbaStallOptions(null, st.hall);
  $('rsStall').innerHTML = '<option value="">— select —</option>' + opts.map((x) => '<option value="' + x.name + '"' + (x.name === st.name ? ' selected' : '') + '>' + x.name + ' · ' + x.sqm + ' sq.m · ' + x.sides + ' open</option>').join('');
  const isCh = st.hall === 'CH';
  const schemes = isCh ? [['chalet1', 'Single Storey'], ['chalet2', 'Double Storey']] : [['shell', 'Shell'], ['raw', 'Raw']];
  if (!schemes.some((x) => x[0] === st.scheme)) st.scheme = schemes[0][0];
  $('rsScheme').innerHTML = schemes.map((x) => '<option value="' + x[0] + '"' + (x[0] === st.scheme ? ' selected' : '') + '>' + x[1] + '</option>').join('');
  const master = st.name ? sbStallMaster(st.hall, st.name) : null;
  const cand = master ? Object.assign({}, master, { scheme: st.scheme, mezzSqm: st.mezz }) : null;
  const eligible = cand && sbpMezzEligible(cand);
  $('rsMezz').disabled = !eligible;
  $('rsMezzHint').textContent = cand ? (eligible ? 'up to ' + sbpMezzMax(cand) + ' sq.m (' + Math.round(sbpConfig().mezz.maxPct * 100) + '% of ' + cand.sqm + ' sq.m) at ' + sbpFmt(sbpConfig().mezz[sbpRateKey(cur)], cur) + ' per sq.m' : 'mezzanine not eligible on this stall / scheme') : 'select a stall first';
  if (!cand) { $('rsPreview').innerHTML = ''; return; }
  const p = sbpPrice([cand], { currency: cur, withCredit: sbaCreditFor(st.company) });
  const l = p.lines[0];
  $('rsPreview').innerHTML = '<div class="sb-gw" style="margin-top:12px">' +
    '<div class="sb-gw-sum"><span>' + (l.chalet ? 'Chalet (flat)' : 'Space rental · ' + l.sqm + ' sq.m × ' + sbpFmt(l.rate, cur)) + '</span><b>' + sbpFmt(l.base, cur) + '</b></div>' +
    (l.side ? '<div class="sb-gw-sum"><span>Corner stall fee +' + Math.round(l.sidePct * 100) + '%</span><b>' + sbpFmt(l.side, cur) + '</b></div>' : '') +
    (l.mezz ? '<div class="sb-gw-sum"><span>Mezzanine · ' + l.mezzSqm + ' sq.m × ' + sbpFmt(l.mezzRate, cur) + '</span><b>' + sbpFmt(l.mezz, cur) + '</b></div>' : '') +
    '<div class="sb-gw-sum"><span>GST ' + Math.round(p.gstPct * 100) + '%</span><b>' + sbpFmt(p.gst, cur) + '</b></div>' +
    (p.credit ? '<div class="sb-gw-sum"><span>Registration fee adjusted</span><b>− ' + sbpFmt(p.credit, cur) + '</b></div>' : '') +
    '<div class="sb-gw-sum total"><span>Net payable (100%) · billed in ' + cur + '</span><b>' + sbpFmt(p.payable, cur) + '</b></div></div>';
}
function sbaReserveCreate() {
  const st = window.__sbaRes;
  clearErrs();
  if (!st.name) { setErr('rsStall', 'Select an available stall'); return; }
  if (sbdInventory()[st.hall + '|' + st.name]) { setErr('rsStall', 'That stall is no longer available'); return; }
  const master = sbStallMaster(st.hall, st.name);
  const cand = Object.assign({}, master, { scheme: st.scheme, mezzSqm: 0 });
  cand.mezzSqm = sbpMezzEligible(cand) ? Math.min(Math.max(0, Math.floor(st.mezz)), sbpMezzMax(cand)) : 0;
  const nowIso = new Date().toISOString();
  const holdUntil = sbpHoldUntil(Date.now());
  let piNo, no, id;
  const lp = sbaLiveProfile(st.company);
  if (lp) {
    let ex = sbdLoadKey(lp);
    if (!ex) { toast(lp.company + ' has not opened its portal yet — log in once as that company (index.html) so its workspace exists, then reserve.', 'error'); return; }
    if (!ex.spaceBooking) ex.spaceBooking = { reservations: [], clearSeq: 0 };
    if (!ex.spaceBooking.reservations) ex.spaceBooking.reservations = [];
    ex.seq.pi = (ex.seq.pi || 0) + 1;
    const withCredit = !ex.spaceBooking.reservations.some((r) => SBD_HOLDING.includes(r.status) && r.pricing && r.pricing.credit > 0);
    const curL = st.cur || (lp.origin === 'international' ? 'USD' : 'INR');
    const pricing = sbpPrice([cand], { currency: curL, withCredit: withCredit });
    piNo = 'PI-AI27-' + String(ex.seq.pi).padStart(4, '0'); no = '#' + String(10000000 + Math.floor(Math.random() * 89999999)); id = 'sbr_' + Date.now() + '_a';
    const r = { id: id, no: no, piNo: piNo, piRev: 0, type: cand.hall === 'CH' ? 'Chalet' : 'Pre-defined Space', stalls: [cand], pricing: pricing, amount: pricing.payable, status: 'reserved', source: 'admin',
      createdAt: nowStr(), createdAtIso: nowIso, holdUntil: holdUntil, extensions: [], reminders: {}, payment: null, audit: [] };
    sbpAudit(r, SBD_ADMIN, 'Application created by DEO', 'Stall ' + cand.name + ' (' + sbdZoneLabel(cand.hall) + ') reserved for ' + exCompany(ex) + ' · ' + sbdSchemeLabel(cand.scheme) + ' · ' + cand.sqm + ' sq.m' + (cand.mezzSqm ? ' + ' + cand.mezzSqm + ' sq.m mezzanine' : '') + ' · ' + piNo + ' · valid till ' + sbpDate(holdUntil));
    sbpAudit(r, SBD_ADMIN, 'Proforma invoice e-mailed', piNo + ' sent to the exhibitor');
    ex.spaceBooking.reservations.unshift(r);
    if (!ex.seq.cart) ex.seq.cart = 0; ex.seq.cart += 1;
    (ex.cart = ex.cart || []).push({ id: 'cart_' + ex.seq.cart, type: 'space', refId: id, currency: curL, label: 'Stall ' + cand.name + ' · ' + sbdZoneLabel(cand.hall) + ' — Application ' + no, sub: piNo + ' · valid till ' + sbpDate(holdUntil), amount: pricing.payable });
    sbdNotifyEx(ex, 'add_business', 'var(--blue)', 'DEO reserved stall ' + cand.name + ' (' + sbdZoneLabel(cand.hall) + ') for ' + exCompany(ex) + ' — application ' + no + ', ' + sbpFmt(pricing.payable, curL) + ' payable by ' + sbpDate(holdUntil) + '. The proforma invoice ' + piNo + ' has been e-mailed; open the application to pay.');
    sbdEmail('reserved', exCompany(ex), 'Proforma invoice ' + piNo + ' — stall ' + cand.name + ' reserved by DEO till ' + sbpDate(holdUntil), 'Application ' + no + ' · ' + sbpFmt(pricing.payable, curL) + ' payable within ' + sbpHoldDays() + ' days', ex);
    sbdSaveKey(ex);
  } else {
    const comp = SB_COMPANIES.find((c) => c.id === st.company);
    const cur = st.cur || (comp.origin === 'international' ? 'USD' : 'INR');
    const pricing = sbpPrice([cand], { currency: cur, withCredit: sbaCreditFor(st.company) });
    const created = (sbDemoStore().__created || []).length;
    piNo = 'PI-AI27-' + String(9001 + created); no = '#' + String(10000000 + (sbHash(piNo + Date.now()) % 89999999)); id = 'sbd_' + cand.name + '_' + Date.now();
    sbDemoCreate({ id: id, no: no, piNo: piNo, piRev: 0, company: comp.company, regNo: comp.regNo || '', origin: comp.origin, exId: comp.id, type: cand.hall === 'CH' ? 'Chalet' : 'Pre-defined Space', stalls: [cand],
      status: 'reserved', createdAtIso: nowIso, holdUntil: holdUntil, pausedAt: null, extensions: [], payment: null, paidAtIso: '', orderNo: '', remark: '', reservedBy: SBD_ADMIN, billCurrency: cur,
      audit: [{ at: nowStr(), by: SBD_ADMIN, event: 'Application created by DEO', detail: 'Stall ' + cand.name + ' reserved for ' + comp.company + ' · ' + sbdSchemeLabel(cand.scheme) + ' · ' + cand.sqm + ' sq.m' + (cand.mezzSqm ? ' + ' + cand.mezzSqm + ' mezz.' : '') + ' · valid till ' + sbpDate(holdUntil) },
        { at: nowStr(), by: SBD_ADMIN, event: 'Proforma invoice e-mailed', detail: piNo }] });
    sbdEmail('reserved', comp.company, 'Proforma invoice ' + piNo + ' — stall ' + cand.name + ' reserved by DEO till ' + sbpDate(holdUntil), sbpFmt(pricing.payable, cur) + ' payable within ' + sbpHoldDays() + ' days');
  }
  closeModal(); render(); sbaOpen(id);
  toast('Stall ' + cand.name + ' reserved — proforma invoice ' + piNo + ' e-mailed to the company.', 'success');
}
