/* ============================================================
   Evenuefy — Space Booking (modelled 1:1 on dev.evenuefy.com)
   Flow: Book Space (venue map → hall → stall grid) → Stall Detail
   (category Shell/Raw → detail → Select Stall) → Request for
   Approval → organiser approval → SLAB PAYMENTS via cart →
   Confirmed booth (feeds the dashboard hero & stall labels).
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */
(function migrateSpaceBooking() {
  if (!S.spaceBooking) S.spaceBooking = { applications: [] };
  save();
})();

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
      seedBooked: (n + hi) % 4 === 0, // ~25% pre-booked inventory
    };
  }),
}));

function sbBookedSet() {
  const set = {};
  S.spaceBooking.applications.forEach((a) => {
    if (a.status !== 'rejected') a.stalls.forEach((st) => { set[st.hall + '|' + st.name] = true; });
  });
  // HAL's originally seeded stalls also block inventory
  S.stalls.forEach((st) => { set[st.hall.replace('Hall ', '') + '|' + st.stall] = true; });
  return set;
}

window.__sbSel = window.__sbSel || []; // transient stall selection

/* ---------------- VIEW · Book Space (venue map) ---------------- */
function viewBookSpace() {
  const hallBlock = (h) => {
    const avail = h.stalls.filter((st) => !st.seedBooked && !sbBookedSet()[h.id + '|' + st.name]).length;
    return '<div class="feat-card" onclick="location.hash=\'#/space-booking/hall/' + h.id + '\'" style="min-height:120px">' +
      '<span class="soon-pill" style="background:var(--green-soft);color:var(--green)">' + avail + ' available</span>' +
      '<span class="ficon fc-blue"><span class="material-symbols-outlined">grid_view</span></span>' +
      '<span class="ftitle">' + h.name + '</span>' +
      '<span class="fsub">' + h.stalls.length + ' stalls · Shell &amp; Raw schemes</span>' +
      '<span class="material-symbols-outlined fgo">arrow_forward</span></div>';
  };
  return '<h1 class="page-title">Space Booking — Exhibition Hall Selection</h1>' +
    '<p class="page-sub">Select a hall from the venue layout, then click an available stall to add it to your selection. Chargeable as per the official stall rate card.</p>' +
    '<div class="feat-grid">' + SB_HALLS.map(hallBlock).join('') +
      '<div class="feat-card soon" style="min-height:120px"><span class="soon-pill">Map Only</span>' +
        '<span class="ficon fc-amber"><span class="material-symbols-outlined">deck</span></span>' +
        '<span class="ftitle">Chalet Line</span><span class="fsub">Allotted by the organiser via Space Requirement</span></div>' +
      '<div class="feat-card soon" style="min-height:120px"><span class="soon-pill">Map Only</span>' +
        '<span class="ficon fc-teal"><span class="material-symbols-outlined">park</span></span>' +
        '<span class="ftitle">Outdoor Space</span><span class="fsub">Allotted by the organiser via Space Requirement</span></div>' +
    '</div>';
}

/* ---------------- VIEW · Hall stall grid ---------------- */
function viewHallStalls(hallId) {
  const hall = SB_HALLS.find((h) => h.id === hallId);
  if (!hall) { location.hash = '#/space-booking/book'; return ''; }
  const booked = sbBookedSet();

  const tiles = hall.stalls.map((st) => {
    const isBooked = st.seedBooked || booked[hall.id + '|' + st.name];
    const inSel = window.__sbSel.some((s) => s.hall === hall.id && s.name === st.name);
    const cls = isBooked ? 'booked' : inSel ? 'insel' : 'avail';
    return '<div class="stall-tile ' + cls + '"' +
      (isBooked ? '' : ' onclick="openStallDetail(\'' + hall.id + '\',\'' + st.name + '\')"') + '>' +
      '<b>' + st.name + '</b><span>' + st.size + ' · ' + st.sqm + ' sqm</span>' +
      '<span>' + (isBooked ? 'Booked' : inSel ? 'In Selection' : 'Available') + '</span></div>';
  }).join('');

  const selRows = window.__sbSel.map((s, i) =>
    '<div class="prod-row" style="padding:10px 12px">' +
      '<div class="pinfo"><b><span class="regno">' + esc(s.name) + '</span> <span class="pill blue">' + (s.scheme === 'raw' ? 'Raw' : 'Shell') + '</span></b>' +
      '<span>Hall ' + esc(s.hall) + ' · ' + esc(s.size) + ' sq.m</span></div>' +
      '<b class="money" style="color:var(--green)">' + money(s.price) + '</b>' +
      '<button class="btn-link danger" onclick="sbRemoveSel(' + i + ')" title="Remove">✕</button></div>').join('');
  const total = window.__sbSel.reduce((a, s) => a + s.price, 0);

  return '<a class="back-link" href="#/space-booking/book"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Halls</a>' +
    '<h1 class="page-title">' + esc(hall.name) + ' (Stall Selection)</h1>' +
    '<div class="filter-chips" style="margin-bottom:14px">' +
      '<span class="pill green">Available</span><span class="pill amber">Booked</span><span class="pill gray">In Selection</span></div>' +
    '<div class="prof-layout"><div>' +
      '<div class="card"><div class="stall-grid">' + tiles + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="pcard-head" style="margin-bottom:8px">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">shopping_cart</span></span>' +
      '<h2 class="card-title">Selected Stalls</h2></div>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">' + window.__sbSel.length + ' stall(s) in your selection' +
        (window.__sbSel.length ? ' · <button class="btn-link" style="padding:0" onclick="window.__sbSel=[];render()">Clear All</button>' : '') + '</p>' +
      (selRows || '<div class="empty" style="padding:20px 6px"><span class="material-symbols-outlined">shopping_cart</span>' +
        '<h3 style="font-size:0.95rem">No Stalls Selected</h3><p style="font-size:0.78rem">Click on available stalls in the hall layout to add them to your selection.</p></div>') +
      (window.__sbSel.length
        ? '<div class="bank-savebar" style="margin-top:10px;padding-top:12px"><b>Total Price: <span style="color:var(--green)">' + money(total) + '</span></b>' +
          '<button class="btn btn-primary" onclick="sbRequestApproval()">Request for Approval</button></div>'
        : '') +
    '</div></div>';
}

function sbRemoveSel(i) { window.__sbSel.splice(i, 1); render(); }

/* ---------------- Stall Detail modal (2 steps, like the platform) ---------------- */
function openStallDetail(hallId, stallName) {
  const hall = SB_HALLS.find((h) => h.id === hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
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
  const hall = SB_HALLS.find((h) => h.id === hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  const price = SB_PRICE[st.sqm][scheme];
  const row = (icon, val, label, color) =>
    '<div class="action-row" style="padding:9px 0"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">' + icon + '</span></span>' +
    '<div class="atext"><b' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</b><span>' + label + '</span></div></div>';
  openModal('Stall Detail',
    row('storefront', esc(st.name), 'Stall Name') +
    row('location_on', esc(hall.name), 'Yelahanka Air Force Station, Bengaluru') +
    row('straighten', st.sqm + ' sq.m (' + st.size + ')', 'Total Area') +
    row('check_circle', 'Available', 'Stall Status', 'var(--green)') +
    row('category', scheme === 'raw' ? 'Raw' : 'Shell', 'Category') +
    row('grid_view', esc(st.design), 'Stall Design') +
    row('payments', money(price), 'Total Investment'),
    '<button class="btn btn-outline" onclick="openStallDetail(\'' + hallId + '\',\'' + stallName + '\')">Back</button>' +
    '<button class="btn btn-primary" onclick="sbSelectStall(\'' + hallId + '\',\'' + stallName + '\',\'' + scheme + '\')"><span class="material-symbols-outlined">check_circle</span>Select Stall</button>');
}

function sbSelectStall(hallId, stallName, scheme) {
  const hall = SB_HALLS.find((h) => h.id === hallId);
  const st = hall.stalls.find((x) => x.name === stallName);
  if (!window.__sbSel.some((s) => s.hall === hallId && s.name === stallName)) {
    window.__sbSel.push({
      hall: hallId, name: st.name, size: st.size, sqm: st.sqm,
      design: st.design, sides: st.sides, scheme: scheme, price: SB_PRICE[st.sqm][scheme],
    });
  }
  closeModal(); render();
  toast(st.name + ' added to your selection.', 'success');
}

/* ---------------- Request for Approval ---------------- */
function sbRequestApproval() {
  if (!window.__sbSel.length) return;
  const total = window.__sbSel.reduce((a, s) => a + s.price, 0);
  S.spaceBooking.applications.unshift({
    id: 'sba_' + Date.now(),
    no: '#' + String(10000000 + Math.floor(Math.random() * 89999999)),
    type: 'Pre-defined Space',
    stalls: window.__sbSel.slice(),
    total: total,
    status: 'pending', // pending → approved (slabs) → confirmed
    slabs: [],
    createdAt: nowStr(),
  });
  window.__sbSel = [];
  save();
  location.hash = '#/space-booking/success';
}

function viewBookingSuccess() {
  return '<div class="card" style="max-width:560px;margin:60px auto;text-align:center;padding:40px 30px">' +
    '<span class="material-symbols-outlined" style="font-size:64px;color:var(--green)">check_circle</span>' +
    '<h1 class="page-title" style="margin-top:10px">Request Sent Successfully</h1>' +
    '<p class="page-sub">Your request has been sent successfully. You will be notified once it is approved by the organiser.</p>' +
    '<a class="btn btn-primary" href="#/space-booking/my" style="justify-content:center"><span class="material-symbols-outlined">grid_view</span>Go to My Space</a></div>';
}

/* ---------------- approval + slabs (demo organiser action) ---------------- */
const SB_SLAB_DEF = [
  ['Slab 1 — 25% Advance', 0.25, '15 Oct 2026'],
  ['Slab 2 — 50%', 0.5, '15 Dec 2026'],
  ['Slab 3 — 25% Balance', 0.25, '15 Jan 2027'],
];

function sbApprove(appId) {
  const a = S.spaceBooking.applications.find((x) => x.id === appId);
  if (!a || a.status !== 'pending') return;
  a.status = 'approved';
  a.approvedAt = nowStr();
  a.slabs = SB_SLAB_DEF.map(([label, pct, due]) => ({ label: label, amount: Math.round(a.total * pct), due: due }));
  save(); render();
  toast('Application ' + a.no + ' approved — slab payments are now due.', 'success');
}

function sbSlabRef(a, i) { return a.id + '#slab' + i; }
function sbSlabPaid(a, i) { return S.orders.some((o) => o.refId === sbSlabRef(a, i)); }
function sbSlabInCart(a, i) { return S.cart.some((c) => c.refId === sbSlabRef(a, i)); }

function sbPaySlab(appId, i) {
  const a = S.spaceBooking.applications.find((x) => x.id === appId);
  if (!a || sbSlabPaid(a, i) || sbSlabInCart(a, i)) return;
  const sl = a.slabs[i];
  S.cart.push({
    id: uid('cart'), type: 'space', refId: sbSlabRef(a, i),
    label: 'Space Booking ' + a.no + ' — ' + sl.label,
    sub: a.stalls.map((s) => s.name).join(', ') + ' · due ' + sl.due,
    amount: sl.amount,
  });
  save(); render();
  toast(sl.label + ' — ' + money(sl.amount) + ' added to cart.', 'success');
}

/* on full payment the booth becomes CONFIRMED and feeds S.stalls */
function sbSettleConfirmations() {
  let changed = false;
  S.spaceBooking.applications.forEach((a) => {
    if (a.status === 'approved' && a.slabs.length && a.slabs.every((_, i) => sbSlabPaid(a, i))) {
      a.status = 'confirmed';
      a.confirmedAt = nowStr();
      a.stalls.forEach((st) => {
        if (!S.stalls.some((x) => x.stall === st.name)) {
          S.stalls.push({ id: 'st_' + st.name, hall: 'Hall ' + st.hall, stall: st.name, area: st.sqm });
        }
      });
      changed = true;
    }
  });
  if (changed) save();
}

/* ---------------- VIEW · My Spaces ---------------- */
function viewMySpaces() {
  sbSettleConfirmations();
  const apps = S.spaceBooking.applications;
  const hasConfirmed = apps.some((a) => a.status === 'confirmed') || S.stalls.length > 0;

  const hero = hasConfirmed ? '' :
    '<div class="hero-space" style="margin-bottom:18px"><span class="material-symbols-outlined watermark">storefront</span>' +
      '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
        '<h2 style="margin-top:0">Welcome to exhibition management</h2>' +
        '<p style="margin:8px 0 0;font-size:0.86rem;color:#CBDBF9">You haven’t booked a space yet. Secure your exhibition space to participate in the event.</p>' +
      '</div><div class="hero-actions"><a class="btn-hero" href="#/space-booking/book">Secure Your Space</a></div></div></div>';

  const statusPill = (a) => a.status === 'confirmed' ? '<span class="pill green">Confirmed</span>'
    : a.status === 'approved' ? '<span class="pill blue">Approved · Payment Due</span>'
    : '<span class="pill amber">Waiting for Approval</span>';

  const appCards = apps.map((a) => {
    const paid = a.slabs.reduce((x, _, i) => x + (sbSlabPaid(a, i) ? a.slabs[i].amount : 0), 0);
    const pct = a.total ? Math.round((paid / a.total) * 100) : 0;
    const slabRows = a.status === 'pending' ? '' :
      a.slabs.map((sl, i) =>
        '<div class="action-row" style="padding:9px 0">' +
          '<span class="aicon" style="background:' + (sbSlabPaid(a, i) ? 'var(--green-soft)' : '#FFF4E0') + ';color:' + (sbSlabPaid(a, i) ? 'var(--green)' : 'var(--amber)') + '">' +
            '<span class="material-symbols-outlined">' + (sbSlabPaid(a, i) ? 'task_alt' : 'schedule') + '</span></span>' +
          '<div class="atext"><b>' + sl.label + ' — ' + money(sl.amount) + '</b><span>Due: ' + sl.due + '</span></div>' +
          (sbSlabPaid(a, i) ? '<span class="pill green">Paid</span>'
            : sbSlabInCart(a, i) ? '<span class="pill amber">In Cart</span><button class="btn btn-primary btn-sm" onclick="openCart()">Pay</button>'
            : '<button class="btn btn-outline btn-sm" onclick="sbPaySlab(\'' + a.id + '\',' + i + ')">Add to Cart</button>') +
        '</div>').join('');
    return '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-head-row" style="margin-bottom:8px">' +
        '<b style="color:var(--blue)">' + esc(a.no) + '</b>' +
        '<div style="display:flex;gap:8px"><span class="pill gray">' + esc(a.type) + '</span>' + statusPill(a) + '</div></div>' +
      '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">' +
        '<div class="cell"><div class="k">Stall Name</div><div class="v">' + a.stalls.map((s) => esc(s.name)).join(', ') + '</div></div>' +
        '<div class="cell"><div class="k">Stall Area</div><div class="v">' + a.stalls.map((s) => s.size).join(', ') + ' / ' + a.stalls.reduce((x, s) => x + s.sqm, 0) + ' m²</div></div>' +
        '<div class="cell"><div class="k">Scheme</div><div class="v">' + a.stalls.map((s) => s.scheme === 'raw' ? 'Raw' : 'Shell').join(', ') + '</div></div>' +
        '<div class="cell"><div class="k">Open Sides</div><div class="v">' + esc(a.stalls[0].sides) + '</div></div>' +
        '<div class="cell"><div class="k">Total</div><div class="v">' + money(a.total) + '</div></div>' +
      '</div>' +
      (a.status === 'pending'
        ? '<div class="note amber" style="margin-top:12px"><b class="title">Next step</b>Your application is under review. You will be notified once it is approved. ' +
          '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="sbApprove(\'' + a.id + '\')"><span class="material-symbols-outlined" style="font-size:15px">verified</span>Simulate Organiser Approval (demo)</button></div>'
        : '<div style="margin-top:12px"><div class="pr-head" style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:700"><span>Payment Progress</span><span>' + pct + '%</span></div>' +
          '<div class="prog-bar" style="margin:4px 0 8px"><i style="width:' + pct + '%"></i></div>' + slabRows + '</div>') +
    '</div>';
  }).join('') ||
    '<div class="card"><div class="empty"><span class="material-symbols-outlined">grid_view</span>' +
    '<h3>No space applications yet</h3><p>Select stalls from Book Space to begin your booking.</p>' +
    '<a class="btn btn-primary" href="#/space-booking/book">Book Space</a></div></div>';

  /* right rail */
  const actions = [];
  apps.forEach((a) => {
    if (a.status === 'pending') actions.push(['pending_actions', 'Application under review', a.no + ' · waiting for organiser approval']);
    else if (a.status === 'approved') {
      const next = a.slabs.findIndex((_, i) => !sbSlabPaid(a, i));
      if (next >= 0) actions.push(['schedule', a.slabs[next].label + ' due', a.no + ' · ' + money(a.slabs[next].amount) + ' · due ' + a.slabs[next].due]);
    }
  });
  const outstanding = apps.reduce((x, a) => x + (a.status === 'pending' ? 0 :
    a.slabs.reduce((y, sl, i) => y + (sbSlabPaid(a, i) ? 0 : sl.amount), 0)), 0);
  const rail =
    '<div>' +
    '<div class="card" style="margin-bottom:14px"><h2 class="card-title">Upcoming Actions</h2>' +
      (actions.map((x) =>
        '<div class="action-row"><span class="aicon"><span class="material-symbols-outlined">' + x[0] + '</span></span>' +
        '<div class="atext"><b>' + x[1] + '</b><span>' + x[2] + '</span></div></div>').join('') ||
        '<p style="font-size:0.82rem;color:var(--muted);margin:6px 0 0">No upcoming actions right now.</p>') + '</div>' +
    '<div class="card" style="margin-bottom:14px"><h2 class="card-title">Total Outstanding Payment</h2>' +
      (apps.length === 0
        ? '<p style="font-size:0.82rem;color:var(--muted)">Your payment details will appear here once you book a space.</p>'
        : outstanding
          ? '<div style="font-size:1.5rem;font-weight:800;color:var(--red);margin-top:6px">' + money(outstanding) + '</div><p style="font-size:0.76rem;color:var(--muted);margin:2px 0 0">across ' + apps.filter((a) => a.status === 'approved').length + ' approved application(s)</p>'
          : '<div style="font-size:1.5rem;font-weight:800;color:var(--green);margin-top:6px">₹0</div><p style="font-size:0.76rem;color:var(--muted);margin:2px 0 0">No outstanding payment — all slab payments completed.</p>') + '</div>' +
    '<div class="card"><div class="card-head-row" style="margin-bottom:8px"><h2 class="card-title">Updates</h2></div>' +
      [['check_circle', 'var(--green)', 'Stall inventory refreshed for Halls A–E.', '2 days ago'],
       ['warning', 'var(--amber)', 'Slab payments past due may release your stall.', '4 days ago'],
       ['campaign', 'var(--blue)', 'New circular released: Exhibitor Guidelines.', '1 week ago']].map((u) =>
        '<div class="action-row" style="padding:9px 0"><span class="aicon" style="background:#F1F4FA;color:' + u[1] + '"><span class="material-symbols-outlined">' + u[0] + '</span></span>' +
        '<div class="atext"><b style="font-weight:600">' + u[2] + '</b><span>' + u[3] + '</span></div></div>').join('') + '</div>' +
    '</div>';

  return '<h1 class="page-title">My Spaces</h1>' +
    '<p class="page-sub">Your space applications, approval status and slab payments.</p>' +
    hero +
    '<div class="prof-layout"><div><h2 class="card-title" style="margin-bottom:10px">My Space Applications</h2>' + appCards + '</div>' + rail + '</div>';
}

/* ---------------- routes ---------------- */
ROUTES['space-booking/my'] = viewMySpaces;
ROUTES['space-booking/book'] = viewBookSpace;
ROUTES['space-booking/success'] = viewBookingSuccess;
