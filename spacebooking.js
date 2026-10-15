/* ============================================================
   Evenuefy — Space Booking (AERO-245 · cart-based reservation)
   Flow: Book Space (venue map → hall → stall grid) → Stall Detail
   (category Shell/Raw → detail → Select Stall) → Reserve & Add to
   Cart → stalls are HELD for 21 days from cart creation → 100% of
   the cart paid online (gateway) or offline (NEFT / RTGS / Cheque /
   SWIFT against the proforma invoice) → Confirmed booth (feeds the
   dashboard hero & stall labels). No organiser approval, no slabs.
   Unpaid carts expire after 21 days and the stalls are released;
   DEO may extend validity case by case before expiry.
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */
/* bump to wipe every portal's demo applications on the next load */
const SB_CLEAR_SEQ = 3;
(function migrateSpaceBooking() {
  if (!S.spaceBooking) S.spaceBooking = {};
  if (!S.spaceBooking.reservations) {
    /* older demo data held approval-based "applications" — keep the
       confirmed booths, drop everything that was waiting for approval */
    const old = S.spaceBooking.applications || [];
    S.spaceBooking.reservations = old.filter((a) => a.status === 'confirmed').map((a) => ({
      id: a.id, no: a.no, piNo: 'PI-' + a.no.replace('#', ''), type: a.type, stalls: a.stalls,
      pricing: (typeof sbpPrice === 'function') ? sbpPrice(a.stalls, false) : { payable: a.total, grand: a.total, lines: [], base: a.total, side: 0, subtotal: a.total, gst: 0, credit: 0 },
      amount: a.total, status: 'confirmed', createdAt: a.createdAt, createdAtIso: new Date().toISOString(),
      holdUntil: new Date().toISOString(), extensions: [], reminders: {}, paidAt: a.confirmedAt || a.createdAt,
      payment: { mode: 'online', method: 'Card' },
    }));
    delete S.spaceBooking.applications;
  }
  if (!S.seq.pi) S.seq.pi = 0;
  /* v2: one application per stall + application detail page. Demo data
     created under the earlier cart model is cleared once so every
     portal starts from a clean listing. */
  if (S.spaceBooking.clearSeq !== SB_CLEAR_SEQ) {
    sbClearApplications(true);
    S.spaceBooking.clearSeq = SB_CLEAR_SEQ;
  }
  save();
})();

/* Clear all stall applications (demo reset) — their cart items, orders,
   notifications and the stalls they added to the dashboard go too. */
function sbClearApplications(silent) {
  if (!silent && !confirm('Clear ALL stall applications? Cart items, their orders and confirmed stalls from these applications will be removed. Seeded stalls stay.')) return;
  const list = S.spaceBooking.reservations || [];
  const ids = list.map((r) => r.id);
  const derived = list.flatMap((r) => r.stalls.map((s) => 'st_' + s.name));
  S.spaceBooking.reservations = [];
  S.cart = S.cart.filter((c) => c.type !== 'space');
  S.orders = (S.orders || []).filter((o) => !(o.type === 'space' && ids.includes(o.refId)));
  S.stalls = S.stalls.filter((s) => !derived.includes(s.id));
  S.notifications = (S.notifications || []).filter((n) => !/^nt_/.test(n.id));
  S.seq.pi = 0;
  S.spaceBooking.v2 = true;
  if (!silent) { save(); window.__sbFilter = ''; render(); toast('All stall applications cleared.', 'success'); }
}

const SB_STATUS = {
  reserved: ['amber', 'Reserved · In Cart'],
  payment_under_verification: ['blue', 'Payment Under Verification'],
  confirmed: ['green', 'Confirmed'],
  expired: ['gray', 'Expired'],
  released: ['red', 'Released'],
};
const sbStatusPill = (st) => '<span class="pill ' + SB_STATUS[st][0] + '">' + SB_STATUS[st][1] + '</span>';
const SB_LIVE = ['reserved', 'payment_under_verification', 'confirmed']; // statuses that hold inventory
const sbRes = (id) => S.spaceBooking.reservations.find((r) => r.id === id);
const SB_OFFLINE_METHODS = ['NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)'];

/* ---------------- hall & stall master (demo inventory) ---------------- */
const SB_PRICE = { 108: { shell: 125000, raw: 250000 }, 54: { shell: 65000, raw: 130000 }, 36: { shell: 45000, raw: 90000 } };
const SB_SIZE = { 108: '12X9', 54: '9X6', 36: '6X6' };

const SB_HALLS = ['A', 'B', 'C', 'D', 'E'].map((h, hi) => ({
  id: h, name: 'Hall ' + h,
  stalls: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const sqm = n <= 4 ? 108 : n <= 8 ? 54 : 36;
    return {
      name: h + '8.' + n, sqm: sqm, size: SB_SIZE[sqm],
      design: n % 2 ? 'Two Side Open Stall' : 'One Side Open Stall',
      sides: n % 2 ? '2 Sides' : '1 Side',
      seedBooked: (n + hi) % 4 === 0,                        // ~25% pre-booked inventory
      seedReserved: (n + hi) % 4 !== 0 && (n * 3 + hi) % 7 === 0, // in another exhibitor's cart
    };
  }),
}));

/* Chalet Line 1 — 10 chalets (100 sqm footprint) booked as 1 Floor or
   2 Floor; same reserve → pay-in-full flow as hall stalls. */
const SB_CHALET_PRICE = { chalet1: 600000, chalet2: 1000000 };
const SB_CHALET = {
  id: 'CH', name: 'Chalet Line 1', chalet: true,
  stalls: Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return { name: 'CH-' + String(n).padStart(2, '0'), sqm: 100, size: '10X10', chalet: true,
      design: 'Standalone Chalet', sides: '4 Sides', seedBooked: n % 4 === 0, seedReserved: n === 7 };
  }),
};
const sbZone = (id) => (id === 'CH' ? SB_CHALET : SB_HALLS.find((h) => h.id === id));
const sbZoneLabel = (id) => (id === 'CH' ? 'Chalet Line 1' : 'Hall ' + id);
const SB_SCHEME_LABEL = { shell: 'Shell', raw: 'Raw', chalet1: 'Chalet · 1 Floor', chalet2: 'Chalet · 2 Floor' };
const sbSchemeLabel = (sc) => SB_SCHEME_LABEL[sc] || sc;
const sbPrice = (st, sc) => (st.chalet ? SB_CHALET_PRICE[sc] : SB_PRICE[st.sqm][sc]);

/* inventory map: 'hall|stall' → { kind: 'booked' | 'reserved' | 'mine', res } */
function sbBookedSet() {
  const set = {};
  S.spaceBooking.reservations.forEach((r) => {
    if (!SB_LIVE.includes(r.status)) return;
    r.stalls.forEach((st) => { set[st.hall + '|' + st.name] = { kind: r.status === 'confirmed' ? 'booked' : 'mine', res: r }; });
  });
  // HAL's originally seeded stalls also block inventory
  S.stalls.forEach((st) => { set[(st.hall === 'Chalet Line 1' ? 'CH' : st.hall.replace('Hall ', '')) + '|' + st.stall] = { kind: 'booked' }; });
  // other exhibitors' carts (demo seed)
  SB_HALLS.concat([SB_CHALET]).forEach((h) => h.stalls.forEach((st) => {
    const k = h.id + '|' + st.name;
    if (st.seedBooked && !set[k]) set[k] = { kind: 'booked' };
    else if (st.seedReserved && !set[k]) set[k] = { kind: 'reserved' };
  }));
  return set;
}

window.__sbSel = window.__sbSel || []; // transient stall selection

/* ---------------- notifications (bell + toast) ---------------- */
function sbNotify(icon, color, text, quiet) {
  if (!S.notifications) S.notifications = [];
  S.notifications.unshift({ id: 'nt_' + Date.now() + '_' + Math.floor(Math.random() * 1e4), icon: icon, color: color, text: text, time: nowStr(), read: false });
  if (!quiet) toast(text, color === 'var(--red)' ? 'error' : 'success');
}

/* ---------------- validity clock: expiry + reminders ----------------
   Runs on every render (hooked from app.js) — no timers. */
function sbTick() {
  if (!S.spaceBooking || !S.spaceBooking.reservations) return;
  const now = Date.now();
  let changed = false;
  S.spaceBooking.reservations.forEach((r) => {
    if (r.status !== 'reserved') return;
    const left = sbpDaysLeft(r.holdUntil, now);
    if (new Date(r.holdUntil).getTime() < now) {
      r.status = 'expired'; r.expiredAt = nowStr(); r.expiredAtIso = new Date().toISOString();
      S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
      sbNotify('timer_off', 'var(--red)', 'Reservation ' + r.piNo + ' (' + r.stalls.map((s) => s.name).join(', ') + ') expired on ' + sbpDate(r.holdUntil) + ' — the stalls have been released.', true);
      changed = true;
      return;
    }
    if (!r.reminders) r.reminders = {};
    /* T-7 / T-3 / T-1: fire the closest threshold reached (once), skip any earlier ones already passed */
    const due = [1, 3, 7].find((t) => left <= t);
    if (due && !r.reminders[due]) {
      [7, 3, 1].forEach((t) => { if (t >= due) r.reminders[t] = true; });
      sbNotify('alarm', 'var(--amber)', 'Reminder: cart ' + r.piNo + ' is valid till ' + sbpDate(r.holdUntil) + ' (' + (left <= 0 ? 'expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '). Pay ' + money(r.amount) + ' to confirm ' + r.stalls.map((s) => s.name).join(', ') + '.', true);
      changed = true;
    }
  });
  if (changed) save();
}
function sbSettleExpiry() { sbTick(); }

/* ---------------- VIEW · Book Space — venue OUTER LAYOUT as an
   aerial site plan (SVG): boundary fence, entry gates, internal
   roads, chalet line, outdoor area, halls, parking & the runway. ---------------- */
function viewBookSpace() {
  const booked = sbBookedSet();
  const availOf = (h) => h.stalls.filter((st) => !booked[h.id + '|' + st.name]).length;

  const hallSvg = (id, x, y, w, hgt) => {
    const h = SB_HALLS.find((v) => v.id === id);
    const n = availOf(h);
    return '<g class="hall" onclick="location.hash=\'#/space-booking/hall/' + id + '\'">' +
      '<title>' + h.name + ' — ' + n + ' stalls available · click to open the floor plan</title>' +
      '<rect class="body" x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="6"/>' +
      '<text class="hname" x="' + (x + w / 2) + '" y="' + (y + hgt / 2 + 1) + '" text-anchor="middle" dominant-baseline="middle">' + id + '</text>' +
      '<text class="hsub" x="' + (x + w / 2) + '" y="' + (y + hgt - 9) + '" text-anchor="middle">HALL</text>' +
      '<circle cx="' + (x + w - 2) + '" cy="' + (y + 2) + '" r="11" fill="#1E8E5A"/>' +
      '<text x="' + (x + w - 2) + '" y="' + (y + 3) + '" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="10" font-weight="800" font-family="Mulish">' + n + '</text>' +
    '</g>';
  };
  const decoSvg = (txt, x, y, w, hgt, cls) =>
    '<g class="' + (cls || 'deco') + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="5"/>' +
    '<text x="' + (x + w / 2) + '" y="' + (y + hgt / 2 + 1) + '" text-anchor="middle" dominant-baseline="middle">' + txt + '</text></g>';

  const svg =
    '<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">' +
      /* ground */
      '<rect x="0" y="0" width="1000" height="560" fill="#F1E8D4"/>' +
      '<rect x="0" y="0" width="1000" height="560" fill="url(#grid)" opacity="0.5"/>' +
      '<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">' +
        '<path d="M40 0H0V40" fill="none" stroke="#E4D8BC" stroke-width="1"/></pattern></defs>' +
      /* boundary fence */
      '<rect x="14" y="14" width="972" height="440" rx="16" fill="none" stroke="#A29066" stroke-width="2" stroke-dasharray="10 6"/>' +
      '<text class="zonelabel" x="30" y="38">YELAHANKA AIR FORCE STATION — VENUE LAYOUT</text>' +
      /* compass */
      '<g transform="translate(950,52)"><circle r="16" fill="#fff" stroke="#CBB584"/><path d="M0,-10 L4,6 L0,3 L-4,6 Z" fill="#C6432E"/><text y="-20" text-anchor="middle" font-size="10" font-weight="800" fill="#8A7648" font-family="Mulish">N</text></g>' +
      /* chalet line */
      '<g class="hall chalet" onclick="location.hash=\'#/space-booking/hall/CH\'">' +
        '<title>Chalet Line 1 — ' + availOf(SB_CHALET) + ' chalets available · click to select</title>' +
        '<rect class="body" x="70" y="56" width="360" height="26" rx="5"/>' +
        '<text class="cname" x="250" y="73" text-anchor="middle">CHALET LINE 1</text>' +
        '<circle cx="428" cy="58" r="11" fill="#1E8E5A"/>' +
        '<text x="428" y="59" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="10" font-weight="800" font-family="Mulish">' + availOf(SB_CHALET) + '</text>' +
      '</g>' +
      /* outdoor display zone */
      '<rect x="70" y="96" width="250" height="88" rx="8" fill="#EAE0C6" stroke="#CBB584" stroke-dasharray="6 4"/>' +
      '<text class="zonelabel" x="110" y="144">OUTDOOR DISPLAY</text>' +
      decoSvg('18', 90, 156, 40, 20) + decoSvg('16', 250, 156, 40, 20) +
      /* parking left + right */
      '<g class="park"><rect x="24" y="200" width="86" height="34" rx="5"/><text x="67" y="221" text-anchor="middle">P1 PARKING</text></g>' +
      '<g class="park"><rect x="880" y="96" width="92" height="34" rx="5"/><text x="926" y="117" text-anchor="middle">P5A PARKING</text></g>' +
      /* row 1 halls */
      hallSvg('E', 340, 108, 92, 68) +
      decoSvg('G', 470, 116, 64, 52) + decoSvg('K', 560, 120, 54, 44, 'redb') + decoSvg('F', 650, 112, 84, 60) +
      /* apron road */
      '<rect x="40" y="192" width="920" height="30" fill="#D9CFB4"/>' +
      '<line x1="52" y1="207" x2="948" y2="207" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="16 12" opacity="0.8"/>' +
      '<text class="zonelabel" x="770" y="212" font-size="9">APRON ROAD</text>' +
      /* row 2 halls (bookable) */
      hallSvg('D', 130, 240, 100, 78) + hallSvg('C', 262, 240, 100, 78) + hallSvg('B', 394, 240, 100, 78) + hallSvg('A', 526, 240, 100, 78) +
      decoSvg('10', 658, 252, 46, 40, 'redb') + decoSvg('H', 736, 244, 80, 62) +
      /* row 3 */
      decoSvg('12 · 11', 262, 348, 108, 44) + decoSvg('J', 560, 348, 64, 44, 'redb') + decoSvg('19', 740, 348, 56, 44) +
      '<g class="park"><rect x="640" y="410" width="96" height="30" rx="5"/><text x="688" y="429" text-anchor="middle">P3 PARKING</text></g>' +
      '<g class="park"><rect x="760" y="400" width="40" height="48" rx="5"/><text x="780" y="427" text-anchor="middle">P4</text></g>' +
      /* entry gates */
      '<g><rect x="180" y="444" width="70" height="18" rx="4" fill="#fff" stroke="#A29066"/><text x="215" y="456" text-anchor="middle" font-size="9" font-weight="800" fill="#8A7648" font-family="Mulish">▲ GATE 1</text></g>' +
      '<g><rect x="470" y="444" width="70" height="18" rx="4" fill="#fff" stroke="#A29066"/><text x="505" y="456" text-anchor="middle" font-size="9" font-weight="800" fill="#8A7648" font-family="Mulish">▲ GATE 2</text></g>' +
      /* runway */
      '<rect x="0" y="486" width="1000" height="52" fill="#4A4F58"/>' +
      '<line x1="30" y1="512" x2="970" y2="512" stroke="#fff" stroke-width="4" stroke-dasharray="34 26" opacity="0.85"/>' +
      '<text x="500" y="478" text-anchor="middle" font-size="10" font-weight="800" letter-spacing="3" fill="#8A93A5" font-family="Mulish">RUNWAY 09/27 — FLYING DISPLAY AREA</text>' +
    '</svg>';

  return '<h1 class="page-title">Space Booking — Exhibition Hall Selection</h1>' +
    '<p class="page-sub">The venue’s outer layout — tap a highlighted hall or the Chalet Line to open its layout and select stalls / chalets. Selected stalls are held in your cart for ' + SBP_HOLD_DAYS + ' days; pay 100% within that period to confirm. Outdoor areas are allotted by the organiser via Space Requirement.</p>' +
    '<div class="vmap-card"><div class="vmap">' + svg + '</div>' +
      '<div class="filter-chips" style="margin-top:12px;align-items:center">' +
        '<span class="pill blue">Tan halls with green count = open for booking</span>' +
        '<span class="pill gray">Light blocks = map only</span>' +
        '<span class="pill red" style="background:var(--red-soft);color:var(--red)">Red = reserved venues</span>' +
        '<span class="pill green">Green = parking</span>' +
      '</div></div>' +
    '<div class="hall-cards">' +
      SB_HALLS.concat([SB_CHALET]).map((h) => '<div class="hall-card" onclick="location.hash=\'#/space-booking/hall/' + h.id + '\'">' +
        '<span class="hc-icon"><span class="material-symbols-outlined">' + (h.chalet ? 'cottage' : 'grid_view') + '</span></span>' +
        '<span><b>' + h.name + '</b><small>' + (h.chalet ? '10 chalets · 1 / 2 Floor' : '12 stalls · Shell &amp; Raw') + '</small></span>' +
        '<span class="hc-count">' + availOf(h) + ' available</span></div>').join('') +
    '</div>';
}

/* ---------------- VIEW · Hall stall grid ---------------- */
function viewHallStalls(hallId) {
  const hall = sbZone(hallId);
  if (!hall) { location.hash = '#/space-booking/book'; return ''; }
  const booked = sbBookedSet();

  /* spatial floor-plan placement: large 12X9 stalls centre, 9X6 along the
     outdoor side, 6X6 along the roadside — like the hall drawing */
  const AREA = hall.chalet ? [] : ['l1', 'l2', 'l3', 'l4', 'm5', 'm6', 'm7', 'm8', 't9', 't10', 't11', 't12'];
  const tiles = hall.stalls.map((st, idx) => {
    const b = booked[hall.id + '|' + st.name];
    const inSel = window.__sbSel.some((s) => s.hall === hall.id && s.name === st.name);
    const cls = b ? b.kind : inSel ? 'insel' : 'avail';
    const label = !b ? (inSel ? 'In Selection' : 'Available')
      : b.kind === 'booked' ? 'Booked'
      : b.kind === 'reserved' ? 'Reserved'
      : (b.res.status === 'payment_under_verification' ? 'In your cart · payment under verification' : 'In your cart · valid till ' + sbpDate(b.res.holdUntil));
    const title = b && b.kind === 'reserved' ? ' title="Reserved — in another exhibitor’s cart"' : b && b.kind === 'mine' ? ' title="' + esc(label) + '"' : '';
    return '<div class="stall-tile ' + cls + '"' + (AREA[idx] ? ' style="grid-area:' + AREA[idx] + '"' : '') + title +
      (b ? (b.kind === 'mine' ? ' onclick="location.hash=\'#/space-booking/my\'"' : '') : ' onclick="openStallDetail(\'' + hall.id + '\',\'' + st.name + '\')"') + '>' +
      '<b>' + st.name + '</b><span>' + st.size + ' · ' + st.sqm + ' sqm</span>' +
      '<span>' + label + '</span></div>';
  }).join('');

  const floorplan = hall.chalet
    ? '<div class="fp-wrap">' +
        '<div class="fp-band">APRON ROAD — VISITOR SIDE</div>' +
        '<div class="chalet-grid">' + tiles + '</div>' +
        '<div class="fp-band bottom">RUNWAY 09/27 — FLYING DISPLAY VIEW</div>' +
      '</div>'
    : '<div class="fp-wrap">' +
      '<div class="fp-band"><span class="fp-exit" style="left:16px">SERVICE SPACE</span>ROADSIDE' +
        '<span class="fp-exit" style="right:16px">SERVICE SPACE</span></div>' +
      '<div class="fp-mid">' +
        '<div class="fp-rail left">EMERGENCY EXIT</div>' +
        '<div class="fp-grid">' + tiles + '</div>' +
        '<div class="fp-rail right">EMERGENCY EXIT</div>' +
      '</div>' +
      '<div class="fp-band bottom"><span class="fp-exit" style="left:16px">▲ ENTRY / EXIT</span>OUTDOOR DISPLAY SIDE' +
        '<span class="fp-exit" style="right:16px">ENTRY / EXIT ▲</span></div>' +
    '</div>';

  const selRows = window.__sbSel.map((s, i) =>
    '<div class="prod-row" style="padding:10px 12px">' +
      '<div class="pinfo"><b><span class="regno">' + esc(s.name) + '</span> <span class="pill blue">' + sbSchemeLabel(s.scheme) + '</span></b>' +
      '<span>' + esc(sbZoneLabel(s.hall)) + ' · ' + esc(s.size) + ' sq.m</span></div>' +
      '<b class="money" style="color:var(--green)">' + money(s.price) + '</b>' +
      '<button class="btn-link danger" onclick="sbRemoveSel(' + i + ')" title="Remove">✕</button></div>').join('');
  const p = window.__sbSel.length ? sbpPrice(window.__sbSel, sbCreditAvailable()) : null;

  return '<a class="back-link" href="#/space-booking/book"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Halls</a>' +
    '<h1 class="page-title">' + esc(hall.name) + (hall.chalet ? ' (Chalet Selection)' : ' (Stall Selection)') + '</h1>' +
    '<div class="filter-chips" style="margin-bottom:14px">' +
      '<span class="pill green">Available</span><span class="pill amber">Booked</span><span class="pill purple">Reserved (in another cart)</span>' +
      '<span class="pill blue" style="background:var(--blue);color:#fff">In your cart</span><span class="pill blue">In Selection</span></div>' +
    '<div class="prof-layout"><div>' + floorplan + '</div>' +
    '<div class="card"><div class="pcard-head" style="margin-bottom:8px">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">shopping_cart</span></span>' +
      '<h2 class="card-title">Selected Stalls</h2></div>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">' + window.__sbSel.length + ' stall(s) in your selection' +
        (window.__sbSel.length ? ' · <button class="btn-link" style="padding:0" onclick="window.__sbSel=[];render()">Clear All</button>' : '') + '</p>' +
      (selRows || '<div class="empty" style="padding:20px 6px"><span class="material-symbols-outlined">shopping_cart</span>' +
        '<h3 style="font-size:0.95rem">No Stalls Selected</h3><p style="font-size:0.78rem">Click on available stalls in the hall layout to add them to your selection.</p></div>') +
      (p
        ? '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px;font-size:0.82rem">' +
            sbSumRow('Base price', money(p.base)) +
            (p.side ? sbSumRow('Corner / open-side charges', money(p.side)) : '') +
            sbSumRow('GST 18%', money(p.gst)) +
            (p.credit ? sbSumRow('Registration amount adjusted', '− ' + money(p.credit)) : '') +
            '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:0.95rem;margin-top:6px"><span>Net payable (100%)</span><span style="color:var(--green)">' + money(p.payable) + '</span></div>' +
            '<p style="font-size:0.74rem;color:var(--muted);margin:8px 0 0">Stalls are held for <b>' + SBP_HOLD_DAYS + ' days</b> from cart creation (till ' + sbpDate(sbpHoldUntil(Date.now(), SBP_HOLD_DAYS)) + '). Pay the full amount online or offline within that period, else the stalls are released.</p>' +
          '</div>' +
          '<div class="bank-savebar" style="margin-top:10px;padding-top:12px">' +
          '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="sbReserve()"><span class="material-symbols-outlined">add_shopping_cart</span>Reserve &amp; Add to Cart</button></div>'
        : '') +
    '</div></div>';
}
const sbSumRow = (k, v) => '<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--muted)"><span>' + k + '</span><b style="color:var(--ink)">' + v + '</b></div>';

function sbRemoveSel(i) { window.__sbSel.splice(i, 1); render(); }

/* registration amount is adjusted once — on the earliest live reservation */
function sbCreditAvailable() {
  return !S.spaceBooking.reservations.some((r) => SB_LIVE.includes(r.status) && r.pricing && r.pricing.credit > 0);
}

/* ---------------- Stall Detail modal (2 steps, like the platform) ---------------- */
function openStallDetail(hallId, stallName) {
  const hall = sbZone(hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  if (st.chalet) {
    openModal('Chalet Detail',
      '<b style="display:block;margin-bottom:4px">Chalet Type</b>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 14px">Kindly select the number of floors to proceed with the booking process.</p>' +
      '<div class="radio-cards" style="grid-template-columns:1fr">' +
        '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'chalet1\')" style="text-align:center;padding:22px">' +
          '<b style="font-size:1.05rem">1 Floor Chalet</b><small>' + money(SB_CHALET_PRICE.chalet1) + ' (' + st.size + ' · ' + st.sqm + ' sqm)</small></label>' +
        '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'chalet2\')" style="text-align:center;padding:22px">' +
          '<b style="font-size:1.05rem">2 Floor Chalet</b><small>' + money(SB_CHALET_PRICE.chalet2) + ' (' + st.size + ' · ' + st.sqm + ' sqm per floor)</small></label>' +
      '</div>');
    return;
  }
  const p = SB_PRICE[st.sqm];
  openModal('Stall Detail',
    '<b style="display:block;margin-bottom:4px">Stall Category</b>' +
    '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 14px">Kindly select a stall category to proceed with the booking process.</p>' +
    '<div class="radio-cards" style="grid-template-columns:1fr">' +
      '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'shell\')" style="text-align:center;padding:22px">' +
        '<b style="font-size:1.05rem">Shell Space</b><small>' + money(p.shell) + ' (' + st.size + ' Stall)</small></label>' +
      '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'raw\')" style="text-align:center;padding:22px">' +
        '<b style="font-size:1.05rem">Raw Space</b><small>' + money(p.raw) + ' (' + st.size + ' Stall)</small></label>' +
    '</div>');
}

function showStallDetail(hallId, stallName, scheme) {
  const hall = sbZone(hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  const price = sbPrice(st, scheme);
  const row = (icon, val, label, color) =>
    '<div class="action-row" style="padding:9px 0"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">' + icon + '</span></span>' +
    '<div class="atext"><b' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</b><span>' + label + '</span></div></div>';
  openModal(st.chalet ? 'Chalet Detail' : 'Stall Detail',
    row('storefront', esc(st.name), 'Stall Name') +
    row('location_on', esc(hall.name), 'Yelahanka Air Force Station, Bengaluru') +
    row('straighten', st.sqm + ' sq.m (' + st.size + ')', 'Total Area') +
    row('check_circle', 'Available', 'Stall Status', 'var(--green)') +
    row('category', sbSchemeLabel(scheme), 'Category') +
    row('grid_view', esc(st.design), 'Stall Design') +
    row('payments', money(price), 'Base Price (excl. corner charges & GST)'),
    '<button class="btn btn-outline" onclick="openStallDetail(\'' + hallId + '\',\'' + stallName + '\')">Back</button>' +
    '<button class="btn btn-primary" onclick="sbSelectStall(\'' + hallId + '\',\'' + stallName + '\',\'' + scheme + '\')"><span class="material-symbols-outlined">check_circle</span>Select Stall</button>');
}

function sbSelectStall(hallId, stallName, scheme) {
  const hall = sbZone(hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  if (!window.__sbSel.some((s) => s.hall === hallId && s.name === stallName)) {
    window.__sbSel.push({
      hall: hallId, name: st.name, size: st.size, sqm: st.sqm,
      design: st.design, sides: st.sides, scheme: scheme, price: sbPrice(st, scheme),
    });
  }
  closeModal(); render();
  toast(st.name + ' added to your selection.', 'success');
}

/* ---------------- Reserve & Add to Cart ----------------
   Every selected stall becomes its OWN application (own application
   number, own proforma invoice, own 21-day clock, own payment). */
function sbCartItem(r) {
  return { id: uid('cart'), type: 'space', refId: r.id,
    label: 'Stall ' + r.stalls[0].name + ' · ' + sbZoneLabel(r.stalls[0].hall) + ' — Application ' + r.no,
    sub: r.piNo + ' · valid till ' + sbpDate(r.holdUntil), amount: r.amount };
}
function sbReserve() {
  if (!window.__sbSel.length) return;
  const booked = sbBookedSet();
  const clash = window.__sbSel.find((s) => booked[s.hall + '|' + s.name]);
  if (clash) { toast(clash.name + ' is no longer available — remove it from the selection.', 'error'); return; }
  const created = [];
  window.__sbSel.forEach((s, i) => {
    const pricing = sbpPrice([s], sbCreditAvailable());
    S.seq.pi = (S.seq.pi || 0) + 1;
    const nowIso = new Date().toISOString();
    const r = {
      id: 'sbr_' + Date.now() + '_' + i,
      no: '#' + String(10000000 + Math.floor(Math.random() * 89999999)),
      piNo: 'PI-AI27-' + pad(S.seq.pi, 4),
      type: s.hall === 'CH' ? 'Chalet' : 'Pre-defined Space',
      stalls: [s],
      pricing: pricing,
      amount: pricing.payable,
      status: 'reserved', // reserved → payment_under_verification → confirmed · expired / released
      createdAt: nowStr(), createdAtIso: nowIso,
      holdUntil: sbpHoldUntil(Date.now(), SBP_HOLD_DAYS),
      extensions: [], reminders: {}, payment: null,
    };
    S.spaceBooking.reservations.unshift(r);
    S.cart.push(sbCartItem(r));
    created.push(r);
  });
  window.__sbSel = [];
  window.__sbLast = created.map((r) => r.id);
  sbNotify('shopping_cart', 'var(--blue)', created.length + ' stall application(s) created — ' + created.map((r) => r.stalls[0].name).join(', ') + ' held in your cart till ' + sbpDate(created[0].holdUntil) + '. Pay 100% of each to confirm.', true);
  save();
  location.hash = '#/space-booking/success';
}

function viewBookingSuccess() {
  const ids = window.__sbLast || [];
  const list = ids.map(sbRes).filter(Boolean);
  if (!list.length) { location.hash = '#/space-booking/my'; return ''; }
  const total = list.reduce((a, r) => a + r.amount, 0);
  const rows = list.map((r) =>
    '<a class="sb-app-row" href="#/space-booking/application/' + r.id + '">' +
      '<span class="sb-app-ic"><span class="material-symbols-outlined">storefront</span></span>' +
      '<span class="sb-app-main"><b>' + esc(r.stalls[0].name) + ' · ' + esc(sbZoneLabel(r.stalls[0].hall)) + '</b><small>Application ' + esc(r.no) + ' · ' + esc(r.piNo) + ' · ' + esc(sbSchemeLabel(r.stalls[0].scheme)) + ' · ' + r.stalls[0].sqm + ' sq.m</small></span>' +
      '<span class="sb-app-amt">' + money(r.amount) + '<small>100% payable</small></span>' +
      '<span class="material-symbols-outlined" style="color:var(--muted)">chevron_right</span></a>').join('');
  return '<div class="card" style="max-width:680px;margin:40px auto;padding:34px 30px">' +
    '<div style="text-align:center"><span class="material-symbols-outlined" style="font-size:64px;color:var(--green)">add_shopping_cart</span>' +
    '<h1 class="page-title" style="margin-top:8px">' + list.length + ' Stall Application' + (list.length === 1 ? '' : 's') + ' Created</h1>' +
    '<p class="page-sub">Each stall is held for you till <b>' + sbpDate(list[0].holdUntil) + '</b> (' + SBP_HOLD_DAYS + ' days). Pay 100% of each application — online or offline against its proforma invoice — within this period; unpaid applications expire automatically.</p></div>' +
    '<div class="sb-app-list">' + rows + '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px">' +
      '<span style="font-size:0.86rem;color:var(--muted)">Total payable <b style="color:var(--ink)">' + money(total) + '</b></span>' +
      '<span style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<a class="btn btn-outline" href="#/space-booking/my"><span class="material-symbols-outlined">grid_view</span>My Spaces</a>' +
        '<button class="btn btn-primary" onclick="openCart()"><span class="material-symbols-outlined">shopping_cart</span>Open Cart &amp; Pay</button></span>' +
    '</div></div>';
}

/* ---------------- 21-day validity timeline ---------------- */
function sbTimeline(r, compact) {
  const start = new Date(r.createdAtIso || Date.now()).getTime();
  const end = new Date(r.holdUntil).getTime();
  const paused = r.status === 'payment_under_verification';
  const now = paused && r.pausedAt ? new Date(r.pausedAt).getTime() : (r.status === 'confirmed' && r.paidAtIso ? new Date(r.paidAtIso).getTime() : Date.now());
  const total = Math.max(1, end - start);
  const totalDays = Math.max(1, Math.round(total / 864e5));
  const pct = Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
  const left = sbpDaysLeft(r.holdUntil, now);
  const dayNo = Math.min(totalDays, Math.max(1, Math.floor((now - start) / 864e5) + 1));
  const cls = r.status === 'confirmed' ? 'done' : r.status === 'expired' || r.status === 'released' ? 'over'
    : paused ? 'paused' : left <= 1 ? 'late' : left <= 7 ? 'warn' : 'ok';
  const headL = r.status === 'confirmed' ? 'Paid on day ' + dayNo + ' of ' + totalDays
    : r.status === 'expired' ? 'Expired on ' + sbpDate(r.holdUntil)
    : r.status === 'released' ? 'Released' + (r.releasedAt ? ' ' + r.releasedAt : '')
    : 'Day ' + dayNo + ' of ' + totalDays + (paused ? ' · clock paused' : '');
  const headR = r.status === 'confirmed' ? 'Confirmed' : r.status === 'expired' || r.status === 'released' ? ''
    : (left <= 0 ? 'Expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + ' · till ' + sbpDate(r.holdUntil);
  const ticks = [7, 3, 1].map((d) => {
    const p = Math.max(0, Math.min(100, Math.round((1 - d / totalDays) * 100)));
    return '<b class="tick' + (r.reminders && r.reminders[d] ? ' hit' : '') + '" style="left:' + p + '%" title="Reminder T−' + d + ' · ' + sbpDate(new Date(end - d * 864e5).toISOString()) + '"></b>' +
      (compact ? '' : '<em class="tlbl" style="left:' + p + '%">T−' + d + '</em>');
  }).join('');
  return '<div class="sb-tl ' + cls + (compact ? ' compact' : '') + '">' +
    '<div class="sb-tl-head"><span>' + headL + '</span><span>' + headR + '</span></div>' +
    '<div class="sb-tl-track"><i class="fill" style="width:' + (cls === 'done' || cls === 'over' ? 100 : pct) + '%"></i>' + ticks +
      (cls === 'ok' || cls === 'warn' || cls === 'late' || cls === 'paused' ? '<span class="now" style="left:' + pct + '%" title="' + (paused ? 'Paused' : 'Today') + '"></span>' : '') + '</div>' +
    (compact ? '' : '<div class="sb-tl-foot"><span>Cart created ' + sbpDate(r.createdAtIso) + '</span><span>Expires ' + sbpDate(r.holdUntil) + ' · 23:59 IST</span></div>') +
  '</div>';
}

/* ---------------- payment outcomes ---------------- */
function sbCreateOrder(r, method, mode, ref) {
  if (!S.orders) S.orders = [];
  if (!S.seq.order) S.seq.order = 0;
  const order = {
    id: uid('order'), orderNo: 'ORD-2027-' + pad(S.seq.order, 4),
    type: 'space', label: 'Stall ' + r.stalls[0].name + ' — Application ' + r.no + ' · 100% payment',
    sub: r.piNo + ' · ' + method + (ref ? ' · Ref ' + ref : ''), refId: r.id,
    amount: r.amount, currency: 'INR', status: 'success', method: method, mode: mode, ref: ref || '',
    paidAt: nowStr(), paidAtIso: new Date().toISOString(), payer: EVENT.exhibitor,
  };
  S.orders.push(order);
  return order;
}
/* booth becomes CONFIRMED and feeds S.stalls (dashboard hero) */
function sbConfirm(r, payment, orderNo) {
  r.status = 'confirmed';
  r.paidAt = nowStr(); r.paidAtIso = new Date().toISOString();
  r.payment = Object.assign({}, r.payment || {}, payment || {});
  r.orderNo = orderNo || r.orderNo;
  r.stalls.forEach((st) => {
    if (!S.stalls.some((x) => x.stall === st.name)) {
      S.stalls.push({ id: 'st_' + st.name, hall: sbZoneLabel(st.hall), stall: st.name, area: st.sqm });
    }
  });
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  sbNotify('verified', 'var(--green)', 'Payment received — stall ' + r.stalls[0].name + ' confirmed (Application ' + r.no + '). Your tax invoice is available under My Orders.', true);
}
/* called from payCart() for cart items of type 'space' (whole-cart checkout) */
function sbOnlinePaid(resId, order) {
  const r = sbRes(resId);
  if (!r || r.status === 'confirmed') return;
  order.method = 'Card'; order.mode = 'online';
  sbConfirm(r, { mode: 'online', method: 'Card', ref: order.orderNo, date: nowStr(), amount: r.amount }, order.orderNo);
}

/* ---- pay ONE application online from its page (demo gateway) ---- */
const SB_ONLINE_METHODS = ['Card', 'Net Banking', 'UPI'];
function sbPayOnline(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') { toast('This application is not awaiting payment.', 'error'); return; }
  openModal('Pay Online · Application ' + esc(r.no),
    '<div class="sb-gw"><div class="sb-gw-sum"><span>Stall</span><b>' + esc(r.stalls[0].name) + ' · ' + esc(sbZoneLabel(r.stalls[0].hall)) + '</b></div>' +
      '<div class="sb-gw-sum"><span>Proforma invoice</span><b>' + esc(r.piNo) + '</b></div>' +
      '<div class="sb-gw-sum total"><span>Amount payable (100%)</span><b>' + money(r.amount) + '</b></div></div>' +
    '<label style="display:block;font-size:0.8rem;font-weight:700;margin:14px 0 8px">Payment method</label>' +
    '<div class="radio-cards" style="grid-template-columns:repeat(3,1fr)">' +
      SB_ONLINE_METHODS.map((m, i) => '<label class="radio-card' + (i === 0 ? ' selected' : '') + '" onclick="document.querySelectorAll(\'#sbGw .radio-card\').forEach(x=>x.classList.remove(\'selected\'));this.classList.add(\'selected\')"><input type="radio" name="sbGwM" value="' + m + '"' + (i === 0 ? ' checked' : '') + ' style="display:none"><b>' + m + '</b></label>').join('') + '</div>' +
    '<p style="font-size:0.74rem;color:var(--muted);margin:12px 0 0">Demo gateway — the full amount is charged in one transaction. A tax invoice is issued on success.</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="sbDoPayOnline(\'' + r.id + '\')"><span class="material-symbols-outlined">lock</span>Pay ' + money(r.amount) + '</button>');
  const m = $('modalOverlay'); if (m) m.querySelector('.modal-body').id = 'sbGw';
}
function sbDoPayOnline(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') return;
  const sel = document.querySelector('input[name="sbGwM"]:checked');
  const method = sel ? sel.value : 'Card';
  const order = sbCreateOrder(r, method, 'online', '');
  sbConfirm(r, { mode: 'online', method: method, ref: order.orderNo, date: nowStr(), amount: r.amount }, order.orderNo);
  save(); closeModal(); render();
  toast('Payment successful — stall ' + r.stalls[0].name + ' confirmed.', 'success');
}

/* exhibitor removes the application from the cart → stall released */
function sbCancelReservation(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') return false;
  if (!confirm('Remove application ' + r.no + ' (stall ' + r.stalls[0].name + ') from the cart? The stall will be released immediately.')) return false;
  r.status = 'released'; r.releasedAt = nowStr(); r.remark = 'Removed from cart by exhibitor';
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  save();
  sbNotify('remove_shopping_cart', 'var(--red)', 'Application ' + r.no + ' removed — stall ' + r.stalls[0].name + ' released.');
  return true;
}

/* ---- offline payment: upload proof → clock pauses until DEO verifies ---- */
function sbOpenOfflineForm(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') { toast('Offline payment proof can be uploaded only while the application is in your cart.', 'error'); return; }
  closeCart();
  const today = new Date().toISOString().slice(0, 10);
  openModal('Pay Offline — Upload Payment Proof · ' + esc(r.piNo),
    '<div class="note" style="margin-top:0"><b class="title">Bank transfer against proforma invoice ' + esc(r.piNo) + '</b>' +
      'Transfer <b>' + money(r.amount) + '</b> (100%) to DEO’s account quoting the PI number, then submit the details below. ' +
      'Your validity clock pauses until DEO verifies the receipt. <button class="btn-link" style="padding:0" onclick="downloadProformaInvoice(\'' + r.id + '\')">View bank details on the PI</button></div>' +
    '<form id="sbOffForm" onsubmit="return sbSubmitOffline(\'' + r.id + '\')" novalidate><div class="form-grid">' +
      '<div class="field"><label>Payment Method <span class="req">*</span></label><select id="offMethod">' +
        SB_OFFLINE_METHODS.map((m) => '<option>' + m + '</option>').join('') + '</select><div class="error"></div></div>' +
      '<div class="field"><label>UTR / Reference No. <span class="req">*</span></label><input type="text" id="offRef" placeholder="e.g. SBIN526012345678"><div class="error"></div></div>' +
      '<div class="field"><label>Payment Date <span class="req">*</span></label><input type="date" id="offDate" value="' + today + '" max="' + today + '"><div class="error"></div></div>' +
      '<div class="field"><label>Amount Transferred (₹) <span class="req">*</span></label><input type="number" id="offAmt" value="' + r.amount + '" min="1"><div class="error"></div></div>' +
      '<div class="field full"><label>Payment Proof (optional)</label><input type="file" id="offFile" accept=".pdf,.jpg,.jpeg,.png"><div class="hint">Bank advice / cheque copy / SWIFT MT103 — PDF or image.</div><div class="error"></div></div>' +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'sbOffForm\').requestSubmit()"><span class="material-symbols-outlined">upload</span>Submit for Verification</button>');
}
function sbSubmitOffline(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') return false;
  clearErrs($('sbOffForm'));
  let ok = true;
  const method = $('offMethod').value;
  const ref = $('offRef').value.trim();
  const date = $('offDate').value;
  const amt = Number($('offAmt').value);
  if (!ref) { setErr('offRef', 'UTR / reference number is required'); ok = false; }
  if (!date) { setErr('offDate', 'Payment date is required'); ok = false; }
  if (!amt || amt <= 0) { setErr('offAmt', 'Enter the amount transferred'); ok = false; }
  else if (amt < r.amount) { setErr('offAmt', '100% of the application (' + money(r.amount) + ') must be paid — part payments are not accepted'); ok = false; }
  if (!ok) return false;
  const f = $('offFile').files[0];
  r.payment = { mode: 'offline', method: method, ref: ref, date: date, amount: amt, fileName: f ? f.name : '', submittedAt: nowStr() };
  r.status = 'payment_under_verification';
  r.pausedAt = new Date().toISOString();
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  save(); closeModal(); render();
  sbNotify('hourglass_top', 'var(--blue)', 'Payment proof for ' + r.piNo + ' (' + method + ' · ' + ref + ') submitted. Your validity clock is paused until DEO verifies the receipt.');
  return false;
}

/* ---------------- shared pieces ---------------- */
const sbStallTitle = (r) => esc(r.stalls[0].name) + ' · ' + esc(sbZoneLabel(r.stalls[0].hall));
const sbStallMeta = (r) => esc(sbSchemeLabel(r.stalls[0].scheme)) + ' · ' + esc(r.stalls[0].size) + ' · ' + r.stalls[0].sqm + ' sq.m · ' + esc(r.stalls[0].sides) + ' open';
function sbPriceTable(p) {
  return '<div class="sb-price">' +
    sbSumRow('Base price', money(p.base)) +
    sbSumRow('Corner / open-side charges', money(p.side)) +
    sbSumRow('Subtotal', money(p.subtotal)) +
    sbSumRow('GST 18%', money(p.gst)) +
    sbSumRow('Grand total', money(p.grand)) +
    (p.credit ? sbSumRow('Registration amount adjusted', '− ' + money(p.credit)) : '') +
    '<div class="sb-price-total"><span>Net payable (100%)</span><b>' + money(p.payable) + '</b></div></div>';
}
/* action buttons for one application (list + detail) */
function sbActions(r, full) {
  const link = full ? '' : '<a class="btn btn-outline btn-sm" href="#/space-booking/application/' + r.id + '"><span class="material-symbols-outlined" style="font-size:16px">visibility</span>View</a>';
  if (r.status === 'reserved') return (full
    ? '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="sbPayOnline(\'' + r.id + '\')"><span class="material-symbols-outlined">lock</span>Pay Online · ' + money(r.amount) + '</button>' +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="sbOpenOfflineForm(\'' + r.id + '\')"><span class="material-symbols-outlined">upload_file</span>Pay Offline — Upload Proof</button>' +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Download Proforma Invoice</button>' +
      '<button class="btn-link danger" style="width:100%;justify-content:center" onclick="if(sbCancelReservation(\'' + r.id + '\'))location.hash=\'#/space-booking/my\'">Remove from cart &amp; release stall</button>'
    : '<a class="btn btn-primary btn-sm" href="#/space-booking/application/' + r.id + '"><span class="material-symbols-outlined" style="font-size:16px">lock</span>View &amp; Pay</a>');
  if (r.status === 'payment_under_verification') return (full
    ? '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Download Proforma Invoice</button>'
    : link);
  if (r.status === 'confirmed') return (full
    ? (r.orderNo ? '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="downloadOrderInvoice(\'' + esc(r.orderNo) + '\')"><span class="material-symbols-outlined">receipt_long</span>Download Tax Invoice</button>' : '') +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Proforma Invoice (records)</button>'
    : link);
  return (full
    ? '<a class="btn btn-primary" style="width:100%;justify-content:center" href="#/space-booking/hall/' + r.stalls[0].hall + '"><span class="material-symbols-outlined">replay</span>Book again</a>'
    : link + ' <a class="btn-link" href="#/space-booking/hall/' + r.stalls[0].hall + '">Book again</a>');
}
/* event history of one application */
function sbHistory(r) {
  const ev = [];
  ev.push(['add_shopping_cart', 'var(--blue)', 'Stall ' + r.stalls[0].name + ' reserved · application created · valid till ' + sbpDate(r.extensions && r.extensions.length ? r.extensions[0].from : r.holdUntil), r.createdAt]);
  if (r.payment && r.payment.submittedAt) ev.push(['upload_file', 'var(--blue)', 'Offline payment proof submitted — ' + r.payment.method + ' · Ref ' + r.payment.ref + ' · ' + money(r.payment.amount) + ' · clock paused', r.payment.submittedAt]);
  if (r.payment && r.payment.rejectedAt) ev.push(['rule', 'var(--red)', 'Proof not accepted by DEO — ' + (r.payment.remark || '') + ' · clock resumed', r.payment.rejectedAt]);
  (r.extensions || []).forEach((e) => ev.push(['more_time', 'var(--blue)', (e.reason === 'Simulated expiry (debug)' ? 'Validity moved to ' : 'Validity extended by DEO to ') + sbpDate(e.to) + (e.reason ? ' — ' + e.reason : ''), e.at || '']));
  if (r.status === 'confirmed') ev.push(['verified', 'var(--green)', '100% payment received (' + (r.payment ? (r.payment.mode === 'offline' ? 'Offline · ' + r.payment.method + (r.payment.verifiedBy ? ' · verified by ' + r.payment.verifiedBy : '') : 'Online · ' + (r.payment.method || 'Card')) : 'Online') + ') — stall confirmed' + (r.orderNo ? ' · ' + r.orderNo : ''), r.paidAt || '']);
  if (r.status === 'expired') ev.push(['timer_off', 'var(--red)', 'Validity lapsed — application expired, stall released', r.expiredAt || sbpDate(r.holdUntil)]);
  if (r.status === 'released') ev.push(['lock_open', 'var(--red)', 'Released — ' + (r.remark || 'stall returned to inventory'), r.releasedAt || '']);
  return ev.map((e) => '<div class="action-row" style="padding:8px 0"><span class="aicon" style="background:#F1F4FA;color:' + e[1] + '"><span class="material-symbols-outlined">' + e[0] + '</span></span>' +
    '<div class="atext"><b style="font-weight:600">' + esc(e[2]) + '</b><span>' + esc(e[3]) + '</span></div></div>').join('');
}
function sbStepper(r) {
  const steps = [['Reserved', 'Cart created · ' + sbpDate(r.createdAtIso)],
    ['Payment', r.status === 'payment_under_verification' ? 'Proof under verification' : r.status === 'confirmed' ? (r.payment && r.payment.mode === 'offline' ? 'Offline · verified' : 'Online · gateway') : '100% within ' + SBP_HOLD_DAYS + ' days'],
    ['Confirmed', r.status === 'confirmed' ? 'Paid ' + sbpDate(r.paidAtIso) : 'Tax invoice issued']];
  const idx = r.status === 'confirmed' ? 3 : r.status === 'payment_under_verification' ? 1 : r.status === 'reserved' ? 1 : -1;
  const dead = r.status === 'expired' || r.status === 'released';
  return '<div class="sb-steps' + (dead ? ' dead' : '') + '">' + steps.map((s, i) => {
    const st = dead ? (i === 0 ? 'done' : 'off') : i < idx ? 'done' : i === idx ? 'now' : 'off';
    return '<div class="sb-step ' + st + '"><span class="dot"><span class="material-symbols-outlined">' + (st === 'done' ? 'check' : st === 'now' ? (r.status === 'payment_under_verification' ? 'hourglass_top' : 'radio_button_checked') : 'circle') + '</span></span>' +
      '<b>' + s[0] + '</b><small>' + s[1] + '</small></div>';
  }).join('') + (dead ? '<div class="sb-step bad"><span class="dot"><span class="material-symbols-outlined">close</span></span><b>' + (r.status === 'expired' ? 'Expired' : 'Released') + '</b><small>' + (r.status === 'expired' ? sbpDate(r.holdUntil) : esc(r.releasedAt || '')) + '</small></div>' : '') + '</div>';
}

/* ---------------- VIEW · Application detail (one stall) ---------------- */
function viewApplication(id) {
  sbTick();
  const r = sbRes(id);
  if (!r) { location.hash = '#/space-booking/my'; return ''; }
  const s = r.stalls[0];
  const left = sbpDaysLeft(r.holdUntil);
  const pay = r.status === 'reserved'
    ? '<div class="sb-due"><small>AMOUNT DUE · 100%</small><b>' + money(r.amount) + '</b><span>by ' + sbpDate(r.holdUntil) + ' · ' + (left <= 0 ? 'expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '</span></div>' +
      (r.payment && r.payment.rejectedAt ? '<div class="note" style="border-left-color:var(--red);margin:10px 0"><b class="title" style="color:var(--red)">Earlier proof not accepted</b>' + esc(r.payment.remark || '') + ' (' + esc(r.payment.method) + ' · ' + esc(r.payment.ref) + ', ' + esc(r.payment.rejectedAt) + '). Pay online or upload a fresh proof.</div>' : '') +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>' +
      '<p style="font-size:0.74rem;color:var(--muted);margin:10px 0 0">Offline: NEFT / RTGS / Cheque / DD / SWIFT to DEO’s account quoting ' + esc(r.piNo) + '. Uploading the proof pauses the ' + SBP_HOLD_DAYS + '-day clock until DEO verifies.</p>'
    : r.status === 'payment_under_verification'
    ? '<div class="sb-due blue"><small>UNDER VERIFICATION</small><b>' + money(r.payment.amount) + '</b><span>' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) + '</span></div>' +
      '<div class="pkv" style="grid-template-columns:1fr 1fr;gap:10px 14px;margin:12px 0">' +
        '<div class="cell"><div class="k">Payment date</div><div class="v">' + esc(r.payment.date) + '</div></div>' +
        '<div class="cell"><div class="k">Submitted</div><div class="v">' + esc(r.payment.submittedAt) + '</div></div>' +
        '<div class="cell full"><div class="k">Proof file</div><div class="v">' + (r.payment.fileName ? esc(r.payment.fileName) : '<span style="color:var(--muted)">not attached</span>') + '</div></div></div>' +
      '<div class="note" style="margin:0 0 10px"><b class="title">Validity clock paused</b>DEO will confirm the stall once the amount is received in its account. You will be notified of the result.</div>' +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>'
    : r.status === 'confirmed'
    ? '<div class="sb-due green"><small>PAID · 100%</small><b>' + money(r.amount) + '</b><span>' + esc(r.paidAt || '') + (r.payment ? ' · ' + (r.payment.mode === 'offline' ? 'Offline · ' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) : 'Online · ' + esc(r.payment.method || 'Card')) : '') + '</span></div>' +
      (r.orderNo ? '<div class="pkv" style="grid-template-columns:1fr 1fr;gap:10px 14px;margin:12px 0"><div class="cell"><div class="k">Order</div><div class="v regno">' + esc(r.orderNo) + '</div></div><div class="cell"><div class="k">Tax invoice</div><div class="v regno">' + esc(r.orderNo.replace('ORD-', 'INV-')) + '</div></div></div>' : '') +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>'
    : '<div class="sb-due red"><small>' + (r.status === 'expired' ? 'EXPIRED' : 'RELEASED') + '</small><b>' + money(r.amount) + '</b><span>' + (r.status === 'expired' ? 'validity lapsed on ' + sbpDate(r.holdUntil) : esc(r.remark || '')) + '</span></div>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:10px 0">No payment was received against this application. The stall is back in inventory — you can book it again if it is still available.</p>' +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>';

  return '<a class="back-link" href="#/space-booking/my"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>My Spaces</a>' +
    '<div class="card-head-row" style="align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px"><div>' +
      '<h1 class="page-title" style="margin-bottom:4px">Application ' + esc(r.no) + '</h1>' +
      '<p class="page-sub" style="margin:0">Stall <b>' + sbStallTitle(r) + '</b> · Proforma invoice <span class="regno">' + esc(r.piNo) + '</span> · created ' + esc(r.createdAt) + '</p></div>' +
      '<div style="display:flex;gap:8px"><span class="pill gray">' + esc(r.type) + '</span>' + sbStatusPill(r.status) + '</div></div>' +
    '<div class="card" style="margin-bottom:16px">' + sbStepper(r) + '</div>' +
    '<div class="prof-layout" style="grid-template-columns:minmax(0,1fr) 340px"><div>' +
      '<div class="card" style="margin-bottom:16px"><div class="card-head-row"><h2 class="card-title">Validity — ' + SBP_HOLD_DAYS + '-day hold</h2>' +
          (r.extensions && r.extensions.length ? '<span class="pill blue">Extended by DEO</span>' : '') + '</div>' + sbTimeline(r, false) +
        (r.extensions && r.extensions.length ? '<div style="margin-top:10px;font-size:0.8rem;color:var(--muted)">' + r.extensions.map((e) => 'Extended to <b>' + sbpDate(e.to) + '</b>' + (e.reason ? ' — ' + esc(e.reason) : '') + ' <span style="opacity:.7">(' + esc(e.at || '') + ')</span>').join('<br>') + '</div>' : '') + '</div>' +
      '<div class="card" style="margin-bottom:16px"><div class="pcard-head" style="margin-bottom:10px"><span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">storefront</span></span><h2 class="card-title">Stall Details</h2></div>' +
        '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
          '<div class="cell"><div class="k">Stall / Booth</div><div class="v">' + esc(s.name) + '</div></div>' +
          '<div class="cell"><div class="k">Hall / Zone</div><div class="v">' + esc(sbZoneLabel(s.hall)) + '</div></div>' +
          '<div class="cell"><div class="k">Scheme</div><div class="v">' + esc(sbSchemeLabel(s.scheme)) + '</div></div>' +
          '<div class="cell"><div class="k">Size / Area</div><div class="v">' + esc(s.size) + ' · ' + s.sqm + ' sq.m</div></div>' +
          '<div class="cell"><div class="k">Open sides</div><div class="v">' + esc(s.sides) + '</div></div>' +
          '<div class="cell"><div class="k">Stall design</div><div class="v">' + esc(s.design || '—') + '</div></div>' +
          '<div class="cell"><div class="k">Venue</div><div class="v">Yelahanka Air Force Station, Bengaluru</div></div>' +
          '<div class="cell"><div class="k">Base price</div><div class="v">' + money(s.price) + '</div></div>' +
        '</div>' +
        '<div style="margin-top:12px"><a class="btn-link" style="padding:0" href="#/space-booking/hall/' + s.hall + '">View hall layout →</a></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="pcard-head" style="margin-bottom:10px"><span class="icon-sq" style="background:var(--green-soft);color:var(--green)"><span class="material-symbols-outlined">payments</span></span><h2 class="card-title">Price Break-up · ' + esc(r.piNo) + '</h2></div>' +
        sbPriceTable(r.pricing) +
        '<p style="font-size:0.74rem;color:var(--muted);margin:10px 0 0">GST @ 18% on base + corner charges. The registration amount already paid is adjusted once, on your earliest live application. Net payable is a single 100% payment — no instalments.</p></div>' +
      '<div class="card"><h2 class="card-title">History</h2>' + sbHistory(r) + '</div>' +
    '</div><div>' +
      '<div class="card sb-paycard" style="margin-bottom:16px"><h2 class="card-title">Payment</h2>' + pay + '</div>' +
      '<div class="card"><h2 class="card-title">Need help?</h2><p style="font-size:0.8rem;color:var(--muted);margin:6px 0 0">Validity can be extended by DEO case by case before expiry. Raise a query under <b>Payments &amp; Orders</b> from the help desk, quoting application ' + esc(r.no) + '.</p></div>' +
    '</div></div>';
}

/* ---------------- VIEW · My Spaces (listing) ---------------- */
window.__sbFilter = window.__sbFilter || '';
function viewMySpaces() {
  sbTick();
  const all = S.spaceBooking.reservations;
  const hasConfirmed = all.some((r) => r.status === 'confirmed') || S.stalls.length > 0;
  const f = window.__sbFilter;
  const list = f ? all.filter((r) => r.status === f) : all;
  const count = (st) => all.filter((r) => r.status === st).length;

  const hero = hasConfirmed ? '' :
    '<div class="hero-space" style="margin-bottom:18px"><span class="material-symbols-outlined watermark">storefront</span>' +
      '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
        '<h2 style="margin-top:0">Welcome to exhibition management</h2>' +
        '<p style="margin:8px 0 0;font-size:0.86rem;color:#CBDBF9">You haven’t booked a space yet. Select stalls, hold them in your cart and pay within ' + SBP_HOLD_DAYS + ' days to confirm.</p>' +
      '</div><div class="hero-actions"><a class="btn-hero" href="#/space-booking/book">Secure Your Space</a></div></div></div>';

  const chips = [['', 'All'], ['reserved', 'In Cart'], ['payment_under_verification', 'Under Verification'], ['confirmed', 'Confirmed'], ['expired', 'Expired'], ['released', 'Released']]
    .filter(([v]) => !v || count(v)).map(([v, l]) =>
      '<button class="chip' + (f === v ? ' on' : '') + '" onclick="window.__sbFilter=\'' + v + '\';render()">' + l + (v ? ' <b>' + count(v) + '</b>' : ' <b>' + all.length + '</b>') + '</button>').join('');

  const rows = list.map((r) =>
    '<tr class="sb-row" onclick="location.hash=\'#/space-booking/application/' + r.id + '\'">' +
      '<td><span class="regno" style="color:var(--blue);font-weight:800">' + esc(r.no) + '</span><span class="td-sub">' + esc(r.piNo) + ' · ' + esc(r.createdAt.split(',')[0]) + '</span></td>' +
      '<td><span class="td-strong">' + sbStallTitle(r) + '</span><span class="td-sub">' + sbStallMeta(r) + '</span></td>' +
      '<td class="money">' + money(r.amount) + '<span class="td-sub">100% · single payment</span></td>' +
      '<td style="min-width:230px">' + sbTimeline(r, true) + '</td>' +
      '<td>' + sbStatusPill(r.status) + '</td>' +
      '<td onclick="event.stopPropagation()" style="white-space:nowrap">' + sbActions(r, false) + '</td></tr>').join('') ||
    '<tr><td colspan="6" style="color:var(--muted);padding:26px;text-align:center">' + (all.length ? 'No applications with this status.' : 'No applications yet — select stalls from Book Space; each stall becomes its own application held in your cart for ' + SBP_HOLD_DAYS + ' days.') + '</td></tr>';

  const table = '<div class="card sba-card" style="padding:0">' +
    '<div class="card-head-row" style="padding:14px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px"><div class="filter-chips" style="margin:0">' + chips + '</div>' +
      '<a class="btn btn-primary btn-sm" href="#/space-booking/book"><span class="material-symbols-outlined" style="font-size:16px">add</span>Book Space</a></div>' +
    '<div class="tablewrap"><table class="grid sb-table"><tr><th>Application</th><th>Stall</th><th>Net Payable</th><th>' + SBP_HOLD_DAYS + '-day Validity</th><th>Status</th><th>Action</th></tr>' + rows + '</table></div>' +
    '<div style="padding:10px 16px;font-size:0.76rem;color:var(--muted);border-top:1px solid var(--line)">Timeline: <i class="sb-key ok"></i> on track · <i class="sb-key warn"></i> within 7 days of expiry · <i class="sb-key late"></i> expires within a day · <i class="sb-key paused"></i> paused (proof under verification) · ticks = reminders at T−7 / T−3 / T−1</div></div>';

  /* summary tiles */
  const outstanding = all.filter((r) => r.status === 'reserved').reduce((x, r) => x + r.amount, 0);
  const underVerif = all.filter((r) => r.status === 'payment_under_verification').reduce((x, r) => x + r.amount, 0);
  const paid = all.filter((r) => r.status === 'confirmed').reduce((x, r) => x + r.amount, 0);
  const soonest = all.filter((r) => r.status === 'reserved').sort((a, b) => new Date(a.holdUntil) - new Date(b.holdUntil))[0];
  const tiles = all.length ? '<div class="tiles" style="margin-bottom:14px">' +
      '<div class="tile' + (outstanding ? '' : ' accent') + '"><div class="t-label">Outstanding · In Cart</div><div class="t-value" style="color:' + (outstanding ? 'var(--red)' : 'var(--green)') + '">' + money(outstanding) + '</div>' +
        '<div class="t-sub">' + (soonest ? count('reserved') + ' application(s) · earliest expiry ' + sbpDate(soonest.holdUntil) : 'nothing due') + '</div>' +
        (outstanding ? '<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Open Cart</button>' : '') + '</div>' +
      '<div class="tile blue"><div class="t-label">Under Verification</div><div class="t-value">' + count('payment_under_verification') + '</div><div class="t-sub">' + (underVerif ? money(underVerif) + ' · clock paused until DEO verifies' : 'no offline proofs pending') + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Confirmed Stalls</div><div class="t-value">' + count('confirmed') + '</div><div class="t-sub">' + money(paid) + ' paid · 100% received</div></div>' +
      '<div class="tile"><div class="t-label">Expired / Released</div><div class="t-value">' + (count('expired') + count('released')) + '</div><div class="t-sub">stalls returned to inventory</div></div>' +
    '</div>' : '';
  const how = '<div class="card" style="margin-top:16px"><h2 class="card-title">How it works</h2><ol class="sb-how">' +
      '<li><b>Select</b> stalls on the hall layout — each becomes its own application in your cart.</li>' +
      '<li><b>Hold</b> — the stall is reserved for ' + SBP_HOLD_DAYS + ' days from cart creation; download the proforma invoice.</li>' +
      '<li><b>Pay 100%</b> online from the application page, or offline (NEFT / RTGS / Cheque / SWIFT) and upload the proof — the clock pauses until DEO verifies.</li>' +
      '<li><b>Confirmed</b> — on receipt the stall is confirmed and a tax invoice issued. Unpaid applications expire automatically; DEO may extend validity before expiry.</li></ol></div>';

  return '<h1 class="page-title">My Spaces</h1>' +
    '<p class="page-sub">Your stall applications, ' + SBP_HOLD_DAYS + '-day validity and payment status — one application, one proforma invoice and one 100% payment per stall.</p>' +
    hero + tiles + table + how +
    '<div class="footer-tools"><button onclick="sbClearApplications()">Clear all applications</button><button onclick="resetDemo()">Reset demo data</button></div>';
}

/* ---------------- routes ---------------- */
ROUTES['space-booking/my'] = viewMySpaces;
ROUTES['space-booking/book'] = viewBookSpace;
ROUTES['space-booking/success'] = viewBookingSuccess;
