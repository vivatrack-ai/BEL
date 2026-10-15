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
  save();
})();

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

/* ---------------- Reserve & Add to Cart ---------------- */
function sbCartItem(r) {
  return { id: uid('cart'), type: 'space', refId: r.id,
    label: 'Space Reservation ' + r.piNo + ' — 100% payment',
    sub: r.stalls.map((s) => s.name).join(', ') + ' · valid till ' + sbpDate(r.holdUntil), amount: r.amount };
}
function sbReserve() {
  if (!window.__sbSel.length) return;
  const booked = sbBookedSet();
  const clash = window.__sbSel.find((s) => booked[s.hall + '|' + s.name]);
  if (clash) { toast(clash.name + ' is no longer available — remove it from the selection.', 'error'); return; }
  const pricing = sbpPrice(window.__sbSel, sbCreditAvailable());
  S.seq.pi = (S.seq.pi || 0) + 1;
  const nowIso = new Date().toISOString();
  const r = {
    id: 'sbr_' + Date.now(),
    no: '#' + String(10000000 + Math.floor(Math.random() * 89999999)),
    piNo: 'PI-AI27-' + pad(S.seq.pi, 4),
    type: window.__sbSel.every((s) => s.hall === 'CH') ? 'Chalet' : 'Pre-defined Space',
    stalls: window.__sbSel.slice(),
    pricing: pricing,
    amount: pricing.payable,
    status: 'reserved', // reserved → payment_under_verification → confirmed · expired / released
    createdAt: nowStr(), createdAtIso: nowIso,
    holdUntil: sbpHoldUntil(Date.now(), SBP_HOLD_DAYS),
    extensions: [], reminders: {}, payment: null,
  };
  S.spaceBooking.reservations.unshift(r);
  S.cart.push(sbCartItem(r));
  window.__sbSel = [];
  window.__sbLast = r.id;
  sbNotify('shopping_cart', 'var(--blue)', 'Stalls ' + r.stalls.map((s) => s.name).join(', ') + ' reserved in your cart (' + r.piNo + '). Pay ' + money(r.amount) + ' by ' + sbpDate(r.holdUntil) + ' to confirm.', true);
  save();
  location.hash = '#/space-booking/success';
}

function viewBookingSuccess() {
  const r = sbRes(window.__sbLast) || S.spaceBooking.reservations.find((x) => x.status === 'reserved');
  if (!r) { location.hash = '#/space-booking/my'; return ''; }
  return '<div class="card" style="max-width:600px;margin:50px auto;text-align:center;padding:40px 30px">' +
    '<span class="material-symbols-outlined" style="font-size:64px;color:var(--green)">add_shopping_cart</span>' +
    '<h1 class="page-title" style="margin-top:10px">Stalls Reserved &amp; Added to Cart</h1>' +
    '<p class="page-sub">' + esc(r.stalls.map((s) => s.name).join(', ')) + ' are held for you till <b>' + sbpDate(r.holdUntil) + '</b> (' + SBP_HOLD_DAYS + ' days). ' +
      'Pay <b>' + money(r.amount) + '</b> (100%) online or offline against proforma invoice <b>' + esc(r.piNo) + '</b> within this period — unpaid reservations are released automatically.</p>' +
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">' +
      '<button class="btn btn-primary" onclick="openCart()"><span class="material-symbols-outlined">lock</span>Pay Now</button>' +
      '<button class="btn btn-outline" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Download Proforma Invoice</button>' +
      '<a class="btn btn-outline" href="#/space-booking/my"><span class="material-symbols-outlined">grid_view</span>My Spaces</a>' +
    '</div></div>';
}

/* ---------------- payment outcomes ---------------- */
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
  sbNotify('verified', 'var(--green)', 'Payment received — ' + r.stalls.map((s) => s.name).join(', ') + ' confirmed (' + r.piNo + '). Your tax invoice is available under My Orders.', true);
}
/* called from payCart() for cart items of type 'space' (online gateway) */
function sbOnlinePaid(resId, order) {
  const r = sbRes(resId);
  if (!r || r.status === 'confirmed') return;
  order.method = 'Card'; order.mode = 'online';
  sbConfirm(r, { mode: 'online', method: 'Card', ref: order.orderNo, date: nowStr(), amount: r.amount }, order.orderNo);
}

/* exhibitor removes the reservation from the cart → stalls released */
function sbCancelReservation(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') return false;
  if (!confirm('Remove reservation ' + r.piNo + ' from the cart? The stalls ' + r.stalls.map((s) => s.name).join(', ') + ' will be released immediately.')) return false;
  r.status = 'released'; r.releasedAt = nowStr(); r.remark = 'Removed from cart by exhibitor';
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  save();
  sbNotify('remove_shopping_cart', 'var(--red)', 'Reservation ' + r.piNo + ' removed — stalls released.');
  return true;
}

/* ---- offline payment: upload proof → clock pauses until DEO verifies ---- */
function sbOpenOfflineForm(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') { toast('Offline payment proof can be uploaded only while the reservation is in your cart.', 'error'); return; }
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
  else if (amt < r.amount) { setErr('offAmt', '100% of the cart (' + money(r.amount) + ') must be paid — part payments are not accepted'); ok = false; }
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

/* ---------------- VIEW · My Spaces ---------------- */
function viewMySpaces() {
  sbTick();
  const list = S.spaceBooking.reservations;
  const hasConfirmed = list.some((r) => r.status === 'confirmed') || S.stalls.length > 0;

  const hero = hasConfirmed ? '' :
    '<div class="hero-space" style="margin-bottom:18px"><span class="material-symbols-outlined watermark">storefront</span>' +
      '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
        '<h2 style="margin-top:0">Welcome to exhibition management</h2>' +
        '<p style="margin:8px 0 0;font-size:0.86rem;color:#CBDBF9">You haven’t booked a space yet. Select stalls, hold them in your cart and pay within ' + SBP_HOLD_DAYS + ' days to confirm.</p>' +
      '</div><div class="hero-actions"><a class="btn-hero" href="#/space-booking/book">Secure Your Space</a></div></div></div>';

  const cards = list.map((r) => {
    const p = r.pricing || { base: r.amount, side: 0, subtotal: r.amount, gst: 0, grand: r.amount, credit: 0, payable: r.amount };
    const left = sbpDaysLeft(r.holdUntil);
    const stallNames = r.stalls.map((s) => esc(s.name)).join(', ');
    const validity = r.status === 'reserved'
      ? '<div class="note amber" style="margin-top:12px"><b class="title"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">timer</span> Valid till ' + sbpDate(r.holdUntil) + ' · ' + (left <= 0 ? 'expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '</b>' +
          'Pay <b>' + money(r.amount) + '</b> (100% of the cart) by this date to confirm your stalls. Online via the cart, or offline by NEFT / RTGS / Cheque / SWIFT against the proforma invoice — upload the proof here once transferred.' +
          (r.extensions && r.extensions.length ? '<div style="margin-top:6px;font-size:0.78rem">Validity extended by DEO ' + r.extensions.map((e) => 'to ' + sbpDate(e.to) + (e.reason ? ' (' + esc(e.reason) + ')' : '')).join(', ') + '.</div>' : '') + '</div>'
      : r.status === 'payment_under_verification'
      ? '<div class="note" style="margin-top:12px"><b class="title"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">hourglass_top</span> Payment proof under verification · validity clock paused</b>' +
          esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) + ' · ' + esc(r.payment.date) + ' · ' + money(r.payment.amount) + (r.payment.fileName ? ' · ' + esc(r.payment.fileName) : '') + ' · submitted ' + esc(r.payment.submittedAt) +
          '. DEO will confirm the stalls once the amount is received in its account.</div>'
      : r.status === 'confirmed'
      ? '<div class="note green" style="margin-top:12px"><b class="title"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">verified</span> Confirmed · paid ' + esc(r.paidAt || '') + '</b>' +
          (r.payment ? (r.payment.mode === 'offline' ? 'Offline · ' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) : 'Online · Card') + ' · ' : '') + '100% received. The booth now shows on your dashboard.' +
          (r.payment && r.payment.remark ? ' <span style="color:var(--muted)">' + esc(r.payment.remark) + '</span>' : '') + '</div>'
      : r.status === 'expired'
      ? '<div class="note" style="margin-top:12px;border-left-color:var(--red);background:var(--red-soft)"><b class="title" style="color:var(--red)">Expired on ' + sbpDate(r.holdUntil) + '</b>' +
          'The ' + SBP_HOLD_DAYS + '-day validity lapsed without full payment and the stalls were released back to inventory. <a href="#/space-booking/book" style="font-weight:700">Book again →</a></div>'
      : '<div class="note" style="margin-top:12px;border-left-color:var(--red);background:var(--red-soft)"><b class="title" style="color:var(--red)">Released</b>' +
          (r.remark ? esc(r.remark) + '. ' : '') + 'The stalls are back in inventory. <a href="#/space-booking/book" style="font-weight:700">Book again →</a></div>';

    const rejected = r.status === 'reserved' && r.payment && r.payment.rejectedAt
      ? '<div class="note" style="margin-top:10px;border-left-color:var(--red)"><b class="title" style="color:var(--red)">Payment proof not accepted</b>' + esc(r.payment.remark || 'DEO could not trace the payment.') +
        ' (' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) + ', reviewed ' + esc(r.payment.rejectedAt) + '). The validity clock resumed from where it paused — pay online or upload a fresh proof.</div>' : '';

    const actions =
      (r.status === 'reserved'
        ? '<button class="btn btn-primary btn-sm" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">lock</span>Pay Online</button>' +
          '<button class="btn btn-outline btn-sm" onclick="sbOpenOfflineForm(\'' + r.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">upload_file</span>Pay Offline — Upload Proof</button>'
        : '') +
      (['reserved', 'payment_under_verification', 'confirmed'].includes(r.status)
        ? '<button class="btn btn-outline btn-sm" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">description</span>Proforma Invoice</button>' : '') +
      (r.status === 'confirmed' && r.orderNo
        ? '<button class="btn btn-outline btn-sm" onclick="downloadOrderInvoice(\'' + esc(r.orderNo) + '\')"><span class="material-symbols-outlined" style="font-size:16px">receipt_long</span>Tax Invoice</button>' : '') +
      (r.status === 'reserved'
        ? '<button class="btn-link danger" onclick="if(sbCancelReservation(\'' + r.id + '\'))render()">Remove from cart</button>' : '');

    return '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-head-row" style="margin-bottom:8px">' +
        '<div><b style="color:var(--blue)">' + esc(r.piNo) + '</b><span style="font-size:0.76rem;color:var(--muted);margin-left:8px">Cart created ' + esc(r.createdAt) + '</span></div>' +
        '<div style="display:flex;gap:8px"><span class="pill gray">' + esc(r.type) + '</span>' + sbStatusPill(r.status) + '</div></div>' +
      '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">' +
        '<div class="cell"><div class="k">Stall Name</div><div class="v">' + stallNames + '</div></div>' +
        '<div class="cell"><div class="k">Stall Area</div><div class="v">' + r.stalls.map((s) => s.size).join(', ') + ' / ' + r.stalls.reduce((x, s) => x + s.sqm, 0) + ' m²</div></div>' +
        '<div class="cell"><div class="k">Scheme</div><div class="v">' + r.stalls.map((s) => sbSchemeLabel(s.scheme)).join(', ') + '</div></div>' +
        '<div class="cell"><div class="k">Open Sides</div><div class="v">' + esc(r.stalls[0].sides) + '</div></div>' +
        '<div class="cell"><div class="k">Net Payable (100%)</div><div class="v">' + money(r.amount) + '</div></div>' +
      '</div>' +
      '<details style="margin-top:10px;font-size:0.8rem"><summary style="cursor:pointer;color:var(--blue);font-weight:700">Price break-up</summary>' +
        '<div style="max-width:420px;margin-top:6px">' + sbSumRow('Base price', money(p.base)) + sbSumRow('Corner / open-side charges', money(p.side)) +
        sbSumRow('Subtotal', money(p.subtotal)) + sbSumRow('GST 18%', money(p.gst)) + sbSumRow('Grand total', money(p.grand)) +
        (p.credit ? sbSumRow('Registration amount adjusted', '− ' + money(p.credit)) : '') + sbSumRow('<b>Net payable</b>', '<b>' + money(p.payable) + '</b>') + '</div></details>' +
      validity + rejected +
      (actions ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">' + actions + '</div>' : '') +
    '</div>';
  }).join('') ||
    '<div class="card"><div class="empty"><span class="material-symbols-outlined">grid_view</span>' +
    '<h3>No reservations yet</h3><p>Select stalls from Book Space — they are held in your cart for ' + SBP_HOLD_DAYS + ' days while you complete the payment.</p>' +
    '<a class="btn btn-primary" href="#/space-booking/book">Book Space</a></div></div>';

  /* right rail */
  const actions = [];
  list.forEach((r) => {
    if (r.status === 'reserved') {
      const left = sbpDaysLeft(r.holdUntil);
      actions.push(['timer', 'Pay ' + money(r.amount) + ' by ' + sbpDate(r.holdUntil), r.piNo + ' · ' + (left <= 0 ? 'expires today' : left + ' day(s) left') + ' · online or offline']);
    } else if (r.status === 'payment_under_verification') actions.push(['hourglass_top', 'Awaiting DEO verification', r.piNo + ' · ' + r.payment.method + ' · ' + money(r.payment.amount)]);
  });
  const outstanding = list.filter((r) => r.status === 'reserved').reduce((x, r) => x + r.amount, 0);
  const underVerif = list.filter((r) => r.status === 'payment_under_verification').reduce((x, r) => x + r.amount, 0);
  const rail =
    '<div>' +
    '<div class="card" style="margin-bottom:14px"><h2 class="card-title">Upcoming Actions</h2>' +
      (actions.map((x) =>
        '<div class="action-row"><span class="aicon"><span class="material-symbols-outlined">' + x[0] + '</span></span>' +
        '<div class="atext"><b>' + x[1] + '</b><span>' + x[2] + '</span></div></div>').join('') ||
        '<p style="font-size:0.82rem;color:var(--muted);margin:6px 0 0">No upcoming actions right now.</p>') + '</div>' +
    '<div class="card" style="margin-bottom:14px"><h2 class="card-title">Total Outstanding Payment</h2>' +
      (list.length === 0
        ? '<p style="font-size:0.82rem;color:var(--muted)">Your payment details will appear here once you reserve a space.</p>'
        : outstanding
          ? '<div style="font-size:1.5rem;font-weight:800;color:var(--red);margin-top:6px">' + money(outstanding) + '</div><p style="font-size:0.76rem;color:var(--muted);margin:2px 0 0">across ' + list.filter((r) => r.status === 'reserved').length + ' reservation(s) in cart · 100% due within validity</p>'
          : '<div style="font-size:1.5rem;font-weight:800;color:var(--green);margin-top:6px">₹0</div><p style="font-size:0.76rem;color:var(--muted);margin:2px 0 0">No outstanding payment.</p>') +
      (underVerif ? '<p style="font-size:0.78rem;color:var(--blue);margin:8px 0 0;font-weight:700">' + money(underVerif) + ' under verification</p>' : '') + '</div>' +
    '<div class="card"><div class="card-head-row" style="margin-bottom:8px"><h2 class="card-title">Updates</h2></div>' +
      [['check_circle', 'var(--green)', 'Stall inventory refreshed for Halls A–E.', '2 days ago'],
       ['warning', 'var(--amber)', 'Reservations unpaid after ' + SBP_HOLD_DAYS + ' days are released automatically.', '4 days ago'],
       ['campaign', 'var(--blue)', 'New circular released: Exhibitor Guidelines.', '1 week ago']].map((u) =>
        '<div class="action-row" style="padding:9px 0"><span class="aicon" style="background:#F1F4FA;color:' + u[1] + '"><span class="material-symbols-outlined">' + u[0] + '</span></span>' +
        '<div class="atext"><b style="font-weight:600">' + u[2] + '</b><span>' + u[3] + '</span></div></div>').join('') + '</div>' +
    '</div>';

  return '<h1 class="page-title">My Spaces</h1>' +
    '<p class="page-sub">Your stall reservations, cart validity and payment status — 100% payment within ' + SBP_HOLD_DAYS + ' days of cart creation confirms the booth.</p>' +
    hero +
    '<div class="prof-layout"><div><h2 class="card-title" style="margin-bottom:10px">My Reservations</h2>' + cards + '</div>' + rail + '</div>';
}

/* ---------------- routes ---------------- */
ROUTES['space-booking/my'] = viewMySpaces;
ROUTES['space-booking/book'] = viewBookSpace;
ROUTES['space-booking/success'] = viewBookingSuccess;
