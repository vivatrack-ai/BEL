/* ============================================================
   Evenuefy Admin — Space Reservations, Booking Dashboard &
   Transaction Dashboard (AERO-245 · cart-based reservation)
   Data = live reservations raised from the exhibitor portal
   (Book Space → Reserve & Add to Cart → 100% payment within 21
   days) + a deterministic demo book of reservations built from the
   real exhibitor list, so the dashboards read like a running event.
   Rates, stall sizes, halls and the 21-day validity mirror the
   exhibitor-side flow. One reservation = one payable amount = one
   payment (online gateway or offline NEFT / RTGS / Cheque / SWIFT).
   ============================================================ */

'use strict';

const SBD_HALLS = ['A', 'B', 'C', 'D', 'E'];
const SBD_RATE = { 108: { shell: 125000, raw: 250000 }, 54: { shell: 65000, raw: 130000 }, 36: { shell: 45000, raw: 90000 } };
const SBD_SIZE = { 108: '12X9', 54: '9X6', 36: '6X6' };
/* payment channels — online = payment gateway, offline = bank transfer /
   instrument reconciled by DEO's finance team against the proforma invoice */
const SBD_PAY = {
  national: { online: ['Card', 'Net Banking', 'UPI'], offline: ['NEFT', 'RTGS', 'Cheque / DD'] },
  international: { online: ['International Card'], offline: ['SWIFT (Wire Transfer)'] },
};
const SBD_METHODS = ['Card', 'Net Banking', 'UPI', 'International Card', 'NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)'];
const SBD_OFFLINE = ['NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)', 'NEFT / RTGS', 'Wire Transfer (SWIFT)'];
const sbdMode = (m) => (SBD_OFFLINE.includes(m) ? 'offline' : 'online');
/* exhibitor origin from the registered phone's country code (+91 = India) */
const sbdOrigin = (phone) => (phone && !/^\+?91/.test(String(phone).replace(/\s/g, '')) ? 'international' : 'national');
/* International exhibitors are billed in USD — tariff converted at the
   organiser's fixed event rate; mixed national + international totals
   stay in INR. */
const SBD_USD_RATE = 88;
const sbdUsd = (inr) => '$' + (inr / SBD_USD_RATE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sbdAmt = (inr, origin) => (origin === 'international' ? sbdUsd(inr) : money(inr));
function sbdUsdCompact(inr) {
  const v = inr / SBD_USD_RATE;
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e4) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const sbdCompactBy = (inr, origin) => (origin === 'international' ? sbdUsdCompact(inr) : sbdCompact(inr));
const sbdAmtXls = (inr, origin) => (origin === 'international' ? Math.round((inr / SBD_USD_RATE) * 100) / 100 : inr);
function sbdPickMethod(origin, h, i) {
  const p = SBD_PAY[origin];
  const mode = ((h >>> (i * 3 + 1)) % 10) < 7 ? 'online' : 'offline'; // ≈70% pay online
  return p[mode][(h >>> (i * 3)) % p[mode].length];
}
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
/* status → [pill class, label, chart colour] */
const SBD_STATUS = {
  reserved: ['amber', 'Reserved · In Cart', '#C98514'],
  payment_under_verification: ['blue', 'Payment Under Verification', '#2F62D8'],
  confirmed: ['green', 'Confirmed', '#1E8E5A'],
  expired: ['gray', 'Expired', '#8A93A5'],
  released: ['red', 'Released', '#C6432E'],
};
const SBD_HOLDING = ['reserved', 'payment_under_verification', 'confirmed']; // statuses that block inventory
const SBD_ADMIN = 'DEO Admin';

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

/* organiser actions on demo reservations are stored as overrides (live
   ones are written straight into the exhibitor state) */
const SBD_DEC_KEY = 'evenuefy_sbd_reservations_v2';
function sbdDecisions() { try { return JSON.parse(localStorage.getItem(SBD_DEC_KEY)) || {}; } catch (e) { return {}; } }
function sbdSaveDecision(id, d) { const all = sbdDecisions(); all[id] = d; try { localStorage.setItem(SBD_DEC_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } }

/* exhibitor-side notification (bell) written from the admin */
function sbdNotifyEx(ex, icon, color, text) {
  if (!ex.notifications) ex.notifications = [];
  ex.notifications.unshift({ id: 'nt_' + Date.now() + '_' + Math.floor(Math.random() * 1e4), icon: icon, color: color, text: text, time: nowStr(), read: false });
}

/* live reservations past their validity → expired (same rule the
   exhibitor portal applies on every render) */
function sbdSettleLive(ex) {
  const now = Date.now();
  let changed = false;
  ((ex.spaceBooking && ex.spaceBooking.reservations) || []).forEach((r) => {
    if (r.status !== 'reserved' || new Date(r.holdUntil).getTime() >= now) return;
    r.status = 'expired'; r.expiredAt = nowStr(); r.expiredAtIso = new Date().toISOString();
    ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbdNotifyEx(ex, 'timer_off', 'var(--red)', 'Reservation ' + r.piNo + ' (' + r.stalls.map((s) => s.name).join(', ') + ') expired on ' + sbpDate(r.holdUntil) + ' — the stalls have been released.');
    changed = true;
  });
  if (changed) saveExState(ex);
}

/* ---------------- unified reservation book ---------------- */
function sbdBookings() {
  const out = [];
  const ex = loadExState() || {};
  if (ex.spaceBooking) sbdSettleLive(ex);
  const taken = {};
  const now = Date.now();

  /* 1 · live reservations from the exhibitor portal */
  ((ex.spaceBooking && ex.spaceBooking.reservations) || []).forEach((r) => {
    if (SBD_HOLDING.includes(r.status)) r.stalls.forEach((s) => { taken[s.hall + '|' + s.name] = true; });
    out.push({ id: r.id, no: r.no, piNo: r.piNo, company: EX_COMPANY, regNo: 'EXHC00001', origin: 'national', source: 'live',
      stalls: r.stalls.map((s) => ({ hall: s.hall, name: s.name, sqm: s.sqm, size: s.size, scheme: s.scheme, price: s.price, sides: s.sides })),
      status: r.status, createdAt: (r.createdAtIso ? new Date(r.createdAtIso) : parseTs(r.createdAt)) || new Date(),
      holdUntil: r.holdUntil, pausedAt: r.pausedAt || null, extensions: r.extensions || [],
      payment: r.payment || null, paidAt: r.paidAtIso ? new Date(r.paidAtIso) : (r.paidAt ? parseTs(r.paidAt) : null),
      orderNo: r.orderNo || '', remark: r.remark || '', expiredAt: r.expiredAt || '', releasedAt: r.releasedAt || '',
      pricing: r.pricing || sbpPrice(r.stalls, false) });
  });

  /* 2 · deterministic demo reservations (≈70% of inventory) */
  const exs = (window.ADMIN_DATA && ADMIN_DATA.exhibitors) || [];
  let k = 0;
  const demo = (zone, name, h, seedBooked, seedReserved, stall, price, company) => {
    const r = (h >>> 4) % 10;
    const status = seedBooked ? 'confirmed' : seedReserved ? 'reserved'
      : r < 2 ? 'reserved' : r === 2 ? 'payment_under_verification' : r === 3 ? 'expired' : 'confirmed';
    /* age in days: carts still open are < 21 days old, expired ones older */
    const age = status === 'reserved' ? 1 + (h % 18) : status === 'payment_under_verification' ? 4 + (h % 15) : status === 'expired' ? 24 + (h % 16) : 3 + (h % 27);
    const createdAt = sbdDaysAgo(age, h);
    const origin = sbdOrigin(company.phone);
    const method = sbdPickMethod(origin, h, 0);
    const mode = sbdMode(method);
    let payment = null, paidAt = null, pausedAt = null;
    if (status === 'confirmed') {
      let ago = age - 1 - ((h >>> 2) % Math.max(1, Math.min(age - 1, 12)));
      if (ago < 1) ago = 1 + ((h >>> 5) % 6);            // spread recent payments, no false spike on today
      paidAt = sbdDaysAgo(ago, h >>> 1);
      payment = { mode: mode, method: method, txn: 'TXN' + String(sbdHash(name + 'p')).slice(0, 9),
        ref: mode === 'offline' ? 'UTR' + String(sbdHash(name + 'u')).slice(0, 12) : '', verifiedBy: mode === 'offline' ? SBD_ADMIN : '' };
    } else if (status === 'payment_under_verification') {
      const m = SBD_PAY[origin].offline[h % SBD_PAY[origin].offline.length];
      const sub = sbdDaysAgo(Math.max(1, age - 2 - (h % 3)), h >>> 3);
      payment = { mode: 'offline', method: m, ref: 'UTR' + String(sbdHash(name + 'u')).slice(0, 12), date: sub.toISOString().slice(0, 10),
        amount: 0, fileName: 'payment-advice-' + name.toLowerCase().replace('.', '-') + '.pdf', submittedAt: sbdFmt(sub), submittedAtIso: sub.toISOString() };
      pausedAt = sub.toISOString();
    }
    const b = { id: 'sbd_' + name, no: '#' + String(40000000 + (h % 59999999)), piNo: 'PI-AI27-' + String(1000 + (h % 8999)), company: company.company, regNo: company.regNo || '',
      origin: origin, exId: company.id, source: 'demo', stalls: [stall], status: status, createdAt: createdAt,
      holdUntil: sbpHoldUntil(createdAt.getTime(), SBP_HOLD_DAYS), pausedAt: pausedAt, extensions: [], payment: payment, paidAt: paidAt,
      orderNo: status === 'confirmed' ? 'ORD-2027-' + String(1000 + (h % 8999)) : '', remark: '' };
    if (status === 'expired') b.expiredAt = sbpDateTime(b.holdUntil);
    out.push(b);
    k++;
  };
  SBD_HALLS.forEach((hall, hi) => {
    for (let n = 1; n <= SBD_STALLS_PER_HALL; n++) {
      const name = hall + '8.' + n;
      const h = sbdHash('sbd' + name);
      const seedBooked = (n + hi) % 4 === 0;                              // same stalls the exhibitor floor plan shows as Booked
      const seedReserved = !seedBooked && (n * 3 + hi) % 7 === 0;         // …and as Reserved (another exhibitor's cart)
      if (taken[hall + '|' + name] || !(seedBooked || seedReserved || h % 10 < 6) || !exs.length) continue;
      const sqm = n <= 4 ? 108 : n <= 8 ? 54 : 36;
      const scheme = h % 3 === 0 ? 'raw' : 'shell';
      const price = SBD_RATE[sqm][scheme];
      demo(hall, name, h, seedBooked, seedReserved, { hall: hall, name: name, sqm: sqm, size: SBD_SIZE[sqm], scheme: scheme, price: price, sides: n % 2 ? '2 Sides' : '1 Side' },
        price, exs[(k * 7 + hi) % exs.length]);
    }
  });
  for (let n = 1; n <= SBD_CHALETS; n++) {
    const name = 'CH-' + String(n).padStart(2, '0');
    const h = sbdHash('sbd' + name);
    const seedBooked = n % 4 === 0;                                       // same chalets the exhibitor layout shows as Booked
    const seedReserved = n === 7;
    if (taken['CH|' + name] || !(seedBooked || seedReserved || h % 10 < 6) || !exs.length) continue;
    const scheme = h % 2 === 0 ? 'chalet2' : 'chalet1';
    const price = SBD_CHALET_RATE[scheme];
    demo('CH', name, h, seedBooked, seedReserved, { hall: 'CH', name: name, sqm: 100, size: '10X10', scheme: scheme, price: price, sides: '4 Sides' },
      price, exs[(k * 7 + 5) % exs.length]);
  }

  /* organiser overrides on demo reservations (extend / verify / reject / release / simulate expiry) */
  const dec = sbdDecisions();
  out.forEach((b) => {
    const d = b.source === 'demo' && dec[b.id];
    if (!d) return;
    Object.assign(b, d);
    if (d.paidAtIso) b.paidAt = new Date(d.paidAtIso);
    if (b.status === 'reserved' && new Date(b.holdUntil).getTime() < now) { b.status = 'expired'; b.expiredAt = sbpDateTime(b.holdUntil); }
  });
  /* order pricing (space-pricing.js): corner charges + GST 18%, registration
     amount adjusted once per exhibitor on its earliest live reservation */
  const firstLive = {};
  out.filter((b) => b.source === 'demo').sort((a, b) => a.createdAt - b.createdAt).forEach((b) => {
    if (SBD_HOLDING.includes(b.status) && !firstLive[b.company]) firstLive[b.company] = b.id;
  });
  out.forEach((b) => {
    if (b.source === 'demo') b.pricing = sbpPrice(b.stalls, firstLive[b.company] === b.id);
    b.value = b.pricing.grand;
    b.total = b.pricing.payable;
    if (b.payment && !b.payment.amount) b.payment.amount = b.total;
  });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

const sbdSqm = (b) => b.stalls.reduce((a, s) => a + s.sqm, 0);
const sbdPill = (st) => '<span class="pill ' + SBD_STATUS[st][0] + '">' + SBD_STATUS[st][1] + '</span>';
const sbdIsOpen = (b) => b.status === 'reserved' || b.status === 'payment_under_verification'; // validity still matters
/* validity clock for one reservation */
function sbdHold(b) {
  if (b.status === 'payment_under_verification') return { left: sbpDaysLeft(b.holdUntil, new Date(b.pausedAt || Date.now()).getTime()), paused: true, cls: '', text: 'Clock paused' };
  const left = sbpDaysLeft(b.holdUntil);
  if (b.status !== 'reserved') return { left: left, paused: false, cls: '', text: '' };
  return { left: left, paused: false, cls: left <= 1 ? 'late' : left <= 7 ? 'warn' : '',
    text: left <= 0 ? 'Expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left' };
}
function sbdHoldCell(b) {
  if (b.status === 'confirmed') return '<span class="sba-hold"><b style="color:var(--green)">Paid</b><small>' + (b.paidAt ? sbaDate(b.paidAt) : '—') + '</small></span>';
  if (b.status === 'expired') return '<span class="sba-hold late"><b>Expired</b><small>' + sbpDate(b.holdUntil) + '</small></span>';
  if (b.status === 'released') return '<span class="sba-hold"><b style="color:var(--muted)">Released</b><small>' + esc(b.releasedAt || '') + '</small></span>';
  const h = sbdHold(b);
  return '<span class="sba-hold ' + h.cls + '"><b>' + (h.paused ? '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">pause_circle</span> ' + h.text : h.text) + '</b>' +
    '<small>till ' + sbpDate(b.holdUntil) + (b.extensions && b.extensions.length ? ' · extended' : '') + '</small></span>';
}

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
  const active = all.filter((b) => SBD_HOLDING.includes(b.status)); // inventory currently held
  const bookedSqm = active.reduce((a, b) => a + sbdSqm(b), 0);
  const capacity = SBDF.hall ? sbdZoneSqm(SBDF.hall) : SBD_CAPACITY_SQM;
  const occ = Math.round((bookedSqm / capacity) * 100);
  const soon = all.filter((b) => b.status === 'reserved' && sbpDaysLeft(b.holdUntil) <= 7);

  /* hall-wise occupancy — stacked by status, counted in stalls */
  const halls = SBDF.hall ? [SBDF.hall] : SBD_ZONES;
  const hallRows = halls.map((h) => {
    const seg = { confirmed: 0, payment_under_verification: 0, reserved: 0 };
    all.forEach((b) => { if (seg[b.status] != null) b.stalls.forEach((s) => { if (s.hall === h) seg[b.status]++; }); });
    const used = seg.confirmed + seg.payment_under_verification + seg.reserved;
    const units = sbdZoneUnits(h);
    const unit = h === 'CH' ? 'chalet(s)' : 'stall(s)';
    const avail = Math.max(0, units - used);
    const part = (k, n) => n ? '<i style="flex:' + n + ';background:' + (k === 'available' ? '#E3E8F1' : SBD_STATUS[k][2]) + '" title="' + sbdZoneLabel(h) + ' · ' +
      (k === 'available' ? 'Available' : SBD_STATUS[k][1]) + ': ' + n + ' ' + unit + '"></i>' : '';
    return '<div class="occ-row"><b>' + sbdZoneLabel(h) + '</b>' +
      '<div class="stack-bar">' + part('confirmed', seg.confirmed) + part('payment_under_verification', seg.payment_under_verification) + part('reserved', seg.reserved) + part('available', avail) + '</div>' +
      '<span class="occ-val">' + used + ' / ' + units + ' held</span></div>';
  }).join('');

  const schemeRows = SBD_SCHEMES.map(([sc, lbl]) => {
    const st = active.flatMap((b) => b.stalls).filter((s) => s.scheme === sc);
    return [sc.startsWith('chalet') ? lbl : lbl + ' Space', st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  /* same size buckets as the Space Requirement dashboard, counted on held units */
  const bookedUnits = active.flatMap((b) => b.stalls);
  const sizeRows = SIZE_BUCKETS.map((bk) => {
    const st = bookedUnits.filter((s) => bk.test(s.sqm));
    return [bk.label, st.length, st.reduce((a, s) => a + s.sqm, 0).toLocaleString('en-IN') + ' sqm'];
  });
  const statusRows = Object.keys(SBD_STATUS).map((k) => [SBD_STATUS[k][1], by(k).length, '', SBD_STATUS[k][2]]);

  /* held area (sq.m) split by space type — Shell · Raw · Chalet */
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
    const sub = t === 'chalet'
      ? ' · ' + bookedSt.filter((s) => s.scheme === 'chalet1').length + ' × 1 Floor, ' + bookedSt.filter((s) => s.scheme === 'chalet2').length + ' × 2 Floor'
      : '';
    return '<div class="area-blk"><span class="area-k"><i style="background:' + col + '"></i>' + lbl + '</span>' +
      '<b class="area-v">' + fmtSq(sq) + ' <small>sq.m</small></b>' +
      '<span class="area-s">' + n + ' unit(s)' + sub + ' · ' + share + '% of held area</span></div>';
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
      '<span class="result-count">Confirmed + Reserved · ' + fmtSq(areaTotal) + ' sq.m held</span></div>' +
    '<div class="area-blks">' + areaBlocks + '</div>' + areaBar +
    '<div class="tablewrap" style="margin-top:16px"><table class="grid"><tr><th>Hall / Zone</th><th class="num">Shell (sq.m)</th><th class="num">Raw (sq.m)</th>' +
      '<th class="num">Chalet (sq.m)</th><th class="num">Total Held</th><th class="num">Capacity</th><th class="num">Occupancy</th></tr>' + areaRows + areaFoot + '</table></div></div>';

  const valueOf = (list, o) => list.filter((b) => (b.origin || 'national') === o).reduce((a, b) => a + b.total, 0);
  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Dashboard</h1>' +
      '<p class="page-sub" style="margin-bottom:0">Stall &amp; chalet reservations made from Book Space — carts valid for ' + SBP_HOLD_DAYS + ' days, confirmed on 100% payment — and hall occupancy.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile"><div class="t-label">Reserved (In Cart)</div><div class="t-value">' + by('reserved').length + '</div>' +
        '<div class="t-sub">' + (soon.length ? soon.length + ' expiring within 7 days' : 'none expiring within 7 days') + '</div></div>' +
      '<div class="tile blue"><div class="t-label">Payment Under Verification</div><div class="t-value">' + by('payment_under_verification').length + '</div><div class="t-sub">offline proofs awaiting DEO</div></div>' +
      '<div class="tile accent"><div class="t-label">Confirmed</div><div class="t-value">' + by('confirmed').length + '</div><div class="t-sub">100% paid</div></div>' +
      '<div class="tile"><div class="t-label">Expired</div><div class="t-value">' + by('expired').length + '</div><div class="t-sub">' + by('released').length + ' released</div></div>' +
    '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><div class="t-label">Held Area</div><div class="t-value">' + bookedSqm.toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + capacity.toLocaleString('en-IN') + ' sqm</span></div>' +
        '<div class="t-sub">Shell ' + fmtSq(sqmOf(bookedSt, 'shell')) + ' · Raw ' + fmtSq(sqmOf(bookedSt, 'raw')) + ' · Chalet ' + fmtSq(sqmOf(bookedSt, 'chalet')) + ' sq.m</div></div>' +
      '<div class="tile"><div class="t-label">Occupancy</div><div class="t-value">' + occ + '%</div>' +
        '<div class="prog-bar" style="margin-top:6px" title="' + occ + '% of capacity held"><i style="width:' + occ + '%"></i></div></div>' +
      '<div class="tile accent"><div class="t-label">Booking Value (Confirmed + Reserved)</div>' +
        '<div class="t-cur"><span class="cur-tag">INR</span><b>' + sbdCompact(valueOf(active, 'national')) + '</b></div>' +
        '<div class="t-cur"><span class="cur-tag usd">USD</span><b>' + sbdUsd(valueOf(active, 'international')) + '</b></div>' +
        '<div class="t-sub">incl. ' + sbdCompact(valueOf(by('payment_under_verification'), 'national')) + ' under verification</div></div>' +
    '</div>' +
    areaCard +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Hall &amp; Chalet Occupancy</h2>' + sbdLegend(['confirmed', 'payment_under_verification', 'reserved', 'available']) + '</div>' +
      hallRows + '</div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Held Units by Space Type</h2>' + sbdBarRows(schemeRows, (v) => v + ' units') + '</div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">By Size (Shell · Raw · Chalet)</h2>' + sbdBarRows(sizeRows, (v) => String(v)) + '</div>' +
    '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Reservations by Status</h2>' + sbdBarRows(statusRows, (v) => String(v)) + '</div>' +
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

/* one payment per confirmed reservation */
function sbdTransactions(bookings) {
  const tx = [];
  bookings.forEach((b) => {
    if (b.status !== 'confirmed' || !b.paidAt) return;
    const pm = b.payment || { mode: 'online', method: 'Card' };
    const method = pm.method || 'Card';
    tx.push({ txn: pm.txn || b.orderNo || pm.ref || ('TXN' + String(sbdHash(b.id)).slice(0, 9)), at: b.paidAt, no: b.piNo, company: b.company, hall: b.stalls.map((x) => x.hall).join(', '),
      stalls: b.stalls.map((x) => x.name).join(', '), method: method, mode: pm.mode || sbdMode(method), ref: pm.ref || '', origin: b.origin || 'national', amount: b.total });
  });
  return tx.sort((a, b) => b.at - a.at);
}

function exportSbdTransactions(list) {
  exportWorkbook('Space-Booking-Transactions-' + exportStamp(), [{
    name: 'Transactions',
    headers: ['Txn ID', 'Paid At', 'Proforma Invoice', 'Exhibitor', 'National / International', 'Hall / Chalet Line', 'Stall / Chalet', 'Online / Offline', 'Method', 'Reference', 'Currency', 'Amount', 'Amount (INR equiv.)', 'Status'],
    rows: list.map((t) => [t.txn, sbdFmt(t.at), t.no, t.company, SBDT_ORIGIN[t.origin], t.hall.split(', ').map(sbdZoneLabel).join(', '), t.stalls, SBDT_MODE[t.mode], t.method, t.ref || '-', t.origin === 'international' ? 'USD' : 'INR', sbdAmtXls(t.amount, t.origin), t.amount, 'Success']),
  }]);
}

function viewBookingTransactions() {
  const books = sbdFilter(sbdBookings()).filter((b) => SBD_HOLDING.includes(b.status));
  const soonMs = Date.now() + 7 * 864e5;

  let tx = sbdTransactions(books);
  const allTx = tx;

  /* headline figures per billing currency — INR (national) and USD
     (international) are never added together in a tile */
  const cur = (o) => {
    const bk = books.filter((b) => (b.origin || 'national') === o);
    const val = bk.reduce((a, b) => a + b.total, 0);
    const col = bk.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.total, 0);
    const verif = bk.filter((b) => b.status === 'payment_under_verification').reduce((a, b) => a + b.total, 0);
    const expiring = bk.filter((b) => b.status === 'reserved' && new Date(b.holdUntil).getTime() <= soonMs).reduce((a, b) => a + b.total, 0);
    return { value: val, collected: col, outstanding: val - col, verifying: verif, expiring: expiring, tx: allTx.filter((t) => t.origin === o).length };
  };
  const INR = cur('national');
  const USD = cur('international');
  const curTile = (label, k, cls, sub) => '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label + '</div>' +
    '<div class="t-cur"><span class="cur-tag">INR</span><b>' + sbdCompact(INR[k]) + '</b></div>' +
    '<div class="t-cur"><span class="cur-tag usd">USD</span><b>' + sbdUsd(USD[k]) + '</b></div>' + (sub ? '<div class="t-sub">' + sub + '</div>' : '') + '</div>';

  /* ---- charts are single-currency: INR (national) or USD (international) ---- */
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
    ' · ' + cBooks.length + ' reservations · ' + cTx.length + ' payments</span>';

  /* status-wise value: confirmed / under verification / in cart */
  const stRows = ['confirmed', 'payment_under_verification', 'reserved'].map((k) => {
    const v = cBooks.filter((b) => b.status === k).reduce((a, b) => a + b.total, 0);
    const p = cValue ? Math.round((v / cValue) * 100) : 0;
    return '<div class="prog-row" title="' + SBD_STATUS[k][1] + ': ' + cAmt(v) + ' of ' + cAmt(cValue) + '">' +
      '<div class="pr-head"><span>' + SBD_STATUS[k][1] + ' <span style="color:var(--muted);font-weight:600">· ' + cBooks.filter((b) => b.status === k).length + ' reservation(s)</span></span>' +
      '<span>' + cFmt(v) + ' (' + p + '%)</span></div>' +
      '<div class="prog-bar"><i style="width:' + p + '%;background:' + SBD_STATUS[k][2] + '"></i></div></div>';
  }).join('');

  /* 14-day collection trend (single series → no legend; hover = exact value) */
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const perDay = days.map((d) => cTx.filter((t) => { const x = new Date(t.at); x.setHours(0, 0, 0, 0); return x.getTime() === d.getTime(); })
    .reduce((a, t) => a + t.amount, 0));
  const dMax = Math.max(...perDay, 1);
  const peak = perDay.indexOf(Math.max(...perDay));
  const trend = '<div class="col-chart">' + days.map((d, i) =>
    '<div class="col" title="' + sbdDay(d) + ': ' + cAmt(perDay[i]) + '">' +
      (i === peak && perDay[i] ? '<span class="col-lbl">' + cFmt(perDay[i]) + '</span>' : '') +
      '<i style="height:' + Math.max(perDay[i] ? 3 : 0, Math.round((perDay[i] / dMax) * 100)) + '%"></i>' +
      '<span class="col-x">' + (i % 2 === 0 ? sbdDay(d) : '') + '</span></div>').join('') + '</div>';

  /* National / International collections, each split Online / Offline */
  const sumTx = (f) => { const l = allTx.filter(f); return { amt: l.reduce((a, t) => a + t.amount, 0), n: l.length }; };
  const grandTx = sumTx(() => true);
  const splitBlock = (o) => {
    const tot = sumTx((t) => t.origin === o);
    const on = sumTx((t) => t.origin === o && t.mode === 'online');
    const off = sumTx((t) => t.origin === o && t.mode === 'offline');
    const pc = (x) => (tot.amt ? Math.round((x / tot.amt) * 100) : 0);
    const cur = (n) => sbdAmt(n, o);
    const line = (k, ic, v, cls) => '<div class="split-line ' + cls + '"><span><span class="material-symbols-outlined">' + ic + '</span>' + k + '</span>' +
      '<b>' + cur(v.amt) + '</b><small>' + v.n + ' txn' + (v.n === 1 ? '' : 's') + ' · ' + pc(v.amt) + '%</small></div>';
    return '<div class="split-blk">' +
      '<div class="split-h"><span class="material-symbols-outlined">' + (o === 'national' ? 'flag' : 'public') + '</span>' + SBDT_ORIGIN[o] +
        '<span class="split-share">' + tot.n + ' of ' + grandTx.n + ' payments</span></div>' +
      '<div class="split-total"><small>TOTAL' + (o === 'international' ? ' (USD)' : ' (INR)') + '</small><b>' + cur(tot.amt) + '</b><span>' + tot.n + ' payment' + (tot.n === 1 ? '' : 's') +
        (o === 'international' ? ' · ≈ ' + money(tot.amt) + ' @ ₹' + SBD_USD_RATE + '/$' : '') + '</span></div>' +
      '<div class="stack-bar split-bar" title="Online ' + cur(on.amt) + ' · Offline ' + cur(off.amt) + '">' +
        (on.amt ? '<i style="flex:' + on.amt + ';background:#2F62D8"></i>' : '') + (off.amt ? '<i style="flex:' + off.amt + ';background:#C98514"></i>' : '') +
        (!tot.amt ? '<i style="flex:1;background:#E3E8F1"></i>' : '') + '</div>' +
      line('Online · gateway', 'language', on, 'online') + line('Offline · NEFT / RTGS / Cheque / SWIFT', 'account_balance', off, 'offline') +
    '</div>';
  };
  const splitCard = '<div class="card"><div class="card-head-row"><h2 class="card-title">National &amp; International Collections</h2>' +
      '<div class="sbd-legend"><span><i style="background:#2F62D8"></i>Online</span><span><i style="background:#C98514"></i>Offline</span></div></div>' +
    '<div class="split-grid">' + splitBlock('national') + splitBlock('international') + '</div></div>';

  const cMethods = SBD_PAY[C].online.concat(SBD_PAY[C].offline);
  const methodRows = cMethods.map((m) => [m + (sbdMode(m) === 'offline' ? ' (Offline)' : ' (Online)'),
    cTx.filter((t) => t.method === m).reduce((a, t) => a + t.amount, 0), cTx.filter((t) => t.method === m).length + ' txns']);
  const hallRows = SBD_ZONES.filter((h) => !SBDF.hall || h === SBDF.hall).map((h) =>
    [ sbdZoneLabel(h), cTx.filter((t) => t.hall.split(', ').includes(h)).reduce((a, t) => a + t.amount, 0), '' ]);

  /* table filters */
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
    '<td><span class="regno">' + esc(t.no) + '</span></td><td class="td-strong">' + esc(t.company) + '</td>' +
    '<td><span class="pill ' + (t.origin === 'international' ? 'blue' : 'gray') + '">' + SBDT_ORIGIN[t.origin] + '</span></td>' +
    '<td>' + esc(t.hall.split(', ').map(sbdZoneLabel).join(', ')) + '<span class="td-sub">' + esc(t.stalls) + '</span></td>' +
    '<td><span class="mode-chip ' + t.mode + '"><span class="material-symbols-outlined">' + (t.mode === 'online' ? 'language' : 'account_balance') + '</span>' + SBDT_MODE[t.mode] + '</span>' +
      '<span class="td-sub">' + esc(t.method) + (t.ref ? ' · ' + esc(t.ref) : '') + '</span></td>' +
    '<td class="money">' + sbdAmt(t.amount, t.origin) + (t.origin === 'international' ? '<span class="td-sub">≈ ' + money(t.amount) + '</span>' : '') + '<span class="td-sub">100% · single payment</span></td>' +
    '<td><span class="pill green">Success</span></td></tr>').join('') ||
    '<tr><td colspan="9" style="color:var(--muted)">No payments for the selected filters.</td></tr>';

  return '<div class="card-head-row" style="margin-bottom:4px"><div><h1 class="page-title">Space Booking Transactions</h1>' +
      '<p class="page-sub" style="margin-bottom:0">One 100% payment per reservation — online through the gateway or offline (NEFT / RTGS / Cheque / SWIFT) verified by DEO against the proforma invoice.</p></div>' +
      sbdFilterBar() + '</div>' +
    '<div class="tiles" style="margin-top:16px">' +
      curTile('Total Booking Value', 'value', 'blue', 'confirmed + reserved carts') +
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
      '<div class="tablewrap"><table class="grid sbdt-table"><tr><th>Txn ID</th><th>Paid At</th><th>Proforma Invoice</th><th>Exhibitor</th><th>Exhibitor Type</th><th>Hall / Stall</th><th>Payment Mode</th><th>Amount</th><th>Status</th></tr>' +
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
   VIEW · Space Reservations — platform-style list of every stall /
   chalet reservation with its validity clock and payment state; the
   ⋯ menu / row click opens a detail drawer that holds the space
   specifications, payment summary, proof of payment and the DEO
   actions (extend validity · mark received · reject proof · release).
   ============================================================ */
const SBA = { q: '', type: '', status: '', dateMode: '', from: '', to: '', rows: 10, page: 1 };
const SBA_STATUS = {
  reserved: ['schedule', '#C98514', 'Reserved · In Cart', 'amber'],
  payment_under_verification: ['hourglass_top', '#2F62D8', 'Payment Under Verification', 'blue'],
  confirmed: ['check_circle', '#1E8E5A', 'Confirmed', 'green'],
  expired: ['timer_off', '#8A93A5', 'Expired', 'gray'],
  released: ['cancel', '#C6432E', 'Released', 'red'],
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

/* quick-action menu items for one reservation (shared by list + drawer) */
function sbaActionButtons(b, cls) {
  const btn = (fn, icon, label, danger) => '<button class="' + (cls || '') + (danger ? ' btn-danger-soft' : '') + '" onclick="' + fn + '(\'' + b.id + '\')"><span class="material-symbols-outlined">' + icon + '</span>' + label + '</button>';
  let out = '';
  if (b.status === 'payment_under_verification') out += btn('sbaMarkReceived', 'task_alt', 'Mark Payment Received') + btn('sbaRejectProof', 'rule', 'Reject Proof', true);
  if (sbdIsOpen(b)) out += btn('sbaExtend', 'more_time', 'Extend Validity') + btn('sbaRelease', 'lock_open', 'Release Now', true);
  if (b.status === 'reserved') out += btn('sbaSimulateExpiry', 'bug_report', 'Simulate Expiry (debug)');
  return out;
}

function viewSpaceReservations() {
  const every = sbdBookings();
  let list = every;
  if (SBA.type) list = list.filter((b) => sbaType(b) === SBA.type);
  if (SBA.status) list = list.filter((b) => b.status === SBA.status);
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
    return '<tr class="sba-row" onclick="sbaOpen(\'' + b.id + '\')">' +
      '<td><span class="regno">' + esc(b.piNo) + '</span><span class="td-sub"><i class="sba-no">' + esc(b.no.replace('#', '')) + '</i></span></td>' +
      '<td><span class="td-strong">' + esc(b.company) + '</span>' + (b.regNo ? '<span class="td-sub">' + esc(b.regNo) + '</span>' : '') +
        (b.origin === 'international' ? '<span class="pill blue" style="margin-top:4px">International · USD</span>' : '') + '</td>' +
      '<td>' + sbaTypeChip(b) + '</td>' +
      '<td>' + b.stalls.map((s) => esc(sbdZoneLabel(s.hall)) + ' <b>' + esc(s.name) + '</b>').join('<br>') + '</td>' +
      '<td class="sba-area">' + b.stalls.map((s) => 'Area: ' + s.sqm + 'm²<br>Size: ' + esc(s.size)).join('<br>') + '</td>' +
      '<td>' + b.stalls.map((s) => esc(sbaDesign(s))).join('<br>') + '</td>' +
      '<td class="money">' + sbdAmt(b.total, b.origin) + '<span class="td-sub">100% · ' + (b.payment && b.payment.mode ? SBDT_MODE[b.payment.mode] : 'online / offline') + '</span></td>' +
      '<td>' + sbdHoldCell(b) + '</td>' +
      '<td>' + sbaStatus(b.status) + '</td>' +
      '<td style="white-space:nowrap">' + sbaDate(b.createdAt) + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="sba-act">' +
        '<button class="sba-dots" onclick="sbaMenu(this)" aria-label="Actions"><span class="material-symbols-outlined">more_horiz</span></button>' +
        '<div class="sba-menu"><div class="sba-menu-h">QUICK ACTIONS</div>' +
          (acts || '<button disabled title="' + SBA_STATUS[b.status][2] + ' — no actions"><span class="material-symbols-outlined">block</span>No actions</button>') +
          '<button class="sba-menu-view" onclick="sbaOpen(\'' + b.id + '\')"><span class="material-symbols-outlined">visibility</span>View Full Details</button>' +
        '</div></div></td></tr>';
  }).join('') ||
    '<tr><td colspan="11" style="color:var(--muted);padding:28px;text-align:center">No reservations match the selected filters.</td></tr>';

  const sel = (k, opts, all) => '<select class="sba-sel" onchange="sbaSet(\'' + k + '\', this.value)">' +
    '<option value="">' + all + '</option>' + opts.map(([v, l]) => '<option value="' + v + '"' + (SBA[k] === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const dateSel = sel('dateMode', DATE_PRESET_OPTS, 'All Dates (Created)') +
    (SBA.dateMode === 'custom' ? toolbarDates(SBA.from, SBA.to, 'sbaFrom', 'sbaTo') : '');
  const verif = every.filter((b) => b.status === 'payment_under_verification').length;
  const soon = every.filter((b) => b.status === 'reserved' && sbpDaysLeft(b.holdUntil) <= 7).length;

  return '<div class="sba-head"><span class="material-symbols-outlined">inventory_2</span><h1 class="page-title" style="margin:0">Space Reservations</h1>' +
      (verif ? '<span class="pill blue">' + verif + ' payment proof' + (verif === 1 ? '' : 's') + ' to verify</span>' : '') +
      (soon ? '<span class="pill amber">' + soon + ' cart' + (soon === 1 ? '' : 's') + ' expiring within 7 days</span>' : '') + '</div>' +
    '<p class="page-sub">Stalls go straight into the exhibitor’s cart and are held for ' + SBP_HOLD_DAYS + ' days from cart creation. 100% of the proforma invoice must reach DEO’s account within validity (online or offline) or the stalls are released. DEO may extend validity case by case before expiry.</p>' +
    '<div class="card sba-card">' +
      '<div class="sba-toolbar">' +
        '<label class="sba-search"><span class="material-symbols-outlined">search</span>' +
          '<input id="sbaQ" placeholder="Search by PI No, Reservation No, Exhibitor Name, Stall" value="' + esc(SBA.q) + '" oninput="sbaSetQ(this.value)"></label>' +
        sel('type', [['space', 'Pre-defined Space'], ['chalet', 'Chalet']], 'All Type') +
        sel('status', Object.keys(SBA_STATUS).map((k) => [k, SBA_STATUS[k][2]]), 'All Status') +
        dateSel +
        ((SBA.q || SBA.type || SBA.status || SBA.dateMode)
          ? '<button class="sba-icon" title="Clear filters" onclick="sbaClear()"><span class="material-symbols-outlined">filter_alt_off</span></button>' : '') +
        '<button class="sba-icon" title="Export to Excel" onclick="exportSbaReservations()"><span class="material-symbols-outlined">download</span></button>' +
        '<button class="sba-icon" title="Refresh" onclick="render();toast(\'Reservations refreshed\')"><span class="material-symbols-outlined">refresh</span></button>' +
      '</div>' +
      '<div class="tablewrap"><table class="grid sba-table"><tr><th>Proforma Invoice</th><th>Exhibitor</th><th>Type</th><th>Hall / Stall</th><th>Area</th>' +
        '<th>Stall Design</th><th>Net Payable</th><th>Validity</th><th>Status</th><th>Cart Created</th><th>Action</th></tr>' + trs + '</table></div>' +
      '<div class="sba-foot"><span class="sba-total">Total: ' + list.length + '</span><span style="flex:1"></span>' +
        '<label class="sba-rows">Rows <select onchange="SBA.rows=+this.value;SBA.page=1;render()">' +
          [10, 25, 50].map((n) => '<option' + (SBA.rows === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<span class="sba-showing">Showing ' + (list.length ? st + 1 : 0) + ' to ' + Math.min(st + SBA.rows, list.length) + '</span>' +
        '<button class="sba-icon" ' + (SBA.page <= 1 ? 'disabled' : 'onclick="sbaPage(' + (SBA.page - 1) + ')"') + ' aria-label="Previous page"><span class="material-symbols-outlined">chevron_left</span></button>' +
        '<button class="sba-icon" ' + (SBA.page >= pages ? 'disabled' : 'onclick="sbaPage(' + (SBA.page + 1) + ')"') + ' aria-label="Next page"><span class="material-symbols-outlined">chevron_right</span></button>' +
      '</div></div>' + footerTools();
}
const viewSpaceApprovals = viewSpaceReservations; // legacy route name

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

function exportSbaReservations() {
  const list = window.__sbaList || [];
  exportWorkbook('Space-Reservations-' + exportStamp(), [{
    name: 'Reservations',
    headers: ['Proforma Invoice', 'Reservation No', 'Exhibitor', 'Reg No', 'Type', 'Hall / Chalet Line', 'Stall / Chalet', 'Area (sqm)', 'Size', 'Stall Design',
      'Exhibitor Type', 'Currency', 'Net Payable', 'Net Payable (INR equiv.)', 'Status', 'Cart Created', 'Valid Till', 'Days Left', 'Extensions', 'Payment Mode', 'Method', 'Reference', 'Paid At'],
    rows: list.map((b) => {
      const h = sbdHold(b);
      return [b.piNo, b.no, b.company, b.regNo, sbaTypeLabel(b), b.stalls.map((s) => sbdZoneLabel(s.hall)).join(', '), b.stalls.map((s) => s.name).join(', '),
        sbdSqm(b), b.stalls.map((s) => s.size).join(', '), b.stalls.map(sbaDesign).join(', '), SBDT_ORIGIN[b.origin || 'national'], b.origin === 'international' ? 'USD' : 'INR',
        sbdAmtXls(b.total, b.origin), b.total, SBA_STATUS[b.status][2], sbdFmt(b.createdAt), sbpDate(b.holdUntil), sbdIsOpen(b) ? (h.paused ? 'Paused' : h.left) : '-',
        (b.extensions || []).length, b.payment && b.payment.mode ? SBDT_MODE[b.payment.mode] : '-', b.payment ? b.payment.method || '-' : '-', b.payment ? b.payment.ref || b.payment.txn || '-' : '-',
        b.paidAt ? sbdFmt(b.paidAt) : '-'];
    }),
  }]);
}

/* ---------------- detail drawer ---------------- */
function sbaClose() { const d = $('sbaDrawer'); if (d) d.remove(); }
function sbaOpen(id) {
  document.querySelectorAll('.sba-menu.open').forEach((x) => x.classList.remove('open'));
  const b = sbdBookings().find((x) => x.id === id);
  if (!b) return;
  const money = (n) => sbdAmt(n, b.origin); // USD for international exhibitors
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

  /* validity clock */
  const h = sbdHold(b);
  const ext = (b.extensions || []).map((e) =>
    '<div class="action-row" style="padding:7px 0"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">more_time</span></span>' +
    '<div class="atext"><b>Extended to ' + sbpDate(e.to) + '</b><span>' + (e.reason ? esc(e.reason) + ' · ' : '') + 'by ' + esc(e.by || SBD_ADMIN) + ' · ' + esc(e.at || '') + '</span></div></div>').join('');
  const clock = sbdIsOpen(b)
    ? '<div class="sba-specs" style="grid-template-columns:repeat(3,1fr)">' + spec('Cart Created', sbaDate(b.createdAt) + ' · ' + sbaTime(b.createdAt)) + spec('Valid Till', sbpDate(b.holdUntil) + ' 23:59 IST') +
        spec(h.paused ? 'Clock' : 'Days Left', h.paused ? 'Paused since ' + sbpDate(b.pausedAt) + ' (' + h.left + ' day' + (h.left === 1 ? '' : 's') + ' remaining)' : (h.left <= 0 ? 'Expires today' : h.left + ' day' + (h.left === 1 ? '' : 's'))) + '</div>' +
      (b.status === 'reserved' ? '<div class="sba-note' + (h.left <= 3 ? ' red' : '') + '"><span class="material-symbols-outlined">' + (h.left <= 3 ? 'warning' : 'info') + '</span>' +
        (h.left <= 0 ? 'Validity ends today — stalls are released at 23:59 IST unless 100% payment is received or validity is extended.'
          : 'Reminders go to the exhibitor at T−7, T−3 and T−1 days. Unpaid carts are released automatically on expiry; extend validity only before that.') + '</div>' : '') + ext
    : b.status === 'confirmed'
      ? '<div class="sba-specs" style="grid-template-columns:repeat(3,1fr)">' + spec('Cart Created', sbaDate(b.createdAt)) + spec('Was Valid Till', sbpDate(b.holdUntil)) + spec('Paid On', b.paidAt ? sbaDate(b.paidAt) + ' · ' + sbaTime(b.paidAt) : '—') + '</div>' + ext
      : b.status === 'expired'
        ? '<div class="sba-note red"><span class="material-symbols-outlined">timer_off</span>Expired on ' + sbpDate(b.holdUntil) + ' — the ' + SBP_HOLD_DAYS + '-day validity lapsed without full payment. The space is back in inventory; the exhibitor can book again.</div>' + ext
        : '<div class="sba-note red"><span class="material-symbols-outlined">lock_open</span>Released' + (b.releasedAt ? ' on ' + esc(b.releasedAt) : '') + (b.remark ? ' — ' + esc(b.remark) : '') + '. The space is back in inventory.</div>' + ext;

  /* payment summary — full calculation (space-pricing.js) */
  const p = b.pricing;
  const sum = (k, v, st) => '<div class="sba-sum"><span>' + k + '</span><b' + (st ? ' style="' + st + '"' : '') + '>' + v + '</b></div>';
  const calc =
    (p.lines.length > 1 ? p.lines.map((l) => sum('Base Price <small>' + esc(l.name) + '</small>', money(l.base))).join('') : sum('Base Price', money(p.base))) +
    (p.lines.some((l) => l.side)
      ? p.lines.filter((l) => l.side).map((l) => sum('Corner / Open Side Charges <small>' + esc(l.sides) + ' Open · ' + Math.round(l.sidePct * 100) + '%</small>', money(l.side))).join('')
      : sum('Corner / Open Side Charges <small>' + (p.lines[0] && p.lines[0].hall === 'CH' ? 'not applicable on chalet' : '1 Side Open · no premium') + '</small>', money(0))) +
    '<div class="sba-sum line"></div>' +
    sum('Subtotal', money(p.subtotal)) +
    sum('GST (18%)', money(p.gst)) +
    '<div class="sba-sum line"></div>' +
    sum('<b style="color:var(--blue)">Grand Total</b>', money(p.grand), 'color:var(--blue)') +
    (p.credit ? sum('Registration Amount <small>already paid · adjusted</small>', '− ' + money(p.credit)) : '') +
    '<div class="sba-sum line"></div>' +
    sum('<b>Net Payable (100% · single payment)</b>', money(p.payable)) +
    (b.origin === 'international' ? '<div class="sba-sum"><span><small style="margin:0">Converted at ₹' + SBD_USD_RATE + ' = $1 · INR equivalent ' + sbdAmt(p.payable, 'national') + '</small></span></div>' : '');

  /* payment / proof */
  const pm = b.payment;
  const payRow = (k, v) => '<tr><td style="color:var(--muted);width:40%">' + k + '</td><td><b>' + v + '</b></td></tr>';
  const paySec = b.status === 'payment_under_verification'
    ? '<div class="sba-note"><span class="material-symbols-outlined">hourglass_top</span>Offline payment proof uploaded by the exhibitor — verify the credit in DEO’s bank account, then mark received or reject.</div>' +
      '<div class="tablewrap"><table class="grid">' + payRow('Mode', 'Offline') + payRow('Method', esc(pm.method)) + payRow('UTR / Reference', '<span class="regno">' + esc(pm.ref) + '</span>') +
        payRow('Payment Date', esc(pm.date || '—')) + payRow('Amount Transferred', money(pm.amount || b.total)) + payRow('Proof File', pm.fileName ? esc(pm.fileName) : '<span style="color:var(--muted)">not attached</span>') +
        payRow('Submitted', esc(pm.submittedAt || '—')) + '</table></div>'
    : b.status === 'confirmed'
      ? '<div class="tablewrap"><table class="grid">' + payRow('Status', '<span class="pill green">Paid · 100%</span>') + payRow('Mode', pm ? SBDT_MODE[pm.mode || 'online'] : 'Online') +
        payRow('Method', esc(pm ? pm.method || 'Card' : 'Card')) + payRow('Txn / Reference', '<span class="regno">' + esc((pm && (pm.txn || pm.ref)) || b.orderNo || '—') + '</span>') +
        payRow('Paid At', b.paidAt ? sbdFmt(b.paidAt) : '—') + (pm && pm.verifiedBy ? payRow('Verified By', esc(pm.verifiedBy) + (pm.verifiedAt ? ' · ' + esc(pm.verifiedAt) : '')) : '') +
        (b.orderNo ? payRow('Tax Invoice', '<span class="regno">INV-' + esc(String(b.orderNo).replace('ORD-', '')) + '</span>') : '') + '</table></div>'
      : b.status === 'reserved'
        ? '<div class="sba-note"><span class="material-symbols-outlined">info</span>Awaiting 100% payment of ' + money(b.total) + ' — online through the portal cart, or offline (NEFT / RTGS / Cheque / SWIFT) against proforma invoice ' + esc(b.piNo) + '. Offline proof pauses the clock until verified.</div>' +
          (pm && pm.rejectedAt ? '<div class="sba-note red"><span class="material-symbols-outlined">rule</span>Earlier proof rejected ' + esc(pm.rejectedAt) + ' — ' + esc(pm.method) + ' · ' + esc(pm.ref) + (pm.remark ? ' · ' + esc(pm.remark) : '') + '. Clock resumed from where it paused.</div>' : '')
        : '<div class="sba-note"><span class="material-symbols-outlined">block</span>No payment was received against this reservation.</div>';

  const html =
    '<div class="sba-drawer-bg" onclick="sbaClose()"></div>' +
    '<aside class="sba-drawer" role="dialog" aria-modal="true" aria-label="Reservation ' + esc(b.piNo) + '">' +
      '<div class="sba-dhead"><h2>' + esc(b.piNo) + '</h2><button class="modal-close" onclick="sbaClose()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<div class="sba-dbody">' +
        '<div class="sba-exrow"><div><small class="sba-eyebrow">EXHIBITOR</small><h3>' + esc(b.company) + '</h3>' +
          '<div class="sba-when"><span class="material-symbols-outlined">calendar_today</span>' + sbaDate(b.createdAt) + ' · ' + sbaTime(b.createdAt) +
            ' · <span class="regno">' + esc(b.no) + '</span>' + (b.regNo ? ' · <span class="regno">' + esc(b.regNo) + '</span>' : '') + '</div></div>' +
          (exId ? '<a class="btn btn-primary sba-profile" href="#/exhibitor/' + exId + '"><span class="material-symbols-outlined">person</span>Profile</a>' : '') + '</div>' +
        '<div class="sba-chips">' + sbaTypeChip(b) +
          (b.origin === 'international' ? '<span class="sba-chip blue"><span class="material-symbols-outlined">public</span>International · Billed in USD</span>' : '') +
          '<span class="sba-chip ' + SBA_STATUS[b.status][3] + '"><span class="material-symbols-outlined">' + SBA_STATUS[b.status][0] + '</span>' + SBA_STATUS[b.status][2] + '</span></div>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">timer</span>Cart Validity (' + SBP_HOLD_DAYS + ' days)</h4>' + clock + '</section>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">grid_view</span>Space Specifications</h4>' + specs + '</section>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">payments</span>Proforma Invoice ' + esc(b.piNo) + '</h4>' + calc + '</section>' +

        '<section class="sba-sec"><h4><span class="material-symbols-outlined">receipt_long</span>Payment</h4>' + paySec + '</section>' +
      '</div>' +
      (sbaActionButtons(b) ? '<div class="sba-dfoot" style="flex-wrap:wrap">' + sbaActionButtons(b, 'btn btn-outline btn-sm') + '</div>' : '') +
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
function sbaApply(b, patch, liveFx) {
  if (b.source === 'live') {
    const ex = loadExState(); if (!ex || !ex.spaceBooking) return;
    const r = ex.spaceBooking.reservations.find((x) => x.id === b.id); if (!r) return;
    Object.assign(r, patch);
    if (liveFx) liveFx(r, ex);
    saveExState(ex);
  } else {
    sbdSaveDecision(b.id, Object.assign(sbdDecisions()[b.id] || {}, patch));
  }
}
const sbaStallNames = (b) => b.stalls.map((s) => s.name).join(', ');
function sbaRefresh(id) { render(); sbaOpen(id); }

/* Extend validity — allowed only before expiry */
function sbaExtend(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !sbdIsOpen(b)) { toast('Validity can be extended only while the reservation is in the cart (before expiry).', 'error'); return; }
  sbaClose();
  const cur = new Date(b.holdUntil);
  const def = new Date(Math.max(cur.getTime(), Date.now()) + 7 * 864e5).toISOString().slice(0, 10);
  const min = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  openModal('Extend Validity · ' + esc(b.piNo),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · ' + esc(sbaStallNames(b)) + ' · currently valid till <b>' + sbpDate(b.holdUntil) + '</b>' +
      (b.status === 'payment_under_verification' ? ' (clock paused — payment proof under verification)' : '') + '</p>' +
    '<div class="form-grid"><div class="field"><label>New valid-till date <span class="req">*</span></label><input type="date" id="sbaExtDate" value="' + def + '" min="' + min + '"><div class="error"></div></div>' +
    '<div class="field full"><label>Reason (shown to the exhibitor) <span class="req">*</span></label><input type="text" id="sbaExtReason" placeholder="e.g. Bank holiday / RTGS in transit — exhibitor requested 7 more days"><div class="error"></div></div></div>',
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
  sbaApply(b, { holdUntil: to, extensions: (b.extensions || []).concat([entry]), reminders: {} }, (r, ex) => {
    (ex.cart || []).forEach((c) => { if (c.type === 'space' && c.refId === r.id) c.sub = r.stalls.map((s) => s.name).join(', ') + ' · valid till ' + sbpDate(to); });
    sbdNotifyEx(ex, 'more_time', 'var(--blue)', 'DEO extended the validity of cart ' + r.piNo + ' to ' + sbpDate(to) + ' — ' + reason + '. Pay ' + money(r.amount) + ' by then to confirm ' + r.stalls.map((s) => s.name).join(', ') + '.');
  });
  closeModal(); sbaRefresh(id);
  toast('Validity of ' + b.piNo + ' extended to ' + sbpDate(to) + '.', 'success');
}

/* Mark offline payment received → confirmed, order + tax invoice, stalls to dashboard */
function sbaMarkReceived(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'payment_under_verification') return;
  if (!confirm('Confirm that ' + sbdAmt(b.total, b.origin) + ' (100%) for ' + b.piNo + ' has been received in DEO’s account?\n' + b.payment.method + ' · Ref ' + b.payment.ref + '\nThe stalls ' + sbaStallNames(b) + ' will be confirmed and a tax invoice issued.')) return;
  const at = new Date();
  const txn = 'TXN' + String(sbdHash(b.id + at.getTime())).slice(0, 9);
  const payment = Object.assign({}, b.payment, { verifiedAt: nowStr(), verifiedBy: SBD_ADMIN, txn: txn, amount: b.payment.amount || b.total });
  sbaApply(b, { status: 'confirmed', paidAt: nowStr(), paidAtIso: at.toISOString(), pausedAt: null, payment: payment }, (r, ex) => {
    if (!ex.seq.order) ex.seq.order = 0;
    ex.seq.order += 1;
    const orderNo = 'ORD-2027-' + String(ex.seq.order).padStart(4, '0');
    r.orderNo = orderNo;
    (ex.orders = ex.orders || []).push({
      id: 'order_' + ex.seq.order, orderNo: orderNo, type: 'space', label: 'Space Reservation ' + r.piNo + ' — 100% payment',
      sub: r.stalls.map((s) => s.name).join(', ') + ' · ' + r.payment.method + ' · Ref ' + r.payment.ref, refId: r.id,
      amount: r.amount, currency: 'INR', status: 'success', method: r.payment.method, mode: 'offline', ref: r.payment.ref,
      paidAt: nowStr(), paidAtIso: at.toISOString(), payer: EX_COMPANY,
    });
    r.stalls.forEach((st) => {
      if (!ex.stalls.some((x) => x.stall === st.name)) ex.stalls.push({ id: 'st_' + st.name, hall: sbdZoneLabel(st.hall), stall: st.name, area: st.sqm });
    });
    ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbdNotifyEx(ex, 'verified', 'var(--green)', 'DEO verified your ' + r.payment.method + ' payment (Ref ' + r.payment.ref + ') — ' + r.stalls.map((s) => s.name).join(', ') + ' confirmed (' + r.piNo + '). Tax invoice ' + orderNo.replace('ORD-', 'INV-') + ' is available under My Orders.');
  });
  sbaRefresh(id);
  toast(b.piNo + ' marked as paid — stalls confirmed.', 'success');
}

/* Reject proof → back to reserved, clock resumes from where it paused */
function sbaRejectProof(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'payment_under_verification') return;
  sbaClose();
  openModal('Reject Payment Proof · ' + esc(b.piNo),
    '<p style="margin:0 0 10px;font-size:0.86rem">' + esc(b.company) + ' · ' + esc(b.payment.method) + ' · Ref ' + esc(b.payment.ref) + ' · ' + sbdAmt(b.payment.amount || b.total, b.origin) + '</p>' +
    '<p style="margin:0 0 10px;font-size:0.8rem;color:var(--muted)">The reservation returns to the cart and the validity clock resumes from where it paused (' + sbdHold(b).left + ' day(s) remaining).</p>' +
    '<label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:6px">Remark (shown to the exhibitor) <span style="color:var(--red)">*</span></label>' +
    '<textarea id="sbaRemark" rows="3" placeholder="e.g. UTR not traceable in DEO account / amount short by ₹…" style="width:100%;box-sizing:border-box;' + dateInputStyle + '"></textarea>',
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
  sbaApply(b, { status: 'reserved', holdUntil: holdUntil, pausedAt: null, payment: payment }, (r, ex) => {
    if (!ex.seq.cart) ex.seq.cart = 0;
    ex.seq.cart += 1;
    (ex.cart = ex.cart || []).push({ id: 'cart_' + ex.seq.cart, type: 'space', refId: r.id, label: 'Space Reservation ' + r.piNo + ' — 100% payment',
      sub: r.stalls.map((s) => s.name).join(', ') + ' · valid till ' + sbpDate(holdUntil), amount: r.amount });
    sbdNotifyEx(ex, 'rule', 'var(--red)', 'DEO could not verify your ' + r.payment.method + ' payment for ' + r.piNo + ' (Ref ' + r.payment.ref + '): ' + remark + '. The cart is valid till ' + sbpDate(holdUntil) + ' — pay online or upload a fresh proof.');
  });
  closeModal(); sbaRefresh(id);
  toast('Payment proof for ' + b.piNo + ' rejected — reservation back in cart, valid till ' + sbpDate(holdUntil) + '.', 'error');
}

/* Release now — stalls back to inventory immediately */
function sbaRelease(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || !sbdIsOpen(b)) return;
  const remark = prompt('Release ' + b.piNo + ' (' + sbaStallNames(b) + ') now and return the stalls to inventory?\nReason (shown to the exhibitor):', 'Released by DEO on exhibitor request');
  if (remark === null) return;
  sbaApply(b, { status: 'released', releasedAt: nowStr(), pausedAt: null, remark: remark.trim() || 'Released by DEO' }, (r, ex) => {
    ex.cart = (ex.cart || []).filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbdNotifyEx(ex, 'lock_open', 'var(--red)', 'DEO released reservation ' + r.piNo + ' (' + r.stalls.map((s) => s.name).join(', ') + ')' + (r.remark ? ' — ' + r.remark : '') + '. The stalls are back in inventory.');
  });
  sbaRefresh(id);
  toast(b.piNo + ' released — space back in inventory.', 'error');
}

/* Debug: move the validity into the past so the expiry rule fires on the next render */
function sbaSimulateExpiry(id) {
  const b = sbdBookings().find((x) => x.id === id);
  if (!b || b.status !== 'reserved') return;
  if (!confirm('Simulate expiry of ' + b.piNo + '? Its validity will be set to yesterday — the reservation expires and ' + sbaStallNames(b) + ' are released on the next render (admin and exhibitor portal).')) return;
  const past = new Date(Date.now() - 864e5).toISOString();
  sbaApply(b, { holdUntil: past }, (r, ex) => { if (r.extensions) r.extensions.push({ from: b.holdUntil, to: past, reason: 'Simulated expiry (debug)', at: nowStr(), by: SBD_ADMIN }); });
  sbaRefresh(id);
  toast(b.piNo + ' expired (simulated) — stalls released.', 'error');
}
