/* ============================================================
   Evenuefy — Space Booking (AERO-245 / 3.8 / 3.9 · cart-based
   reservation, per-sq.m pricing engine, mezzanine, auto-allotment)
   Flow: Book Space (venue map → hall → stall grid) → Stall Detail
   (scheme → mezzanine area → Select Stall) → Reserve & Add to Cart
   (one application per stall, held for 21 days from cart creation)
   → 100% payment online (gateway) or offline (NEFT / RTGS / Cheque /
   Wire against the proforma invoice) → AUTOMATIC ALLOTMENT: stall
   mapped to the company, layout updated (red + company name), tax
   invoice, badge & vehicle quota released, audit trail. No organiser
   approval, no slabs, no changes after allotment (DEO may shift a
   stall; the difference is settled as a differential payment or a
   credit note). Unpaid carts expire after 21 days.
   Shared modules: space-pricing.js (engine, rules, documents) and
   space-inventory.js (stall master, demo book, occupancy map).
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */
/* bump to wipe every portal's demo applications on the next load */
const SB_CLEAR_SEQ = 6;
(function migrateSpaceBooking() {
  if (!S.spaceBooking) S.spaceBooking = {};
  if (!S.spaceBooking.reservations) { S.spaceBooking.reservations = []; delete S.spaceBooking.applications; }
  if (!S.seq.pi) S.seq.pi = 0;
  if (!S.emailLog) S.emailLog = [];
  if (S.spaceBooking.clearSeq !== SB_CLEAR_SEQ) {
    sbClearApplications(true);
    S.spaceBooking.clearSeq = SB_CLEAR_SEQ;
  }
  save();
})();

/* Clear all stall applications (demo reset) — their cart items, orders,
   notifications and the stalls they added to the dashboard go too. */
function sbClearApplications(silent) {
  if (!silent && !confirm('Clear ALL stall applications? Cart items, their orders and allotted stalls from these applications will be removed. Seeded stalls stay.')) return;
  const list = S.spaceBooking.reservations || [];
  const ids = list.map((r) => r.id);
  const derived = list.flatMap((r) => r.stalls.map((s) => 'st_' + s.name));
  S.spaceBooking.reservations = [];
  S.cart = S.cart.filter((c) => c.type !== 'space');
  S.orders = (S.orders || []).filter((o) => !(o.type === 'space' && ids.includes(o.refId)));
  S.stalls = S.stalls.filter((s) => !derived.includes(s.id));
  S.notifications = (S.notifications || []).filter((n) => !/^nt_/.test(n.id));
  S.emailLog = [];
  S.seq.pi = 0;
  if (!silent) { save(); window.__sbFilter = ''; render(); toast('All stall applications cleared.', 'success'); }
}

const SB_STATUS = {
  reserved: ['pink', 'Blocked · In Cart'],
  payment_under_verification: ['blue', 'Payment Under Verification'],
  confirmed: ['red', 'Allotted · 100% Paid'],
  expired: ['gray', 'Expired'],
  released: ['gray', 'Released'],
};
const sbStatusPill = (st) => '<span class="pill ' + SB_STATUS[st][0] + '">' + SB_STATUS[st][1] + '</span>';
const SB_LIVE = SB_HOLDING; // statuses that hold inventory
const sbRes = (id) => S.spaceBooking.reservations.find((r) => r.id === id);
const SB_OFFLINE_METHODS = ['NEFT', 'RTGS', 'Cheque / DD', 'SWIFT (Wire Transfer)'];
/* the logged-in exhibitor is billed in INR (Indian company) or USD */
const sbCurrency = () => (EVENT.exhibitorCountry === 'India' ? 'INR' : 'USD');
const sbMoney = (n, cur) => sbpFmt(n, cur || sbCurrency());
const sbStall = (r) => r.stalls[0];

/* occupancy map for the layout — live applications + seeded stalls + demo book */
function sbBookedSet() { return sbInventory(S.spaceBooking.reservations, S.stalls, EXH); }

window.__sbSel = window.__sbSel || []; // transient stall selection

/* ---------------- notifications (bell + toast) & e-mails (demo log) ---------------- */
function sbNotify(icon, color, text, quiet) {
  if (!S.notifications) S.notifications = [];
  S.notifications.unshift({ id: 'nt_' + Date.now() + '_' + Math.floor(Math.random() * 1e4), icon: icon, color: color, text: text, time: nowStr(), read: false });
  if (!quiet) toast(text, color === 'var(--red)' ? 'error' : 'success');
}
/* kind must be enabled in Admin → Space Booking Configuration → Email notifications */
function sbEmail(kind, subject, body, quiet) {
  const cfg = sbpConfig();
  if (cfg.emails[kind] === false) return false;
  if (!S.emailLog) S.emailLog = [];
  S.emailLog.unshift({ id: 'em_' + Date.now(), at: nowStr(), to: EVENT.exhibitorEmail || 'dhirens@evenuefy.com', company: EVENT.exhibitor, kind: kind, subject: subject, body: body || '' });
  if (S.emailLog.length > 60) S.emailLog.length = 60;
  if (!quiet) toast('E-mail sent: ' + subject, 'success');
  return true;
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
      sbpAudit(r, 'System', 'Expired', 'Validity lapsed on ' + sbpDate(r.holdUntil) + ' without 100% payment — stall ' + sbStall(r).name + ' released');
      sbNotify('timer_off', 'var(--red)', 'Application ' + r.no + ' (stall ' + sbStall(r).name + ') expired on ' + sbpDate(r.holdUntil) + ' — the stall has been released.', true);
      sbEmail('expiry', 'Application ' + r.no + ' expired — stall ' + sbStall(r).name + ' released', '', true);
      changed = true;
      return;
    }
    if (!r.reminders) r.reminders = {};
    /* T-7 / T-3 / T-1: fire the closest threshold reached (once), skip any earlier ones already passed */
    const due = [1, 3, 7].find((t) => left <= t);
    if (due && !r.reminders[due]) {
      [7, 3, 1].forEach((t) => { if (t >= due) r.reminders[t] = true; });
      const txt = 'Reminder: application ' + r.no + ' (stall ' + sbStall(r).name + ') is valid till ' + sbpDate(r.holdUntil) + ' (' + (left <= 0 ? 'expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '). Pay ' + sbMoney(r.amount, r.pricing.currency) + ' to confirm.';
      sbNotify('alarm', 'var(--amber)', txt, true);
      sbEmail('reminders', 'T−' + due + ' reminder · ' + r.piNo + ' valid till ' + sbpDate(r.holdUntil), txt, true);
      changed = true;
    }
  });
  if (changed) save();
}
function sbSettleExpiry() { sbTick(); }

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

/* ---------------- VIEW · Hall stall grid ----------------
   Colour code (DEO): Available green · Blocked (in cart) pink ·
   Allotted (100% paid) red with the company name visible to everyone. */
function viewHallStalls(hallId) {
  const hall = sbZone(hallId);
  if (!hall) { location.hash = '#/space-booking/book'; return ''; }
  const booked = sbBookedSet();
  const cfg = sbpConfig();
  const cur = sbCurrency();

  /* spatial floor-plan placement: large 12X9 stalls centre, 9X6 along the
     outdoor side, 6X6 along the roadside — like the hall drawing */
  const AREA = hall.chalet ? [] : ['l1', 'l2', 'l3', 'l4', 'm5', 'm6', 'm7', 'm8', 't9', 't10', 't11', 't12'];
  const tiles = hall.stalls.map((st, idx) => {
    const b = booked[hall.id + '|' + st.name];
    const inSel = window.__sbSel.some((s) => s.hall === hall.id && s.name === st.name);
    const cls = !b ? (inSel ? 'insel' : 'avail') : b.kind === 'allotted' ? (b.mine ? 'allotted mine' : 'allotted') : (b.mine ? 'cart mine' : 'cart');
    const label = !b ? (inSel ? 'In Selection' : 'Available')
      : b.kind === 'allotted' ? '<span class="co" title="' + esc(b.company) + '">' + esc(b.mine ? 'Your stall · ' + b.company : b.company) + '</span>'
      : b.mine ? (b.status === 'payment_under_verification' ? 'In your cart · under verification' : 'In your cart · till ' + sbpDate(b.res.holdUntil)) : 'Blocked · in cart';
    const title = !b ? st.sqm + ' sq.m · ' + st.sides + ' open' : b.kind === 'allotted' ? 'Allotted (100% paid) to ' + b.company : b.mine ? 'In your cart' : 'Blocked — in another exhibitor’s cart';
    return '<div class="stall-tile ' + cls + '"' + (AREA[idx] ? ' style="grid-area:' + AREA[idx] + '"' : '') + ' title="' + esc(title) + '"' +
      (b ? (b.mine && b.res ? ' onclick="location.hash=\'#/space-booking/application/' + b.res.id + '\'"' : '') : ' onclick="openStallDetail(\'' + hall.id + '\',\'' + st.name + '\')"') + '>' +
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

  const selRows = window.__sbSel.map((s, i) => {
    const p = sbpPrice([s], { currency: cur });
    return '<div class="prod-row" style="padding:10px 12px">' +
      '<div class="pinfo"><b><span class="regno">' + esc(s.name) + '</span> <span class="pill blue">' + sbSchemeLabel(s.scheme) + '</span></b>' +
      '<span>' + esc(sbZoneLabel(s.hall)) + ' · ' + s.sqm + ' sq.m' + (s.mezzSqm ? ' + ' + s.mezzSqm + ' sq.m mezzanine' : '') + ' · ' + esc(s.sides) + ' open</span></div>' +
      '<b class="money" style="color:var(--green)">' + sbMoney(p.subtotal, cur) + '</b>' +
      '<button class="btn-link danger" onclick="sbRemoveSel(' + i + ')" title="Remove">✕</button></div>';
  }).join('');
  const p = window.__sbSel.length ? sbpPrice(window.__sbSel, { currency: cur, withCredit: sbCreditAvailable() }) : null;

  const rateNote = hall.chalet
    ? 'Chalet 6m × 12m · single storey ' + sbMoney(cfg.chalet.chalet1[sbpRateKey(cur)], cur) + ' · double storey ' + sbMoney(cfg.chalet.chalet2[sbpRateKey(cur)], cur) + ' (excl. GST)'
    : 'Rate card: Raw ' + sbMoney(cfg.rates.raw[sbpRateKey(cur)], cur) + ' · Shell ' + sbMoney(cfg.rates.shell[sbpRateKey(cur)], cur) + ' per sq.m · corner +' + Math.round(cfg.cornerPctPerSide * 100) + '% per extra open side · mezzanine ' + sbMoney(cfg.mezz[sbpRateKey(cur)], cur) + ' per sq.m on stalls above ' + cfg.mezz.minSqm + ' sq.m (up to ' + Math.round(cfg.mezz.maxPct * 100) + '%) · all excl. GST ' + Math.round(cfg.gst * 100) + '%';

  return '<a class="back-link" href="#/space-booking/book"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Halls</a>' +
    '<h1 class="page-title">' + esc(hall.name) + (hall.chalet ? ' (Chalet Selection)' : ' (Stall Selection)') + '</h1>' +
    '<div class="filter-chips" style="margin-bottom:6px">' +
      '<span class="pill green">Available</span><span class="pill pink">Blocked · in cart</span><span class="pill red">Allotted · 100% paid (company shown)</span>' +
      '<span class="pill blue" style="background:var(--blue);color:#fff">In your cart</span><span class="pill blue">In Selection</span></div>' +
    '<p style="font-size:0.76rem;color:var(--muted);margin:0 0 14px">' + rateNote + '</p>' +
    '<div class="prof-layout"><div>' + floorplan + '</div>' +
    '<div class="card"><div class="pcard-head" style="margin-bottom:8px">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">shopping_cart</span></span>' +
      '<h2 class="card-title">Selected Stalls</h2></div>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">' + window.__sbSel.length + ' stall(s) in your selection · each becomes its own application' +
        (window.__sbSel.length ? ' · <button class="btn-link" style="padding:0" onclick="window.__sbSel=[];render()">Clear All</button>' : '') + '</p>' +
      (selRows || '<div class="empty" style="padding:20px 6px"><span class="material-symbols-outlined">shopping_cart</span>' +
        '<h3 style="font-size:0.95rem">No Stalls Selected</h3><p style="font-size:0.78rem">Click on available (green) stalls in the hall layout to add them to your selection.</p></div>') +
      (p
        ? '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px;font-size:0.82rem">' +
            sbSumRow('Space rental', sbMoney(p.base, cur)) +
            (p.side ? sbSumRow('Corner stall fee', sbMoney(p.side, cur)) : '') +
            (p.mezz ? sbSumRow('Mezzanine floor (' + p.mezzSqm + ' sq.m)', sbMoney(p.mezz, cur)) : '') +
            sbSumRow('GST ' + Math.round(p.gstPct * 100) + '%', sbMoney(p.gst, cur)) +
            (p.credit ? sbSumRow('Registration fee adjusted', '− ' + sbMoney(p.credit, cur)) : '') +
            '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:0.95rem;margin-top:6px"><span>Net payable (100%)</span><span style="color:var(--green)">' + sbMoney(p.payable, cur) + '</span></div>' +
            '<p style="font-size:0.74rem;color:var(--muted);margin:8px 0 0">Stalls are held for <b>' + sbpHoldDays() + ' days</b> from cart creation (till ' + sbpDate(sbpHoldUntil(Date.now())) + '). Pay the full amount of each application online or offline within that period, else the stall is released.</p>' +
          '</div>' +
          '<div class="bank-savebar" style="margin-top:10px;padding-top:12px">' +
          '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="sbReserve()"><span class="material-symbols-outlined">add_shopping_cart</span>Reserve &amp; Add to Cart</button></div>'
        : '') +
    '</div></div>';
}
const sbSumRow = (k, v) => '<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--muted)"><span>' + k + '</span><b style="color:var(--ink)">' + v + '</b></div>';

function sbRemoveSel(i) { window.__sbSel.splice(i, 1); render(); }

/* registration fee is adjusted once — on the earliest live application */
function sbCreditAvailable() {
  return !S.spaceBooking.reservations.some((r) => SB_LIVE.includes(r.status) && r.pricing && r.pricing.credit > 0);
}

/* ---------------- Stall Detail modal (2 steps, like the platform) ---------------- */
function openStallDetail(hallId, stallName) {
  const hall = sbZone(hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  const cur = sbCurrency();
  const cfg = sbpConfig();
  if (st.chalet) {
    openModal('Chalet Detail',
      '<b style="display:block;margin-bottom:4px">Chalet Type</b>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 14px">Hospitality chalet 6m × 12m — select single or double storey to proceed.</p>' +
      '<div class="radio-cards" style="grid-template-columns:1fr">' +
        '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'chalet1\')" style="text-align:center;padding:22px">' +
          '<b style="font-size:1.05rem">Single Storey</b><small>' + sbMoney(cfg.chalet.chalet1[sbpRateKey(cur)], cur) + ' flat (excl. GST)</small></label>' +
        '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'chalet2\')" style="text-align:center;padding:22px">' +
          '<b style="font-size:1.05rem">Double Storey</b><small>' + sbMoney(cfg.chalet.chalet2[sbpRateKey(cur)], cur) + ' flat (excl. GST)</small></label>' +
      '</div>');
    return;
  }
  openModal('Stall Detail',
    '<b style="display:block;margin-bottom:4px">Stall Category</b>' +
    '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 14px">Kindly select a stall category to proceed with the booking process. Rates per sq.m as per the Aero India 2027 terms &amp; conditions, excl. GST.</p>' +
    '<div class="radio-cards" style="grid-template-columns:1fr">' +
      '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'shell\')" style="text-align:center;padding:22px">' +
        '<b style="font-size:1.05rem">Shell Space</b><small>' + sbMoney(cfg.rates.shell[sbpRateKey(cur)], cur) + ' / sq.m → ' + sbMoney(sbpBaseFor(st, 'shell', cur), cur) + ' for ' + st.sqm + ' sq.m</small></label>' +
      '<label class="radio-card" onclick="showStallDetail(\'' + hallId + '\',\'' + stallName + '\',\'raw\')" style="text-align:center;padding:22px">' +
        '<b style="font-size:1.05rem">Raw Space</b><small>' + sbMoney(cfg.rates.raw[sbpRateKey(cur)], cur) + ' / sq.m → ' + sbMoney(sbpBaseFor(st, 'raw', cur), cur) + ' for ' + st.sqm + ' sq.m</small></label>' +
    '</div>');
}

function showStallDetail(hallId, stallName, scheme) {
  const hall = sbZone(hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  const cur = sbCurrency();
  const cfg = sbpConfig();
  const sel = Object.assign({}, st, { scheme: scheme, mezzSqm: 0 });
  const eligible = sbpMezzEligible(sel, cfg);
  const max = eligible ? sbpMezzMax(sel, cfg) : 0;
  const row = (icon, val, label, color) =>
    '<div class="action-row" style="padding:9px 0"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">' + icon + '</span></span>' +
    '<div class="atext"><b' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</b><span>' + label + '</span></div></div>';
  openModal(st.chalet ? 'Chalet Detail' : 'Stall Detail',
    row('storefront', esc(st.name), 'Stall Name') +
    row('location_on', esc(hall.name), 'Yelahanka Air Force Station, Bengaluru') +
    row('straighten', st.sqm + ' sq.m (' + st.size + ')', 'Total Area') +
    row('check_circle', 'Available', 'Stall Status', 'var(--green)') +
    row('category', sbSchemeLabel(scheme), 'Category') +
    row('grid_view', esc(st.design) + ' · ' + esc(st.sides) + ' open', 'Stall Design') +
    (eligible
      ? '<div class="field" style="margin:8px 0 4px"><label>Mezzanine floor area (sq.m) — optional</label>' +
          '<input type="number" id="sbMezz" min="0" max="' + max + '" step="1" value="0" placeholder="0" oninput="sbMezzPreview(\'' + hallId + '\',\'' + stallName + '\',\'' + scheme + '\')">' +
          '<div class="hint">Stalls above ' + cfg.mezz.minSqm + ' sq.m may build up to ' + Math.round(cfg.mezz.maxPct * 100) + '% of the area at mezzanine level (max <b>' + max + ' sq.m</b> here) at ' + sbMoney(cfg.mezz[sbpRateKey(cur)], cur) + ' per sq.m, excl. GST. No corner premium on mezzanine.</div><div class="error"></div></div>'
      : (st.chalet ? '' : '<p style="font-size:0.74rem;color:var(--muted);margin:6px 0">Mezzanine is available only on ' + cfg.mezz.schemes.map(sbSchemeLabel).join(' / ') + ' stalls above ' + cfg.mezz.minSqm + ' sq.m.</p>')) +
    '<div id="sbPricePreview">' + sbPricePreview(sel, cur) + '</div>',
    '<button class="btn btn-outline" onclick="openStallDetail(\'' + hallId + '\',\'' + stallName + '\')">Back</button>' +
    '<button class="btn btn-primary" onclick="sbSelectStall(\'' + hallId + '\',\'' + stallName + '\',\'' + scheme + '\')"><span class="material-symbols-outlined">check_circle</span>Select Stall</button>');
}
function sbPricePreview(sel, cur) {
  const p = sbpPrice([sel], { currency: cur });
  const l = p.lines[0];
  return '<div class="sb-price" style="margin-top:6px;font-size:0.82rem">' +
    sbSumRow(l.chalet ? 'Chalet (flat rate)' : 'Space rental · ' + l.sqm + ' sq.m × ' + sbMoney(l.rate, cur), sbMoney(l.base, cur)) +
    (l.side ? sbSumRow('Corner stall fee · +' + Math.round(l.sidePct * 100) + '%', sbMoney(l.side, cur)) : '') +
    (l.mezz ? sbSumRow('Mezzanine · ' + l.mezzSqm + ' sq.m × ' + sbMoney(l.mezzRate, cur), sbMoney(l.mezz, cur)) : '') +
    sbSumRow('GST ' + Math.round(p.gstPct * 100) + '%', sbMoney(p.gst, cur)) +
    '<div class="sb-price-total"><span>Total investment</span><b>' + sbMoney(p.grand, cur) + '</b></div></div>';
}
function sbMezzPreview(hallId, stallName, scheme) {
  const st = sbStallMaster(hallId, stallName);
  const inp = $('sbMezz');
  const sel = Object.assign({}, st, { scheme: scheme, mezzSqm: 0 });
  const max = sbpMezzMax(sel);
  let v = Math.floor(Number(inp.value) || 0);
  const field = inp.closest('.field');
  if (v > max) { field.classList.add('invalid'); field.querySelector('.error').textContent = 'Maximum mezzanine area for this stall is ' + max + ' sq.m (' + Math.round(sbpConfig().mezz.maxPct * 100) + '%)'; v = max; }
  else field.classList.remove('invalid');
  sel.mezzSqm = v;
  $('sbPricePreview').innerHTML = sbPricePreview(sel, sbCurrency());
}

function sbSelectStall(hallId, stallName, scheme) {
  const st = sbStallMaster(hallId, stallName);
  const booked = sbBookedSet();
  if (booked[hallId + '|' + stallName]) { closeModal(); render(); toast(stallName + ' is no longer available.', 'error'); return; }
  const inp = $('sbMezz');
  const sel = Object.assign({}, st, { scheme: scheme, mezzSqm: 0 });
  let mezz = inp ? Math.floor(Number(inp.value) || 0) : 0;
  if (mezz < 0) mezz = 0;
  if (mezz > sbpMezzMax(sel)) { setErr('sbMezz', 'Maximum ' + sbpMezzMax(sel) + ' sq.m'); return; }
  sel.mezzSqm = sbpMezzEligible(sel) ? mezz : 0;
  const i = window.__sbSel.findIndex((s) => s.hall === hallId && s.name === stallName);
  if (i >= 0) window.__sbSel[i] = sel; else window.__sbSel.push(sel);
  closeModal(); render();
  toast(st.name + (sel.mezzSqm ? ' (+' + sel.mezzSqm + ' sq.m mezzanine)' : '') + ' added to your selection.', 'success');
}

/* ---------------- Reserve & Add to Cart ----------------
   Every selected stall becomes its OWN application (own application
   number, own proforma invoice, own 21-day clock, own payment). */
function sbCartItem(r) {
  return { id: uid('cart'), type: 'space', refId: r.id, currency: r.pricing.currency,
    label: 'Stall ' + sbStall(r).name + ' · ' + sbZoneLabel(sbStall(r).hall) + ' — Application ' + r.no,
    sub: r.piNo + ' · valid till ' + sbpDate(r.holdUntil), amount: r.amount };
}
function sbNewApplication(s, source, by) {
  const cur = sbCurrency();
  const pricing = sbpPrice([s], { currency: cur, withCredit: sbCreditAvailable() });
  S.seq.pi = (S.seq.pi || 0) + 1;
  const nowIso = new Date().toISOString();
  const r = {
    id: 'sbr_' + Date.now() + '_' + S.seq.pi,
    no: '#' + String(10000000 + Math.floor(Math.random() * 89999999)),
    piNo: 'PI-AI27-' + pad(S.seq.pi, 4), piRev: 0,
    type: s.hall === 'CH' ? 'Chalet' : 'Pre-defined Space',
    stalls: [s],
    pricing: pricing,
    amount: pricing.payable,
    status: 'reserved', // reserved → payment_under_verification → confirmed (allotted) · expired / released
    source: source || 'exhibitor',
    createdAt: nowStr(), createdAtIso: nowIso,
    holdUntil: sbpHoldUntil(Date.now()),
    extensions: [], reminders: {}, payment: null, audit: [],
  };
  sbpAudit(r, by || EVENT.exhibitor, 'Application created', 'Stall ' + s.name + ' (' + sbZoneLabel(s.hall) + ') reserved in cart · ' + sbSchemeLabel(s.scheme) + ' · ' + s.sqm + ' sq.m' + (s.mezzSqm ? ' + ' + s.mezzSqm + ' sq.m mezzanine' : '') + ' · ' + r.piNo + ' · valid till ' + sbpDate(r.holdUntil));
  S.spaceBooking.reservations.unshift(r);
  S.cart.push(sbCartItem(r));
  return r;
}
function sbReserve() {
  if (!window.__sbSel.length) return;
  const booked = sbBookedSet();
  const clash = window.__sbSel.find((s) => booked[s.hall + '|' + s.name]);
  if (clash) { toast(clash.name + ' is no longer available — remove it from the selection.', 'error'); return; }
  const created = window.__sbSel.map((s) => sbNewApplication(s, 'exhibitor'));
  window.__sbSel = [];
  window.__sbLast = created.map((r) => r.id);
  sbNotify('shopping_cart', 'var(--blue)', created.length + ' stall application(s) created — ' + created.map((r) => sbStall(r).name).join(', ') + ' held in your cart till ' + sbpDate(created[0].holdUntil) + '. Pay 100% of each to confirm.', true);
  created.forEach((r) => sbEmail('reserved', 'Proforma invoice ' + r.piNo + ' — stall ' + sbStall(r).name + ' reserved till ' + sbpDate(r.holdUntil), 'Application ' + r.no + ' · ' + sbMoney(r.amount, r.pricing.currency) + ' payable within ' + sbpHoldDays() + ' days. PI attached.', true));
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
      '<span class="sb-app-main"><b>' + sbStallTitle(r) + '</b><small>Application ' + esc(r.no) + ' · ' + esc(r.piNo) + ' · ' + sbStallMeta(r) + '</small></span>' +
      '<span class="sb-app-amt">' + sbMoney(r.amount, r.pricing.currency) + '<small>100% payable</small></span>' +
      '<span class="material-symbols-outlined" style="color:var(--muted)">chevron_right</span></a>').join('');
  return '<div class="card" style="max-width:680px;margin:40px auto;padding:34px 30px">' +
    '<div style="text-align:center"><span class="material-symbols-outlined" style="font-size:64px;color:var(--green)">add_shopping_cart</span>' +
    '<h1 class="page-title" style="margin-top:8px">' + list.length + ' Stall Application' + (list.length === 1 ? '' : 's') + ' Created</h1>' +
    '<p class="page-sub">Each stall is held for you till <b>' + sbpDate(list[0].holdUntil) + '</b> (' + sbpHoldDays() + ' days) and its proforma invoice has been e-mailed. Pay 100% of each application — online or offline against its proforma invoice — within this period; unpaid applications expire automatically.</p></div>' +
    '<div class="sb-app-list">' + rows + '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px">' +
      '<span style="font-size:0.86rem;color:var(--muted)">Total payable <b style="color:var(--ink)">' + sbMoney(total, list[0].pricing.currency) + '</b></span>' +
      '<span style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<a class="btn btn-outline" href="#/space-booking/my"><span class="material-symbols-outlined">grid_view</span>My Spaces</a>' +
        '<button class="btn btn-primary" onclick="openCart()"><span class="material-symbols-outlined">shopping_cart</span>Open Cart &amp; Pay</button></span>' +
    '</div></div>';
}

/* ---------------- 21-day validity (static text) ---------------- */
function sbValidity(r) {
  const left = sbpDaysLeft(r.holdUntil);
  if (r.status === 'confirmed') return '<span class="sb-val"><b style="color:var(--green)">Allotted</b><small>' + sbpDate(r.paidAtIso) + '</small></span>';
  if (r.status === 'expired') return '<span class="sb-val"><b style="color:var(--red)">Expired</b><small>' + sbpDate(r.holdUntil) + '</small></span>';
  if (r.status === 'released') return '<span class="sb-val"><b style="color:var(--muted)">Released</b><small>' + esc(r.releasedAt || '') + '</small></span>';
  if (r.status === 'payment_under_verification') return '<span class="sb-val"><b style="color:var(--blue)">Clock paused</b><small>valid till ' + sbpDate(r.holdUntil) + '</small></span>';
  const col = left <= 1 ? 'var(--red)' : left <= 7 ? 'var(--amber)' : 'var(--ink)';
  return '<span class="sb-val"><b style="color:' + col + '">' + (left <= 0 ? 'Expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '</b><small>valid till ' + sbpDate(r.holdUntil) + (r.extensions && r.extensions.length ? ' · extended' : '') + '</small></span>';
}

/* ---------------- payment → AUTOMATIC ALLOTMENT (3.8) ---------------- */
function sbCreateOrder(r, method, mode, ref, kind, settle) {
  if (!S.orders) S.orders = [];
  if (!S.seq.order) S.seq.order = 0;
  const adj = kind === 'adj';
  const billed = adj ? r.adjustment.amount : r.amount;
  const st = settle || { settleCurrency: r.pricing.currency, settleAmount: billed };
  const order = {
    id: uid('order'), orderNo: 'ORD-2027-' + pad(S.seq.order, 4),
    type: 'space', label: (adj ? 'Stall shift differential — ' : 'Stall ' + sbStall(r).name + ' — ') + 'Application ' + r.no + (adj ? '' : ' · 100% payment'),
    sub: (adj ? r.adjustment.no : r.piNo) + ' · ' + method + (ref ? ' · Ref ' + ref : ''), refId: r.id,
    amount: st.settleAmount, currency: st.settleCurrency, billedAmount: billed, billedCurrency: r.pricing.currency, fxRate: st.fxRate || null, status: 'success', method: method, mode: mode, ref: ref || '',
    paidAt: nowStr(), paidAtIso: new Date().toISOString(), payer: EVENT.exhibitor,
  };
  S.orders.push(order);
  return order;
}
/* Validate → allot → map stall to the company → layout → records → quota → audit → communication */
function sbAllot(r, payment, orderNo, by) {
  if (r.status === 'confirmed') return false;
  const s = sbStall(r);
  const paid = Number(payment && payment.amount != null ? payment.amount : r.amount);
  if (paid < r.amount) { toast('Allotment blocked: received ' + sbMoney(paid, r.pricing.currency) + ' is less than the 100% payable ' + sbMoney(r.amount, r.pricing.currency) + '.', 'error'); return false; }
  const holder = sbBookedSet()[s.hall + '|' + s.name];
  if (holder && !(holder.mine && holder.res && holder.res.id === r.id)) { toast('Allotment blocked: stall ' + s.name + ' is no longer eligible (held by ' + holder.company + ').', 'error'); return false; }
  if (!['reserved', 'payment_under_verification'].includes(r.status)) { toast('Allotment blocked: application is ' + SB_STATUS[r.status][1] + '.', 'error'); return false; }
  r.status = 'confirmed';
  r.paidAt = nowStr(); r.paidAtIso = new Date().toISOString();
  r.payment = Object.assign({}, r.payment || {}, payment || {});
  r.orderNo = orderNo || r.orderNo;
  r.pausedAt = null;
  if (!S.stalls.some((x) => x.stall === s.name)) {
    S.stalls.push({ id: 'st_' + s.name, hall: sbZoneLabel(s.hall), stall: s.name, area: s.sqm, mezzSqm: s.mezzSqm || 0, scheme: s.scheme, appId: r.id, company: EVENT.exhibitor });
  }
  const ent = sbpApplyEntitlement(S);
  r.allotment = { at: nowStr(), atIso: r.paidAtIso, by: by || 'System (auto-allotment)', company: EVENT.exhibitor, entitlement: ent, locked: true };
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  sbpAudit(r, by || 'System', '100% payment confirmed', (r.payment.mode === 'offline' ? 'Offline · ' + r.payment.method + ' · Ref ' + r.payment.ref : 'Online · ' + (r.payment.method || 'Card')) + ' · ' + sbMoney(r.amount, r.pricing.currency) + (sbpSettlementText(r.payment, r.pricing.currency) ? ' · ' + sbpSettlementText(r.payment, r.pricing.currency) : '') + (r.orderNo ? ' · ' + r.orderNo : ''));
  sbpAudit(r, 'System', 'Stall allotted automatically', 'Stall ' + s.name + ' mapped to ' + EVENT.exhibitor + ' · layout updated · tax invoice ' + String(r.orderNo || '').replace('ORD-', 'INV-') + ' · application locked (no upgrade / downgrade)');
  sbpAudit(r, 'System', 'Badge & vehicle quota released', ent.allDay + ' all-day exhibitor passes, ' + ent.oneDay + ' one-day passes, ' + ent.car + ' car pass(es) for ' + ent.sqm + ' sq.m allotted');
  sbNotify('verified', 'var(--green)', 'Stall ' + s.name + ' allotted to ' + EVENT.exhibitor + ' — 100% payment received against application ' + r.no + '. Tax invoice and badge / vehicle quota are now available.', true);
  sbEmail('allotment', 'Stall ' + s.name + ' allotted — application ' + r.no + ' · tax invoice ' + String(r.orderNo || '').replace('ORD-', 'INV-'), 'Allotment confirmation with tax invoice and pass entitlement attached.', true);
  return true;
}
/* kept for callers: confirm = allot */
function sbConfirm(r, payment, orderNo) { return sbAllot(r, payment, orderNo); }
/* called from payCart() for cart items of type 'space' (whole-cart checkout) */
function sbOnlinePaid(resId, order) {
  const r = sbRes(resId);
  if (!r || r.status === 'confirmed') return;
  order.method = 'Card'; order.mode = 'online';
  sbAllot(r, { mode: 'online', method: 'Card', ref: order.orderNo, date: nowStr(), amount: r.amount }, order.orderNo);
}

/* ---- pay ONE application (or its shift differential) online from its page (demo gateway) ---- */
const SB_ONLINE_METHODS = ['Card', 'Net Banking', 'UPI'];
function sbPayOnline(resId, kind, preselect) {
  const r = sbRes(resId);
  const adj = kind === 'adj';
  const inrFirst = preselect === 'INR';
  if (!r || (adj ? !(r.adjustment && r.adjustment.status === 'due') : r.status !== 'reserved')) { toast('Nothing is awaiting payment on this application.', 'error'); return; }
  const amount = adj ? r.adjustment.amount : r.amount;
  const cur = r.pricing.currency;
  openModal('Pay Online · Application ' + esc(r.no),
    '<div class="sb-gw"><div class="sb-gw-sum"><span>Stall</span><b>' + sbStallTitle(r) + '</b></div>' +
      '<div class="sb-gw-sum"><span>' + (adj ? 'Differential invoice' : 'Proforma invoice') + '</span><b>' + esc(adj ? r.adjustment.no : r.piNo) + '</b></div>' +
      '<div class="sb-gw-sum total"><span>' + (adj ? 'Shift differential payable' : 'Amount payable (100%)') + '</span><b>' + sbMoney(amount, cur) + '</b></div></div>' +
    (sbpInrSettlementAllowed(cur)
      ? '<label style="display:block;font-size:0.8rem;font-weight:700;margin:14px 0 8px">Pay in</label>' +
        '<div class="radio-cards" style="grid-template-columns:1fr 1fr">' +
          '<label class="radio-card' + (inrFirst ? '' : ' selected') + '" onclick="sbGwPick(this,\'cur\')"><input type="radio" name="sbGwCur" value="USD"' + (inrFirst ? '' : ' checked') + ' style="display:none"><b>USD · ' + sbMoney(amount, 'USD') + '</b><small>billing currency</small></label>' +
          '<label class="radio-card' + (inrFirst ? ' selected' : '') + '" onclick="sbGwPick(this,\'cur\')"><input type="radio" name="sbGwCur" value="INR"' + (inrFirst ? ' checked' : '') + ' style="display:none"><b>INR · ' + sbMoney(sbpToInr(amount), 'INR') + '</b><small>at ₹' + sbpFxRate() + ' per USD · DEO settlement rate</small></label></div>'
      : '') +
    '<label style="display:block;font-size:0.8rem;font-weight:700;margin:14px 0 8px">Payment method</label>' +
    '<div class="radio-cards" style="grid-template-columns:repeat(3,1fr)">' +
      SB_ONLINE_METHODS.map((m, i) => '<label class="radio-card' + (i === 0 ? ' selected' : '') + '" onclick="sbGwPick(this,\'m\')"><input type="radio" name="sbGwM" value="' + m + '"' + (i === 0 ? ' checked' : '') + ' style="display:none"><b>' + m + '</b></label>').join('') + '</div>' +
    '<p style="font-size:0.74rem;color:var(--muted);margin:12px 0 0">Demo gateway — the full amount is charged in one transaction. ' + (adj ? 'A receipt is issued on success.' : 'On success the stall is allotted automatically and a tax invoice issued.') + '</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="sbGwPay" onclick="sbDoPayOnline(\'' + r.id + '\',\'' + (adj ? 'adj' : 'full') + '\')"><span class="material-symbols-outlined">lock</span>Pay ' + (inrFirst && sbpInrSettlementAllowed(cur) ? sbMoney(sbpToInr(amount), 'INR') : sbMoney(amount, cur)) + '</button>');
  const m = $('modalOverlay'); if (m) m.querySelector('.modal-body').id = 'sbGw';
  window.__sbGwAmount = amount; window.__sbGwCur = cur;
}
/* radio-card picker inside the gateway dialog; updates the pay button for the chosen settlement currency */
function sbGwPick(el, group) {
  const name = group === 'cur' ? 'sbGwCur' : 'sbGwM';
  el.parentElement.querySelectorAll('.radio-card').forEach((x) => x.classList.remove('selected'));
  el.classList.add('selected');
  el.querySelector('input[name="' + name + '"]').checked = true;
  if (group === 'cur') {
    const settle = el.querySelector('input').value;
    const btn = $('sbGwPay');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">lock</span>Pay ' + sbMoney(sbpSettleAmount(window.__sbGwAmount, window.__sbGwCur, settle), settle);
  }
}
/* settlement details for a payment: billed amount + what is actually charged */
function sbSettlement(amount, cur) {
  const sel = document.querySelector('input[name="sbGwCur"]:checked');
  const settle = sel ? sel.value : cur;
  const rate = sbpFxRate();
  return settle === 'INR' && cur === 'USD'
    ? { settleCurrency: 'INR', fxRate: rate, settleAmount: sbpToInr(amount, rate) }
    : { settleCurrency: cur, fxRate: null, settleAmount: amount };
}
function sbDoPayOnline(resId, kind) {
  const r = sbRes(resId);
  if (!r) return;
  const sel = document.querySelector('input[name="sbGwM"]:checked');
  const method = sel ? sel.value : 'Card';
  if (kind === 'adj') {
    if (!r.adjustment || r.adjustment.status !== 'due') return;
    const st = sbSettlement(r.adjustment.amount, r.pricing.currency);
    const order = sbCreateOrder(r, method, 'online', '', 'adj', st);
    r.adjustment.status = 'paid'; r.adjustment.paidAt = nowStr(); r.adjustment.orderNo = order.orderNo;
    r.adjustment.payment = Object.assign({ mode: 'online', method: method, ref: order.orderNo, amount: r.adjustment.amount }, st);
    sbpAudit(r, EVENT.exhibitor, 'Shift differential paid', 'Online · ' + method + ' · ' + sbMoney(r.adjustment.amount, r.pricing.currency) + (st.settleCurrency !== r.pricing.currency ? ' · ' + sbpSettlementText(st, r.pricing.currency) : '') + ' · ' + order.orderNo);
    save(); closeModal(); render();
    toast('Differential paid — ' + r.adjustment.no + ' settled.', 'success');
    return;
  }
  if (r.status !== 'reserved') return;
  const st = sbSettlement(r.amount, r.pricing.currency);
  const order = sbCreateOrder(r, method, 'online', '', 'full', st);
  if (!sbAllot(r, Object.assign({ mode: 'online', method: method, ref: order.orderNo, date: nowStr(), amount: r.amount }, st), order.orderNo)) { S.orders.pop(); return; }
  save(); closeModal(); render();
  toast('Payment successful — stall ' + sbStall(r).name + ' allotted to ' + EVENT.exhibitor + '.', 'success');
}

/* exhibitor removes the application from the cart → stall released */
function sbCancelReservation(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'reserved') return false;
  if (!confirm('Remove application ' + r.no + ' (stall ' + sbStall(r).name + ') from the cart? The stall will be released immediately.')) return false;
  r.status = 'released'; r.releasedAt = nowStr(); r.remark = 'Removed from cart by exhibitor';
  S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
  sbpAudit(r, EVENT.exhibitor, 'Released', 'Removed from cart by the exhibitor — stall back in inventory');
  save();
  sbNotify('remove_shopping_cart', 'var(--red)', 'Application ' + r.no + ' removed — stall ' + sbStall(r).name + ' released.');
  return true;
}

/* ---- offline payment: upload proof → clock pauses until DEO verifies ---- */
function sbOpenOfflineForm(resId, kind) {
  const r = sbRes(resId);
  const adj = kind === 'adj';
  if (!r || (adj ? !(r.adjustment && r.adjustment.status === 'due') : r.status !== 'reserved')) { toast('Offline payment proof can be uploaded only while a payment is due.', 'error'); return; }
  closeCart();
  const amount = adj ? r.adjustment.amount : r.amount;
  const cur = r.pricing.currency;
  const docNo = adj ? r.adjustment.no : r.piNo;
  const today = new Date().toISOString().slice(0, 10);
  openModal('Pay Offline — Upload Payment Proof · ' + esc(docNo),
    '<div class="note" style="margin-top:0"><b class="title">Bank transfer against ' + (adj ? 'differential invoice ' : 'proforma invoice ') + esc(docNo) + '</b>' +
      'Transfer <b>' + sbMoney(amount, cur) + '</b> to DEO’s account (SBI 38748006375 · IFSC SBIN0000691, or Axis 920020060621798 · IFSC UTIB0000120) quoting the invoice number, then submit the details below. ' +
      (adj ? '' : 'Your validity clock pauses until DEO verifies the receipt. ') + '<button class="btn-link" style="padding:0" onclick="downloadProformaInvoice(\'' + r.id + '\')">View bank details on the PI</button></div>' +
    '<form id="sbOffForm" onsubmit="return sbSubmitOffline(\'' + r.id + '\',\'' + (adj ? 'adj' : 'full') + '\')" novalidate><div class="form-grid">' +
      '<div class="field"><label>Payment Method <span class="req">*</span></label><select id="offMethod">' +
        SB_OFFLINE_METHODS.map((m) => '<option>' + m + '</option>').join('') + '</select><div class="error"></div></div>' +
      '<div class="field"><label>UTR / Reference No. <span class="req">*</span></label><input type="text" id="offRef" placeholder="e.g. SBIN526012345678"><div class="error"></div></div>' +
      '<div class="field"><label>Payment Date <span class="req">*</span></label><input type="date" id="offDate" value="' + today + '" max="' + today + '"><div class="error"></div></div>' +
      (sbpInrSettlementAllowed(cur)
        ? '<div class="field"><label>Transferred in</label><select id="offCur" onchange="sbOffCurChange(' + amount + ')"><option value="USD">USD (billing currency) · ' + sbMoney(amount, 'USD') + '</option><option value="INR">INR at ₹' + sbpFxRate() + ' per USD · ' + sbMoney(sbpToInr(amount), 'INR') + '</option></select><div class="hint">Exchange-rate variation is borne by the exhibitor (T&amp;C 9z).</div></div>'
        : '') +
      '<div class="field"><label><span id="offAmtLbl">Amount Transferred (' + cur + ')</span> <span class="req">*</span></label><input type="number" id="offAmt" value="' + amount + '" min="1"><div class="error"></div></div>' +
      '<div class="field full"><label>Payment Proof (optional)</label><input type="file" id="offFile" accept=".pdf,.jpg,.jpeg,.png"><div class="hint">Bank advice / cheque copy / SWIFT MT103 — PDF or image.</div><div class="error"></div></div>' +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'sbOffForm\').requestSubmit()"><span class="material-symbols-outlined">upload</span>Submit for Verification</button>');
}
function sbOffCurChange(amount) {
  const settle = $('offCur').value;
  $('offAmtLbl').textContent = 'Amount Transferred (' + settle + ')';
  $('offAmt').value = settle === 'INR' ? sbpToInr(amount) : amount;
}
function sbSubmitOffline(resId, kind) {
  const r = sbRes(resId);
  const adj = kind === 'adj';
  if (!r) return false;
  clearErrs($('sbOffForm'));
  let ok = true;
  const method = $('offMethod').value;
  const ref = $('offRef').value.trim();
  const date = $('offDate').value;
  const amt = Number($('offAmt').value);
  const billed = adj ? r.adjustment.amount : r.amount;
  const cur = r.pricing.currency;
  const settle = $('offCur') ? $('offCur').value : cur;
  const rate = sbpFxRate();
  const due = sbpSettleAmount(billed, cur, settle, rate);
  if (!ref) { setErr('offRef', 'UTR / reference number is required'); ok = false; }
  if (!date) { setErr('offDate', 'Payment date is required'); ok = false; }
  if (!amt || amt <= 0) { setErr('offAmt', 'Enter the amount transferred'); ok = false; }
  else if (amt < due) { setErr('offAmt', '100% (' + sbMoney(due, settle) + (settle !== cur ? ' = ' + sbMoney(billed, cur) + ' at ₹' + rate + '/$' : '') + ') must be paid — part payments are not accepted'); ok = false; }
  if (!ok) return false;
  const f = $('offFile').files[0];
  const proof = { mode: 'offline', method: method, ref: ref, date: date, amount: billed, fileName: f ? f.name : '', submittedAt: nowStr(),
    settleCurrency: settle, fxRate: settle !== cur ? rate : null, settleAmount: amt };
  if (adj) {
    r.adjustment.payment = proof; r.adjustment.status = 'under_verification';
    sbpAudit(r, EVENT.exhibitor, 'Differential payment proof submitted', method + ' · Ref ' + ref + ' · ' + sbMoney(amt, settle) + (settle !== cur ? ' (' + sbMoney(billed, cur) + ' at ₹' + rate + '/$)' : ''));
  } else {
    r.payment = proof;
    r.status = 'payment_under_verification';
    r.pausedAt = new Date().toISOString();
    S.cart = S.cart.filter((c) => !(c.type === 'space' && c.refId === r.id));
    sbpAudit(r, EVENT.exhibitor, 'Offline payment proof submitted', method + ' · Ref ' + ref + ' · ' + sbMoney(amt, settle) + (settle !== cur ? ' (' + sbMoney(billed, cur) + ' at ₹' + rate + '/$)' : '') + ' · validity clock paused');
  }
  save(); closeModal(); render();
  sbNotify('hourglass_top', 'var(--blue)', 'Payment proof for ' + (adj ? r.adjustment.no : r.piNo) + ' (' + method + ' · ' + ref + ') submitted. ' + (adj ? '' : 'Your validity clock is paused until DEO verifies the receipt.'));
  return false;
}

/* ---------------- shared pieces ---------------- */
const sbStallTitle = (r) => esc(sbStall(r).name) + ' · ' + esc(sbZoneLabel(sbStall(r).hall));
const sbStallMeta = (r) => { const s = sbStall(r); return esc(sbSchemeLabel(s.scheme)) + ' · ' + esc(s.size || '') + ' · ' + s.sqm + ' sq.m' + (s.mezzSqm ? ' + ' + s.mezzSqm + ' sq.m mezz.' : '') + ' · ' + esc(s.sides) + ' open'; };
function sbPriceTable(p) {
  const cur = p.currency || 'INR';
  const f = (n) => sbMoney(n, cur);
  const l = p.lines && p.lines[0];
  return '<div class="sb-price">' +
    (l ? sbSumRow(l.chalet ? 'Chalet (flat rate)' : 'Space rental · ' + l.sqm + ' sq.m × ' + f(l.rate) + ' per sq.m', f(l.base)) : sbSumRow('Base price', f(p.base))) +
    sbSumRow('Corner stall fee' + (l && l.sidePct ? ' · +' + Math.round(l.sidePct * 100) + '% (' + (sbpSidesN(l) - 1) + ' extra open side' + (sbpSidesN(l) - 1 === 1 ? '' : 's') + ')' : ' · none (1 side open)'), f(p.side || 0)) +
    (p.mezz ? sbSumRow('Mezzanine floor · ' + p.mezzSqm + ' sq.m × ' + f(l.mezzRate) + ' per sq.m', f(p.mezz)) : '') +
    sbSumRow('Subtotal', f(p.subtotal)) +
    sbSumRow('GST ' + Math.round((p.gstPct || 0.18) * 100) + '%', f(p.gst)) +
    sbSumRow('Grand total', f(p.grand)) +
    (p.credit ? sbSumRow('Registration fee adjusted', '− ' + f(p.credit)) : '') +
    '<div class="sb-price-total"><span>Net payable (100%)</span><b>' + f(p.payable) + '</b></div></div>';
}
/* action buttons for one application (list + detail) */
function sbActions(r, full) {
  const link = full ? '' : '<a class="btn btn-outline btn-sm" href="#/space-booking/application/' + r.id + '"><span class="material-symbols-outlined" style="font-size:16px">visibility</span>View</a>';
  const cur = r.pricing.currency;
  if (r.status === 'reserved') return (full
    ? '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="sbPayOnline(\'' + r.id + '\')"><span class="material-symbols-outlined">lock</span>Pay Online · ' + sbMoney(r.amount, cur) + '</button>' +
      (sbpInrSettlementAllowed(cur) ? '<button class="btn btn-primary" style="width:100%;justify-content:center;background:var(--green)" onclick="sbPayOnline(\'' + r.id + '\',\'full\',\'INR\')"><span class="material-symbols-outlined">currency_rupee</span>Pay Online in INR · ' + sbMoney(sbpToInr(r.amount), 'INR') + '</button>' : '') +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="sbOpenOfflineForm(\'' + r.id + '\')"><span class="material-symbols-outlined">upload_file</span>Pay Offline — Upload Proof' + (sbpInrSettlementAllowed(cur) ? ' (USD or INR)' : '') + '</button>' +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Download Proforma Invoice</button>' +
      '<button class="btn-link danger" style="width:100%;justify-content:center" onclick="if(sbCancelReservation(\'' + r.id + '\'))location.hash=\'#/space-booking/my\'">Remove from cart &amp; release stall</button>'
    : '<a class="btn btn-primary btn-sm" href="#/space-booking/application/' + r.id + '"><span class="material-symbols-outlined" style="font-size:16px">lock</span>View &amp; Pay</a>');
  if (r.status === 'payment_under_verification') return (full
    ? '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Download Proforma Invoice</button>'
    : link);
  if (r.status === 'confirmed') return (full
    ? '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="downloadSpaceTaxInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">receipt_long</span>Download Tax Invoice</button>' +
      '<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="downloadProformaInvoice(\'' + r.id + '\')"><span class="material-symbols-outlined">description</span>Proforma Invoice (records)</button>'
    : link);
  return (full
    ? '<a class="btn btn-primary" style="width:100%;justify-content:center" href="#/space-booking/hall/' + sbStall(r).hall + '"><span class="material-symbols-outlined">replay</span>Book again</a>'
    : link + ' <a class="btn-link" href="#/space-booking/hall/' + sbStall(r).hall + '">Book again</a>');
}
/* audit trail of one application */
function sbHistory(r) {
  const ev = (r.audit && r.audit.length) ? r.audit : [{ at: r.createdAt, by: EVENT.exhibitor, event: 'Application created', detail: 'Stall ' + sbStall(r).name + ' reserved in cart' }];
  const icon = (e) => /allot/i.test(e) ? 'verified' : /paid|payment confirmed/i.test(e) ? 'payments' : /proof/i.test(e) ? 'upload_file' : /reject/i.test(e) ? 'rule' : /extend/i.test(e) ? 'more_time' : /expir/i.test(e) ? 'timer_off' : /releas/i.test(e) ? 'lock_open' : /shift/i.test(e) ? 'swap_horiz' : /quota/i.test(e) ? 'badge' : /e-?mail/i.test(e) ? 'mail' : 'add_shopping_cart';
  const col = (e) => /allot|paid|quota|confirmed/i.test(e) ? 'var(--green)' : /reject|expir|releas/i.test(e) ? 'var(--red)' : 'var(--blue)';
  return ev.map((e) => '<div class="action-row" style="padding:8px 0"><span class="aicon" style="background:#F1F4FA;color:' + col(e.event) + '"><span class="material-symbols-outlined">' + icon(e.event) + '</span></span>' +
    '<div class="atext"><b style="font-weight:600">' + esc(e.event) + (e.detail ? ' — <span style="font-weight:500">' + esc(e.detail) + '</span>' : '') + '</b><span>' + esc(e.at) + ' · ' + esc(e.by) + '</span></div></div>').join('');
}
function sbStepper(r) {
  const steps = [['Reserved', 'Cart created · ' + sbpDate(r.createdAtIso)],
    ['Payment', r.status === 'payment_under_verification' ? 'Proof under verification' : r.status === 'confirmed' ? (r.payment && r.payment.mode === 'offline' ? 'Offline · verified' : 'Online · gateway') : '100% within ' + sbpHoldDays() + ' days'],
    ['Allotted', r.status === 'confirmed' ? 'Auto-allotted ' + sbpDate(r.paidAtIso) + ' · locked' : 'Automatic on 100% payment']];
  const idx = r.status === 'confirmed' ? 3 : r.status === 'payment_under_verification' ? 1 : r.status === 'reserved' ? 1 : -1;
  const dead = r.status === 'expired' || r.status === 'released';
  return '<div class="sb-steps' + (dead ? ' dead' : '') + '">' + steps.map((s, i) => {
    const st = dead ? (i === 0 ? 'done' : 'off') : i < idx ? 'done' : i === idx ? 'now' : 'off';
    return '<div class="sb-step ' + st + '"><span class="dot"><span class="material-symbols-outlined">' + (st === 'done' ? 'check' : st === 'now' ? (r.status === 'payment_under_verification' ? 'hourglass_top' : 'radio_button_checked') : 'circle') + '</span></span>' +
      '<b>' + s[0] + '</b><small>' + s[1] + '</small></div>';
  }).join('') + (dead ? '<div class="sb-step bad"><span class="dot"><span class="material-symbols-outlined">close</span></span><b>' + (r.status === 'expired' ? 'Expired' : 'Released') + '</b><small>' + (r.status === 'expired' ? sbpDate(r.holdUntil) : esc(r.releasedAt || '')) + '</small></div>' : '') + '</div>';
}
/* tax invoice for an allotted stall (shared generator) */
function downloadSpaceTaxInvoice(resId) {
  const r = sbRes(resId);
  if (!r || r.status !== 'confirmed') { toast('Tax invoice is issued after 100% payment.', 'error'); return; }
  sbpOpenTaxInvoice(r, { billedTo: EVENT.exhibitor, regNo: EVENT.exhibitorRegNo, country: EVENT.exhibitorCountry, eventName: EVENT.name, eventDates: EVENT.dates });
}

/* ---------------- VIEW · Application detail (one stall) ---------------- */
function viewApplication(id) {
  sbTick();
  const r = sbRes(id);
  if (!r) { location.hash = '#/space-booking/my'; return ''; }
  const s = sbStall(r);
  const cur = r.pricing.currency;
  const left = sbpDaysLeft(r.holdUntil);
  const adj = r.adjustment;
  const adjCard = adj
    ? '<div class="card" style="margin-bottom:16px;border-left:3px solid ' + (adj.status === 'paid' ? 'var(--green)' : 'var(--amber)') + '"><h2 class="card-title">Stall shift differential · ' + esc(adj.no) + '</h2>' +
        '<p style="font-size:0.8rem;color:var(--muted);margin:4px 0 10px">' + esc(adj.reason || '') + '</p>' +
        (adj.status === 'due'
          ? '<div class="sb-due"><small>DIFFERENTIAL PAYABLE</small><b>' + sbMoney(adj.amount, cur) + '</b><span>raised ' + esc(adj.createdAt) + '</span></div>' +
            '<div class="sb-paybtns"><button class="btn btn-primary" onclick="sbPayOnline(\'' + r.id + '\',\'adj\')"><span class="material-symbols-outlined">lock</span>Pay Online · ' + sbMoney(adj.amount, cur) + '</button>' +
            '<button class="btn btn-outline" onclick="sbOpenOfflineForm(\'' + r.id + '\',\'adj\')"><span class="material-symbols-outlined">upload_file</span>Pay Offline — Upload Proof</button></div>'
          : adj.status === 'under_verification'
          ? '<div class="sb-due blue"><small>UNDER VERIFICATION</small><b>' + sbMoney(adj.payment.amount, cur) + '</b><span>' + esc(adj.payment.method) + ' · Ref ' + esc(adj.payment.ref) + ' · submitted ' + esc(adj.payment.submittedAt) + '</span></div>'
          : '<div class="sb-due green"><small>DIFFERENTIAL PAID</small><b>' + sbMoney(adj.amount, cur) + '</b><span>' + esc(adj.paidAt || '') + (adj.orderNo ? ' · ' + esc(adj.orderNo) : '') + '</span></div>') + '</div>'
    : '';
  const cnCard = r.creditNote
    ? '<div class="card" style="margin-bottom:16px;border-left:3px solid var(--green)"><h2 class="card-title">Credit note · ' + esc(r.creditNote.no) + '</h2>' +
        '<p style="font-size:0.8rem;color:var(--muted);margin:4px 0 0">' + esc(r.creditNote.reason || '') + '</p>' +
        '<div class="sb-due green" style="margin-top:10px"><small>CREDIT IN YOUR FAVOUR</small><b>' + sbMoney(r.creditNote.amount, cur) + '</b><span>issued ' + esc(r.creditNote.createdAt) + ' · refunded within 60 days of the show (T&amp;C clause 9z) or adjusted against other dues</span></div></div>'
    : '';
  const pay = r.status === 'reserved'
    ? '<div class="sb-due"><small>AMOUNT DUE · 100%</small><b>' + sbMoney(r.amount, cur) + '</b>' +
        (sbpInrSettlementAllowed(cur) ? '<span style="color:var(--ink);font-weight:700">= ' + sbMoney(sbpToInr(r.amount), 'INR') + ' <span style="font-weight:600;color:var(--muted)">if paid in INR at ₹' + sbpFxRate() + ' per USD</span></span>' : '') +
        '<span>by ' + sbpDate(r.holdUntil) + ' · ' + (left <= 0 ? 'expires today' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '</span></div>' +
      (r.payment && r.payment.rejectedAt ? '<div class="note" style="border-left-color:var(--red);margin:10px 0"><b class="title" style="color:var(--red)">Earlier proof not accepted</b>' + esc(r.payment.remark || '') + ' (' + esc(r.payment.method) + ' · ' + esc(r.payment.ref) + ', ' + esc(r.payment.rejectedAt) + '). Pay online or upload a fresh proof.</div>' : '') +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>' +
      '<p style="font-size:0.74rem;color:var(--muted);margin:10px 0 0">Offline: NEFT / RTGS / Cheque / DD / Wire transfer to DEO’s account quoting ' + esc(r.piNo) + '. Uploading the proof pauses the ' + sbpHoldDays() + '-day clock until DEO verifies. On 100% payment the stall is allotted automatically.' + (sbpInrSettlementAllowed(cur) ? ' This USD invoice may be paid in INR at DEO’s settlement rate of ₹' + sbpFxRate() + ' per USD (' + sbMoney(sbpToInr(r.amount), 'INR') + ' today).' : '') + '</p>'
    : r.status === 'payment_under_verification'
    ? '<div class="sb-due blue"><small>UNDER VERIFICATION</small><b>' + sbMoney(r.payment.settleAmount || r.payment.amount, r.payment.settleCurrency || cur) + '</b><span>' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) + (r.payment.settleCurrency && r.payment.settleCurrency !== cur ? ' · ' + sbMoney(r.payment.amount, cur) + ' at ₹' + r.payment.fxRate + '/$' : '') + '</span></div>' +
      '<div class="pkv" style="grid-template-columns:1fr 1fr;gap:10px 14px;margin:12px 0">' +
        '<div class="cell"><div class="k">Payment date</div><div class="v">' + esc(r.payment.date) + '</div></div>' +
        '<div class="cell"><div class="k">Submitted</div><div class="v">' + esc(r.payment.submittedAt) + '</div></div>' +
        '<div class="cell full"><div class="k">Proof file</div><div class="v">' + (r.payment.fileName ? esc(r.payment.fileName) : '<span style="color:var(--muted)">not attached</span>') + '</div></div></div>' +
      '<div class="note" style="margin:0 0 10px"><b class="title">Validity clock paused</b>DEO will allot the stall automatically once the amount is verified in its account. You will be notified of the result.</div>' +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>'
    : r.status === 'confirmed'
    ? '<div class="sb-due green"><small>PAID · 100% · ALLOTTED</small><b>' + sbMoney(r.amount, cur) + '</b><span>' + esc(r.paidAt || '') + (r.payment ? ' · ' + (r.payment.mode === 'offline' ? 'Offline · ' + esc(r.payment.method) + ' · Ref ' + esc(r.payment.ref) : 'Online · ' + esc(r.payment.method || 'Card')) : '') + (sbpSettlementText(r.payment, cur) ? '<br>' + esc(sbpSettlementText(r.payment, cur)) : '') + '</span></div>' +
      (r.orderNo ? '<div class="pkv" style="grid-template-columns:1fr 1fr;gap:10px 14px;margin:12px 0"><div class="cell"><div class="k">Order</div><div class="v regno">' + esc(r.orderNo) + '</div></div><div class="cell"><div class="k">Tax invoice</div><div class="v regno">' + esc(r.orderNo.replace('ORD-', 'INV-')) + '</div></div></div>' : '') +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>'
    : '<div class="sb-due red"><small>' + (r.status === 'expired' ? 'EXPIRED' : 'RELEASED') + '</small><b>' + sbMoney(r.amount, cur) + '</b><span>' + (r.status === 'expired' ? 'validity lapsed on ' + sbpDate(r.holdUntil) : esc(r.remark || '')) + '</span></div>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:10px 0">No payment was received against this application. The stall is back in inventory — you can book it again if it is still available.</p>' +
      '<div class="sb-paybtns">' + sbActions(r, true) + '</div>';
  const ent = r.allotment && r.allotment.entitlement;
  const allotCard = r.status === 'confirmed'
    ? '<div class="card" style="margin-bottom:16px;border-left:3px solid var(--red)"><div class="pcard-head" style="margin-bottom:8px"><span class="icon-sq" style="background:var(--red-soft);color:var(--red)"><span class="material-symbols-outlined">lock</span></span><h2 class="card-title">Allotment — locked</h2></div>' +
        '<p style="font-size:0.82rem;margin:0 0 10px">Stall <b>' + esc(s.name) + '</b> is allotted to <b>' + esc(EVENT.exhibitor) + '</b> since ' + esc(r.allotment ? r.allotment.at : r.paidAt) + ' and shows with your company name on the hall layout. No upgrade, downgrade or change is possible after allotment; only DEO can shift the stall.</p>' +
        (ent ? '<div class="pkv" style="grid-template-columns:repeat(3,1fr);gap:10px 14px"><div class="cell"><div class="k">All-day exhibitor passes</div><div class="v">' + ent.allDay + '</div></div><div class="cell"><div class="k">One-day passes</div><div class="v">' + ent.oneDay + '</div></div><div class="cell"><div class="k">Car passes</div><div class="v">' + ent.car + '</div></div></div>' +
          '<p style="font-size:0.74rem;color:var(--muted);margin:8px 0 0">Quota released for ' + ent.sqm + ' sq.m allotted in total (T&amp;C clause 9 q/r) — manage under Passes.</p>' : '') + '</div>'
    : '';
  const adminNote = r.source === 'admin'
    ? '<div class="note" style="margin:0 0 14px"><b class="title">Reserved by DEO on your behalf</b>DEO reserved this stall for ' + esc(EVENT.exhibitor) + ' and e-mailed the proforma invoice. Pay 100% within the validity to confirm the allotment.</div>' : '';

  return '<a class="back-link" href="#/space-booking/my"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>My Spaces</a>' +
    '<div class="card-head-row" style="align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px"><div>' +
      '<h1 class="page-title" style="margin-bottom:4px">Application ' + esc(r.no) + '</h1>' +
      '<p class="page-sub" style="margin:0">Stall <b>' + sbStallTitle(r) + '</b> · Proforma invoice <span class="regno">' + esc(r.piNo) + (r.piRev ? ' Rev ' + r.piRev : '') + '</span> · created ' + esc(r.createdAt) + ' · billed in ' + cur + '</p></div>' +
      '<div style="display:flex;gap:8px"><span class="pill gray">' + esc(r.type) + '</span>' + sbStatusPill(r.status) + '</div></div>' +
    adminNote +
    '<div class="card" style="margin-bottom:16px">' + sbStepper(r) + '</div>' +
    '<div class="prof-layout" style="grid-template-columns:minmax(0,1fr) 340px"><div>' +
      allotCard +
      '<div class="card" style="margin-bottom:16px"><div class="card-head-row"><h2 class="card-title">Validity — ' + sbpHoldDays() + '-day hold</h2>' +
          (r.extensions && r.extensions.length ? '<span class="pill blue">Extended by DEO</span>' : '') + '</div>' +
        '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
          '<div class="cell"><div class="k">Cart created</div><div class="v">' + sbpDate(r.createdAtIso) + '</div></div>' +
          '<div class="cell"><div class="k">Valid till</div><div class="v">' + sbpDate(r.holdUntil) + ' · 23:59 IST</div></div>' +
          '<div class="cell"><div class="k">Status</div><div class="v">' + sbValidity(r) + '</div></div></div>' +
        (r.extensions && r.extensions.length ? '<div style="margin-top:10px;font-size:0.8rem;color:var(--muted)">' + r.extensions.map((e) => 'Extended to <b>' + sbpDate(e.to) + '</b>' + (e.reason ? ' — ' + esc(e.reason) : '') + ' <span style="opacity:.7">(' + esc(e.at || '') + ')</span>').join('<br>') + '</div>' : '') + '</div>' +
      '<div class="card" style="margin-bottom:16px"><div class="pcard-head" style="margin-bottom:10px"><span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">storefront</span></span><h2 class="card-title">Stall Details</h2></div>' +
        '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
          '<div class="cell"><div class="k">Stall / Booth</div><div class="v">' + esc(s.name) + '</div></div>' +
          '<div class="cell"><div class="k">Hall / Zone</div><div class="v">' + esc(sbZoneLabel(s.hall)) + '</div></div>' +
          '<div class="cell"><div class="k">Scheme</div><div class="v">' + esc(sbSchemeLabel(s.scheme)) + '</div></div>' +
          '<div class="cell"><div class="k">Size / Area</div><div class="v">' + esc(s.size || '') + ' · ' + s.sqm + ' sq.m</div></div>' +
          '<div class="cell"><div class="k">Mezzanine floor</div><div class="v">' + (s.mezzSqm ? s.mezzSqm + ' sq.m (' + Math.round((s.mezzSqm / s.sqm) * 100) + '% of area)' : 'none') + '</div></div>' +
          '<div class="cell"><div class="k">Open sides</div><div class="v">' + esc(s.sides) + '</div></div>' +
          '<div class="cell"><div class="k">Stall design</div><div class="v">' + esc(s.design || '—') + '</div></div>' +
          '<div class="cell"><div class="k">Venue</div><div class="v">Yelahanka Air Force Station, Bengaluru</div></div>' +
        '</div>' +
        '<div style="margin-top:12px"><a class="btn-link" style="padding:0" href="#/space-booking/hall/' + s.hall + '">View hall layout →</a></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="pcard-head" style="margin-bottom:10px"><span class="icon-sq" style="background:var(--green-soft);color:var(--green)"><span class="material-symbols-outlined">payments</span></span><h2 class="card-title">Price Break-up · ' + esc(r.piNo) + (r.piRev ? ' Rev ' + r.piRev : '') + '</h2></div>' +
        sbPriceTable(r.pricing) +
        '<p style="font-size:0.74rem;color:var(--muted);margin:10px 0 0">Per sq.m rate card as per the Aero India 2027 terms &amp; conditions (clause 5); corner stall fee +' + Math.round(sbpConfig().cornerPctPerSide * 100) + '% of space rental per open side beyond the first (not on mezzanine); GST ' + Math.round((r.pricing.gstPct || 0.18) * 100) + '%. The registration fee is adjusted once, on your earliest live application. Net payable is a single 100% payment — no instalments.</p></div>' +
      adjCard + cnCard +
      '<div class="card"><h2 class="card-title">Audit Trail</h2>' + sbHistory(r) + '</div>' +
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
  const cur = sbCurrency();

  const hero = hasConfirmed ? '' :
    '<div class="hero-space" style="margin-bottom:18px"><span class="material-symbols-outlined watermark">storefront</span>' +
      '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
        '<h2 style="margin-top:0">Welcome to exhibition management</h2>' +
        '<p style="margin:8px 0 0;font-size:0.86rem;color:#CBDBF9">You haven’t booked a space yet. Select stalls, hold them in your cart and pay within ' + sbpHoldDays() + ' days to get them allotted.</p>' +
      '</div><div class="hero-actions"><a class="btn-hero" href="#/space-booking/book">Secure Your Space</a></div></div></div>';

  const chips = [['', 'All'], ['reserved', 'In Cart'], ['payment_under_verification', 'Under Verification'], ['confirmed', 'Allotted'], ['expired', 'Expired'], ['released', 'Released']]
    .filter(([v]) => !v || count(v)).map(([v, l]) =>
      '<button class="chip' + (f === v ? ' on' : '') + '" onclick="window.__sbFilter=\'' + v + '\';render()">' + l + (v ? ' <b>' + count(v) + '</b>' : ' <b>' + all.length + '</b>') + '</button>').join('');

  const rows = list.map((r) =>
    '<tr class="sb-row" onclick="location.hash=\'#/space-booking/application/' + r.id + '\'">' +
      '<td><span class="regno" style="color:var(--blue);font-weight:800">' + esc(r.no) + '</span><span class="td-sub">' + esc(r.piNo) + ' · ' + esc(r.createdAt.split(',')[0]) + (r.source === 'admin' ? ' · by DEO' : '') + '</span></td>' +
      '<td><span class="td-strong">' + sbStallTitle(r) + '</span><span class="td-sub">' + sbStallMeta(r) + '</span></td>' +
      '<td class="money">' + sbMoney(r.amount, r.pricing.currency) + '<span class="td-sub">100% · single payment' + (r.adjustment && r.adjustment.status === 'due' ? ' · +' + sbMoney(r.adjustment.amount, r.pricing.currency) + ' differential due' : '') + '</span></td>' +
      '<td style="white-space:nowrap">' + sbValidity(r) + '</td>' +
      '<td>' + sbStatusPill(r.status) + '</td>' +
      '<td onclick="event.stopPropagation()" style="white-space:nowrap">' + sbActions(r, false) + '</td></tr>').join('') ||
    '<tr><td colspan="6" style="color:var(--muted);padding:26px;text-align:center">' + (all.length ? 'No applications with this status.' : 'No applications yet — select stalls from Book Space; each stall becomes its own application held in your cart for ' + sbpHoldDays() + ' days.') + '</td></tr>';

  const table = '<div class="card sba-card" style="padding:0">' +
    '<div class="card-head-row" style="padding:14px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px"><div class="filter-chips" style="margin:0">' + chips + '</div>' +
      '<a class="btn btn-primary btn-sm" href="#/space-booking/book"><span class="material-symbols-outlined" style="font-size:16px">add</span>Book Space</a></div>' +
    '<div class="tablewrap"><table class="grid sb-table"><tr><th>Application</th><th>Stall</th><th>Net Payable</th><th>' + sbpHoldDays() + '-day Validity</th><th>Status</th><th>Action</th></tr>' + rows + '</table></div>' +
    '</div>';

  /* summary tiles */
  const outstanding = all.filter((r) => r.status === 'reserved').reduce((x, r) => x + r.amount, 0) + all.filter((r) => r.adjustment && r.adjustment.status === 'due').reduce((x, r) => x + r.adjustment.amount, 0);
  const underVerif = all.filter((r) => r.status === 'payment_under_verification').reduce((x, r) => x + r.amount, 0);
  const paid = all.filter((r) => r.status === 'confirmed').reduce((x, r) => x + r.amount, 0);
  const soonest = all.filter((r) => r.status === 'reserved').sort((a, b) => new Date(a.holdUntil) - new Date(b.holdUntil))[0];
  const allottedSqm = S.stalls.reduce((a, s) => a + Number(s.area || 0) + Number(s.mezzSqm || 0), 0);
  const tiles = (all.length || S.stalls.length) ? '<div class="tiles" style="margin-bottom:14px">' +
      '<div class="tile' + (outstanding ? '' : ' accent') + '"><div class="t-label">Outstanding · In Cart</div><div class="t-value" style="color:' + (outstanding ? 'var(--red)' : 'var(--green)') + '">' + sbMoney(outstanding, cur) + '</div>' +
        '<div class="t-sub">' + (soonest ? count('reserved') + ' application(s) · earliest expiry ' + sbpDate(soonest.holdUntil) : 'nothing due') + '</div>' +
        (outstanding ? '<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Open Cart</button>' : '') + '</div>' +
      '<div class="tile blue"><div class="t-label">Under Verification</div><div class="t-value">' + count('payment_under_verification') + '</div><div class="t-sub">' + (underVerif ? sbMoney(underVerif, cur) + ' · clock paused until DEO verifies' : 'no offline proofs pending') + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Allotted Stalls</div><div class="t-value">' + S.stalls.length + '</div><div class="t-sub">' + allottedSqm + ' sq.m incl. mezzanine · ' + sbMoney(paid, cur) + ' paid</div></div>' +
      '<div class="tile"><div class="t-label">Expired / Released</div><div class="t-value">' + (count('expired') + count('released')) + '</div><div class="t-sub">stalls returned to inventory</div></div>' +
    '</div>' : '';
  const how = '<div class="card" style="margin-top:16px"><h2 class="card-title">How it works</h2><ol class="sb-how">' +
      '<li><b>Select</b> a stall on the hall layout (green = available, pink = blocked in a cart, red = allotted). Choose Shell / Raw and, on stalls above ' + sbpConfig().mezz.minSqm + ' sq.m, an optional mezzanine area.</li>' +
      '<li><b>Hold</b> — each stall becomes its own application, reserved for ' + sbpHoldDays() + ' days from cart creation; the proforma invoice is e-mailed and downloadable.</li>' +
      '<li><b>Pay 100%</b> online from the application page, or offline (NEFT / RTGS / Cheque / Wire) and upload the proof — the clock pauses until DEO verifies.</li>' +
      '<li><b>Allotted automatically</b> on receipt — the stall is mapped to your company on the layout, a tax invoice is issued and badge / vehicle quota released. No changes after allotment.</li></ol></div>';

  return '<h1 class="page-title">My Spaces</h1>' +
    '<p class="page-sub">Your stall applications, ' + sbpHoldDays() + '-day validity and payment status — one application, one proforma invoice and one 100% payment per stall; allotment is automatic on payment.</p>' +
    hero + tiles + table + how +
    '<div class="footer-tools"><button onclick="sbClearApplications()">Clear all applications</button><button onclick="resetDemo()">Reset demo data</button></div>';
}

/* ---------------- routes ---------------- */
ROUTES['space-booking/my'] = viewMySpaces;
ROUTES['space-booking/book'] = viewBookSpace;
ROUTES['space-booking/success'] = viewBookingSuccess;
