/* ============================================================
   Evenuefy — Co-Exhibitor / Aggregator Portal (coex.html)
   Login for companies a main exhibitor registered as co-exhibitors
   (Separate, registration paid) or Aggregators (approved by the
   organiser). Subsidiary companies have no login.

   The portal hosts the SAME modules as the main exhibitor app
   (app.js core + profile / exhibition / b2b / aircraft) on the
   company's own workspace (exhibitors.js → sbCoexProfile), so
   Exhibition Forms, Digital Showcase, Aircraft Registration,
   B2B Matchmaking, Meeting Rooms and B2B Meetings behave exactly
   as for a main exhibitor, with the company's own cart, orders,
   invoices and notifications. Admin and committee read every
   workspace (exhibitors.js → sbWorkspaces).

   Stall space and pass quotas stay in the MAIN exhibitor's state:
   only what the main exhibitor allocates is shown, and passes are
   filled against that quota (written back to the main exhibitor).
   ============================================================ */

'use strict';

const CX = EXH && EXH.parent ? EXH : null;     // logged-in company profile (null on the login screen)
const CX_EVENT_DAYS = EVENT.eventDays;
const cxMain = () => (CX ? CX.parent.company : 'the main exhibitor');

/* ---------------- main exhibitor's state (stall allocation & pass quota) ---------------- */
/* the main exhibitor's state, with its 9(y) invite entitlement brought up to date (complimentary 1 + 1 per co-exhibitor) */
function cxEx() { const st = CX ? sbReadState(CX.parent.lsKey) : null; if (st) sbCeremonySync(st); return st; }
function cxSaveEx(st) { try { localStorage.setItem(CX.parent.lsKey, JSON.stringify(st)); } catch (e) { /* ignore */ } }
function cxRecord(ex) { return ((ex && ex.coexhibitors) || []).find((c) => c.id === CX.coexId) || null; }
function cxUid(st, k) { st.seq[k] = (st.seq[k] || 0) + 1; return k + '_' + st.seq[k]; }

const cxIsAgg = (c) => !!c && c.type === 'aggregator';
const cxTypeLabel = (c) => (cxIsAgg(c) ? 'Aggregator Company' : c.type === 'separate' ? 'Separate Company' : 'Subsidiary Company');
const cxRoleLabel = (c) => (cxIsAgg(c) ? 'Aggregator' : 'Co-Exhibitor');

/* ---------------- quota math (mirror of app.js, on the main exhibitor's state) ---------------- */
function cxQuota(ex, catId) {
  const q = (ex.quotas || []).find((x) => x.coexId === CX.coexId && x.catId === catId);
  return q ? q.quota : 0;
}
function cxUsed(ex, catId) { return (ex.passes || []).filter((p) => p.catId === catId && p.coexId === CX.coexId && p.status !== 'rejected').length; }
function cxCats(ex, kind) { return (ex.categories || []).filter((cat) => cat.kind === kind && cxQuota(ex, cat.id) > 0); }
const CX_KINDS = ['badge', 'invitee', 'vehicle', 'ceremony'];

/* ============================================================
   Login / logout
   ============================================================ */
function cxFillLogin() {
  const list = sbCoexLogins();
  const sel = $('lgCoex');
  if (!list.length) {
    $('noCoexNote').style.display = '';
    $('loginForm').style.display = 'none';
    return;
  }
  $('noCoexNote').style.display = 'none';
  $('loginForm').style.display = '';
  sel.innerHTML = list.map((c) =>
    '<option value="' + esc(c.value) + '">' + esc(c.company) + ' — ' + (c.type === 'aggregator' ? 'Aggregator' : 'Co-Exhibitor') + ' of ' + esc(c.parent.company) + '</option>').join('');
  cxSyncLoginEmail();
}
function cxSyncLoginEmail() {
  const c = sbCoexLogins().find((x) => x.value === $('lgCoex').value);
  $('lgEmail').value = c ? c.email : '';
}
function coexLogin(e) {
  e.preventDefault();
  clearErrs();
  if (!$('lgPassword').value) { setErr('lgPassword', 'Password is required'); return false; }
  const value = $('lgCoex').value;
  const c = sbCoexLogins().find((x) => x.value === value);
  // Guard: login works only for paid Separate co-exhibitors / approved Aggregators
  if (!c) {
    toast('Login is enabled only after the registration payment is completed by the main exhibitor (co-exhibitor) or organiser approval (aggregator).', 'error');
    return false;
  }
  try { sessionStorage.setItem(SB_COEX_SESSION_KEY, value); sessionStorage.setItem('evenuefy_coex_welcome', c.company); } catch (err) { /* ignore */ }
  location.hash = '#/dashboard';
  location.reload(); // load the company's own workspace
  return false;
}
function coexLogout() {
  try { sessionStorage.removeItem(SB_COEX_SESSION_KEY); } catch (e) { /* ignore */ }
  location.hash = '';
  location.reload();
}

/* ============================================================
   Workspace: one-time identity seeding + stall sync
   ============================================================ */
/* module migrations seed demo data for HAL — replace it once with this company's own identity */
function cxBlank(o) {
  Object.keys(o).forEach((k) => {
    const v = o[k];
    if (typeof v === 'string') o[k] = '';
    else if (Array.isArray(v)) o[k] = [];
    else if (v && typeof v === 'object') cxBlank(v);
  });
  return o;
}
function cxSeedWorkspace(rec) {
  if (S.wsIdentity === CX.id) return;
  const phone = rec.nodalMobile ? (rec.nodalCc || '+91') + ' ' + rec.nodalMobile : '';
  const nodal = [rec.nodalFirst, rec.nodalLast].filter(Boolean).join(' ') || rec.company;
  const p = S.profile;
  const docs = (p.documents || []).map((d) => ({ id: d.id, name: d.name, file: '', at: '' }));
  cxBlank(p);
  p.documents = docs;
  p.company.email = rec.email;
  p.company.phone = phone;
  p.compliance.msme = 'No';
  p.compliance.selfCert = 'No';
  p.regAddress.country = CX.country;
  p.billing.country = CX.country;
  Object.assign(p.contacts.primary, { first: rec.nodalFirst || '', last: rec.nodalLast || '', designation: rec.nodalDesig || '', email: rec.email, phone: phone });
  p.approved = false; p.approvedAt = '';
  p.matchmaking = { keywords: [], exCats: {}, offering: {}, lookingFor: {} };
  S.booth = { videos: [], documents: [] };
  S.b2b.meetings = []; S.b2b.favs = []; S.b2b.prefsDone = false; S.b2b.noDemo = true;
  S.b2b.team = [{ id: 'tm_main', name: nodal, desig: 'Nodal Officer (Main Login)', email: rec.email }];
  S.notifications = [
    { id: 'cxn1', icon: 'waving_hand', color: 'var(--green)', text: 'Welcome, ' + rec.company + ' — your ' + cxRoleLabel(rec).toLowerCase() + ' login is active. Stall space and pass quotas are allotted by ' + cxMain() + '.', time: 'Just now', read: false },
    { id: 'cxn2', icon: 'warning', color: 'var(--amber)', text: 'Exhibition forms are due by 31 Dec 2026 — 5 forms pending.', time: 'Just now', read: false },
    { id: 'cxn3', icon: 'flight', color: 'var(--blue)', text: 'Aircraft registration window is open for Static & Flying Display.', time: 'Just now', read: true },
  ];
  S.wsIdentity = CX.id;
  save();
}
/* stall space allotted by the main exhibitor → this workspace's stalls (forms, showcase booth labels) */
function cxSyncStalls() {
  const ex = cxEx();
  const allocs = ((ex && ex.allocations) || []).filter((a) => a.coexId === CX.coexId);
  S.stalls = allocs.map((a) => {
    const st = (ex.stalls || []).find((s) => s.id === a.stallId) || {};
    return { id: 'alloc_' + a.id, hall: st.hall || '—', stall: st.stall || '—', area: a.sqm, allocated: true };
  });
  save();
}
/* Passes: show only the pass types the main exhibitor has allocated quota for */
function cxUpdateNav() {
  const ex = cxEx() || {};
  let any = false;
  CX_KINDS.forEach((k) => {
    const has = cxCats(ex, k).length > 0;
    any = any || has;
    const el = $('navPass_' + k); if (el) el.style.display = has ? '' : 'none';
  });
  $('navPassLabel').style.display = any ? '' : 'none';
  $('navPassGroup').style.display = any ? '' : 'none';
}

function cxEnterApp() {
  const ex = cxEx();
  const rec = cxRecord(ex);
  if (!sbCoexEligible(rec)) { coexLogout(); return; }
  cxSeedWorkspace(rec);
  cxSyncStalls();
  $('loginScreen').style.display = 'none';
  $('appShell').style.display = 'flex';
  $('chipCoex').textContent = rec.company;
  $('navCompanyName').textContent = rec.company;
  $('portalRole').textContent = cxRoleLabel(rec).toUpperCase();
  document.title = rec.company + ' · ' + cxRoleLabel(rec) + ' · Evenuefy';
  cxUpdateNav();
  if (!location.hash) location.hash = '#/dashboard';
  render();
  let welcome = null;
  try { welcome = sessionStorage.getItem('evenuefy_coex_welcome'); sessionStorage.removeItem('evenuefy_coex_welcome'); } catch (e) { /* ignore */ }
  if (welcome) toast('Logged in as ' + welcome, 'success');
}

/* ============================================================
   Routes hosted by this portal (app.js router)
   ============================================================ */
const CX_EXACT = ['dashboard', 'stall', 'orders', 'passes/badges', 'passes/invitee', 'passes/vehicle', 'passes/ceremony',
  'digital-showcase', 'products', 'conference-hall', 'meeting-room'];
const CX_PREFIX = ['exhibition-forms', 'aircraft', 'b2b-matchmaking', 'booth'];
function portalRouteAllowed(route) {
  return CX_EXACT.indexOf(route) >= 0 || CX_PREFIX.some((p) => route === p || route.indexOf(p + '/') === 0);
}

/* ============================================================
   VIEW · Dashboard — registration profile + services + allocations
   ============================================================ */
function cxStatusPill(c) {
  if (cxIsAgg(c)) {
    if (c.status === 'active') return '<span class="pill green">Approved by Organiser</span>';
    if (c.status === 'rejected') return '<span class="pill red">Rejected</span>';
    return '<span class="pill amber">Pending Organiser Approval</span>';
  }
  if (c.status === 'active') return '<span class="pill green">Active</span>';
  return '<span class="pill amber">Registration Payment Pending</span>';
}

function cxViewDashboard() {
  if (!CX) return '';
  const ex = cxEx();
  const c = cxRecord(ex);
  if (!c) return '';
  const allocs = (ex.allocations || []).filter((a) => a.coexId === c.id);
  const totalSqm = allocs.reduce((a, x) => a + (x.sqm || 0), 0);
  const totalQuota = (ex.quotas || []).filter((q) => q.coexId === c.id).reduce((a, q) => a + q.quota, 0);
  const totalPasses = (ex.passes || []).filter((p) => p.coexId === c.id).length;

  let note = '';
  if (cxIsAgg(c) && totalSqm === 0 && totalQuota === 0) {
    note = '<div class="note green"><b class="title">Approved by the organiser</b>' +
      'Your aggregator registration was approved on ' + esc(c.approvedAt || '') + ' and login credentials were emailed to ' + esc(c.email) + '. ' +
      'Stall space and pass quotas will appear here once ' + esc(cxMain()) + ' allots them.</div>';
  } else if (totalSqm === 0 && totalQuota === 0) {
    note = '<div class="note"><b class="title">Nothing assigned yet</b>' +
      'Your registration is active, but ' + esc(cxMain()) + ' has not allocated stall space or pass quotas yet. ' +
      'They will appear here automatically once assigned.</div>';
  }

  const tiles =
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Company Type</div><div class="t-value" style="font-size:1.15rem">' + (cxIsAgg(c) ? 'Aggregator' : 'Separate') + '</div></div>' +
      '<div class="tile"><div class="t-label">Registration Status</div><div class="t-value" style="font-size:1rem;padding-top:6px">' + cxStatusPill(c) + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Allocated Space</div><div class="t-value">' + totalSqm + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>' +
      '<div class="tile"><div class="t-label">Pass Quota / Filled</div><div class="t-value">' + totalQuota + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + totalPasses + ' filled</span></div></div>' +
    '</div>';

  /* services — same modules as the main exhibitor, on this company's workspace */
  const feat = (route, color, icon, title, sub) =>
    '<div class="feat-card" onclick="location.hash=\'' + route + '\'">' +
      '<span class="material-symbols-outlined fgo">arrow_forward</span>' +
      '<span class="ficon ' + color + '"><span class="material-symbols-outlined">' + icon + '</span></span>' +
      '<span class="ftitle">' + title + '</span>' + (sub ? '<span class="fsub">' + sub + '</span>' : '') + '</div>';
  const products = ((S.profile.business && S.profile.business.products) || []).length;
  const boothItems = ((S.booth && S.booth.videos) || []).length + ((S.booth && S.booth.documents) || []).length;
  const kindCount = (k) => (S.bookings || []).filter((b) => b.kind === k).length;
  const formsDone = typeof exFormsSubmitted === 'function' ? exFormsSubmitted() : 0;
  const services =
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Exhibition Services</h2>' +
      (S.cart.length ? '<button class="btn btn-primary btn-sm" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>' + S.cart.length + ' item(s) in cart</button>' : '') + '</div>' +
      '<div class="feat-grid" style="margin-top:0">' +
        feat('#/exhibition-forms', 'fc-purple', 'assignment', 'Exhibition Forms', formsDone + ' of ' + (typeof EXFORM_META !== 'undefined' ? EXFORM_META.length : 5) + ' forms submitted') +
        feat('#/digital-showcase', 'fc-red', 'storefront', 'Digital Showcase', products + ' product(s) · ' + boothItems + ' booth item(s)') +
        feat('#/aircraft', 'fc-cyan', 'flight', 'Aircraft Registration', (S.aircraft || []).length + ' application(s)') +
      '</div></div>' +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Meetings &amp; Networking</h2></div>' +
      '<div class="feat-grid" style="margin-top:0">' +
        feat('#/b2b-matchmaking', 'fc-teal', 'hub', 'B2B Matchmaking', ((S.b2b && S.b2b.meetings) || []).length + ' meeting request(s)') +
        feat('#/conference-hall', 'fc-blue', 'meeting_room', 'Meeting Rooms', kindCount('conference') + ' booking(s)') +
        feat('#/meeting-room', 'fc-orange', 'groups_2', 'B2B Meetings', kindCount('b2b') + ' table booking(s)') +
      '</div></div>';

  /* passes allocated by the main exhibitor */
  const passRows = CX_KINDS.flatMap((k) => cxCats(ex, k).map((cat) => {
    const q = cxQuota(ex, cat.id), used = cxUsed(ex, cat.id);
    const route = passRouteOf(k);
    return '<tr><td class="td-strong">' + esc(cat.name) + '</td><td class="num">' + q + '</td><td class="num">' + used + '</td><td class="num">' + (q - used) + '</td>' +
      '<td class="td-actions"><a class="btn-link" href="#/' + route + '">Manage</a></td></tr>';
  })).join('');
  const passes = '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Passes Allocated</h2>' +
      '<span class="result-count">allocated by ' + esc(cxMain()) + '</span></div>' +
    (passRows
      ? '<div class="tablewrap"><table class="grid"><tr><th>Category</th><th>Quota</th><th>Filled</th><th>Balance</th><th></th></tr>' + passRows + '</table></div>'
      : '<p style="font-size:0.84rem;color:var(--muted);margin:0">No pass quota allocated yet — ' + esc(cxMain()) + ' allocates badges, invitee and vehicle passes from its portal.</p>') +
    '</div>';

  const profile =
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">My Registration</h2>' +
      '<span class="result-count">Registered by ' + esc(cxMain()) + ' · ' + esc(c.createdAt || '') + '</span></div>' +
    '<form onsubmit="return cxSaveProfile(event)" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Company Name</label><input type="text" value="' + esc(c.company) + '" readonly><div class="hint">Set at registration — contact the organiser to change.</div></div>' +
      '<div class="field"><label>Registration Number</label><input type="text" value="' + esc(c.regNo || '—') + '" readonly></div>' +
      '<div class="field"><label>Login Email</label><input type="email" value="' + esc(c.email) + '" readonly><div class="hint">This is your login identity.</div></div>' +
      '<div class="field"><label>Company Type</label><input type="text" value="' + cxTypeLabel(c) + '" readonly></div>' +
      '<div class="field"><label>Nodal Person — First Name <span class="req">*</span></label><input type="text" id="pfFirst" value="' + esc(c.nodalFirst || '') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Nodal Person — Last Name <span class="req">*</span></label><input type="text" id="pfLast" value="' + esc(c.nodalLast || '') + '"><div class="error"></div></div>' +
      mobileFieldHtml('pf', 'Nodal Contact Number', { cc: c.nodalCc, value: c.nodalMobile || '' }) +
      '<div class="field"><label>Designation</label><input type="text" id="pfDesig" value="' + esc(c.nodalDesig || '') + '" placeholder="e.g. Marketing Head"></div>' +
    '</div>' +
    '<div style="margin-top:16px;display:flex;justify-content:flex-end">' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">save</span>Save Profile</button>' +
    '</div></form></div>';

  return '<h1 class="page-title">' + cxRoleLabel(c) + ' Dashboard</h1>' +
    '<p class="page-sub">Welcome, <b>' + esc(c.company) + '</b> — ' + (cxIsAgg(c) ? 'aggregator company' : 'co-exhibitor') + ' of ' + esc(cxMain()) + '.</p>' +
    tiles + note + services + passes + profile;
}

function cxSaveProfile(e) {
  e.preventDefault();
  clearErrs();
  const first = $('pfFirst').value.trim();
  const last = $('pfLast').value.trim();
  let ok = true;
  if (!first) { setErr('pfFirst', 'First name is required'); ok = false; }
  if (!last) { setErr('pfLast', 'Last name is required'); ok = false; }
  const ph = readMobile('pf', false);
  if (!ph) ok = false;
  if (!ok) return false;
  const ex = cxEx();
  const c = cxRecord(ex);
  if (!c) return false;
  c.nodalFirst = first; c.nodalLast = last;
  c.nodalCc = ph.cc; c.nodalMobile = ph.mobile; c.nodalDesig = $('pfDesig').value.trim();
  cxSaveEx(ex);
  render();
  toast('Profile updated', 'success');
  return false;
}

/* ============================================================
   VIEW · My Stall Space (read-only — allotted by main exhibitor)
   ============================================================ */
function cxViewStall() {
  if (!CX) return '';
  const ex = cxEx();
  const allocs = (ex.allocations || []).filter((a) => a.coexId === CX.coexId);
  const stallOf = (id) => (ex.stalls || []).find((s) => s.id === id) || {};
  const totalSqm = allocs.reduce((a, x) => a + (x.sqm || 0), 0);
  const rows = allocs.map((a, i) => {
    const st = stallOf(a.stallId);
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(st.hall || '—') + '</td>' +
      '<td><span class="regno">' + esc(st.stall || '—') + '</span></td>' +
      '<td class="num">' + a.sqm + ' sqm</td></tr>';
  }).join('') ||
    '<tr><td colspan="4" style="color:var(--muted)">No stall space allocated yet — the main exhibitor allocates it from its portal.</td></tr>';
  return '<h1 class="page-title">My Stall Space</h1>' +
    '<p class="page-sub">Space allotted to you by ' + esc(cxMain()) + ' from its booked stalls. Allocation is managed by the main exhibitor.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Allocated</div><div class="t-value">' + totalSqm + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>' +
      '<div class="tile"><div class="t-label">Allocations</div><div class="t-value">' + allocs.length + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Allocated Stall Space</h2>' +
      '<button class="btn btn-outline btn-sm" onclick="render()"><span class="material-symbols-outlined" style="font-size:16px">refresh</span>Refresh</button></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Hall</th><th>Stall No.</th><th>Allocated Area</th></tr>' +
    rows + '</table></div></div>';
}

/* ============================================================
   VIEW · Passes (badge | invitee | vehicle) — fill against quota
   ============================================================ */
const CX_KIND_TITLE = { badge: 'Badge Details', invitee: 'Invitee Details', vehicle: 'Vehicle Pass Details', ceremony: 'Inaugural & Dinner Invites' };
function cxInvPill(p) {
  if (p.status === 'pending_approval') return '<span class="pill amber">Pending Approval</span>';
  if (p.status === 'rejected') return '<span class="pill red">Rejected</span>' + (p.remark ? '<span class="td-sub" style="color:var(--red)">' + esc(p.remark) + '</span>' : '');
  return '<span class="pill green">' + (p.approvedAt ? 'Approved' : 'Issued') + '</span>' + (p.approvedAt ? '<span class="td-sub">' + esc(p.approvedAt) + '</span>' : '');
}
const CX_KIND_SUB = {
  badge: 'Badge quota assigned to you by the main exhibitor. Register your team members against the quota.',
  invitee: 'Invitee pass quota assigned to you. Registration is date-wise for each event day. Each invitee is confirmed only after the main exhibitor’s nodal officer approves it; rejected entries release the quota.',
  vehicle: 'Vehicle pass quota assigned to you. Register driver & vehicle details against the quota.',
  ceremony: 'Under T&C 9(y) each co-exhibitor receives 1 Inaugural Function invite and 1 Dinner invite on a complimentary basis (plus any extra assigned by the main exhibitor). Nominate your delegate — the nomination is confirmed once the main exhibitor’s nodal officer approves it, and the e-invite is then available here.',
};

function cxViewPasses(kind) {
  if (!CX) return '';
  const ex = cxEx();
  const cats = cxCats(ex, kind);
  if (!cats.length) {
    return '<h1 class="page-title">' + CX_KIND_TITLE[kind] + '</h1>' +
      '<p class="page-sub">' + CX_KIND_SUB[kind] + '</p>' +
      '<div class="card"><div class="empty"><span class="material-symbols-outlined">' +
      (kind === 'vehicle' ? 'directions_car' : kind === 'invitee' ? 'mail' : kind === 'ceremony' ? 'celebration' : 'badge') + '</span>' +
      '<h3>No quota assigned</h3><p>' + esc(cxMain()) + ' has not assigned you any ' +
      (kind === 'vehicle' ? 'vehicle pass' : kind === 'invitee' ? 'invitee' : kind === 'ceremony' ? 'inaugural / dinner invite' : 'badge') +
      ' quota yet. It will appear here automatically once assigned.</p></div></div>';
  }

  const quotaRows = cats.map((cat, i) => {
    const q = cxQuota(ex, cat.id);
    const used = cxUsed(ex, cat.id);
    const bal = q - used;
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(cat.name) + '</td>' +
      '<td class="num">' + q + '</td><td class="num">' + used + '</td><td class="num">' + bal + '</td>' +
      '<td class="td-actions"><button class="btn btn-outline btn-sm" onclick="cxOpenPassForm(\'' + cat.id + '\')"' + (bal <= 0 ? ' disabled' : '') + '>' +
        '<span class="material-symbols-outlined" style="font-size:16px">add</span>Add</button></td></tr>';
  }).join('');

  const myPasses = (ex.passes || []).filter((p) => p.coexId === CX.coexId && cats.some((cat) => cat.id === p.catId));
  const catName = (id) => ((ex.categories || []).find((x) => x.id === id) || {}).name || '—';

  let passHead, passRows;
  if (kind === 'vehicle') {
    passHead = '<tr><th>No.</th><th>Driver</th><th>Vehicle No.</th><th>Seater</th><th>Category</th><th>Status</th><th>Created</th></tr>';
    passRows = myPasses.map((p, i) =>
      '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(p.data.driverName) + '<span class="td-sub">' + esc(p.data.driverMobile || '') + '</span></td>' +
      '<td><span class="regno">' + esc(p.data.vehicleNo) + '</span></td>' +
      '<td>' + esc(p.data.seater || '—') + '</td>' +
      '<td>' + esc(catName(p.catId)) + '</td>' +
      '<td><span class="pill green">Issued</span></td>' +
      '<td>' + esc(p.createdAt) + '</td></tr>').join('');
  } else {
    passHead = '<tr><th>No.</th><th>Name</th><th>Email / Mobile</th><th>Designation</th>' +
      (kind === 'invitee' ? '<th>Event Dates</th><th>Status</th>' : kind === 'ceremony' ? '<th>Status</th><th>E-Invite</th>' : '') + '<th>Category</th><th>Created</th></tr>';
    passRows = myPasses.map((p, i) =>
      '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(p.data.firstName + ' ' + p.data.lastName) + '</td>' +
      '<td class="contact-cell">' + esc(p.data.email) + '<br><span class="ph">' + esc(p.data.mobile || '') + '</span></td>' +
      '<td>' + esc(p.data.designation || '—') + '</td>' +
      (kind === 'invitee' ? '<td>' + esc((p.data.dates || []).join(', ')) + '</td><td>' + cxInvPill(p) + '</td>' : '') +
      (kind === 'ceremony' ? '<td>' + cxInvPill(p) + '</td><td>' + (p.status === 'issued' && p.inviteNo ? '<button class="btn-link" onclick="cxOpenEInvite(\'' + p.id + '\')">' + esc(p.inviteNo) + '</button>' : '—') + '</td>' : '') +
      '<td>' + esc(catName(p.catId)) + '</td>' +
      '<td>' + esc(p.createdAt) + '</td></tr>').join('');
  }
  passRows = passRows || '<tr><td colspan="7" style="color:var(--muted)">No passes filled yet — use the Add button above to register against your quota.</td></tr>';

  return '<h1 class="page-title">' + CX_KIND_TITLE[kind] + '</h1>' +
    '<p class="page-sub">' + CX_KIND_SUB[kind] + '</p>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">My Quota</h2>' +
      '<button class="btn btn-outline btn-sm" onclick="render()"><span class="material-symbols-outlined" style="font-size:16px">refresh</span>Refresh</button></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Category Name</th><th>Quota Assigned</th><th>Filled</th><th>Balance</th><th>Action</th></tr>' +
    quotaRows + '</table></div></div>' +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Listing View</h2></div>' +
    '<div class="tablewrap"><table class="grid">' + passHead + passRows + '</table></div></div>';
}

/* ---------------- Add pass (badge / invitee / vehicle) ---------------- */
function cxToggleDay(i) {
  const cb = $('day' + i);
  cb.checked = !cb.checked;
  $('dayChk' + i).classList.toggle('selected', cb.checked);
}

function cxOpenPassForm(catId) {
  const ex = cxEx();
  const cat = (ex.categories || []).find((x) => x.id === catId);
  if (!cat) return;
  const bal = cxQuota(ex, catId) - cxUsed(ex, catId);
  if (bal <= 0) { toast('No quota balance left in this category.', 'error'); return; }
  const balNote = '<div class="note" style="margin-top:0"><b class="title">' + esc(cat.name) + '</b>' +
    'Balance quota: <b>' + bal + '</b>. This pass will consume your assigned quota.</div>';

  if (cat.kind === 'vehicle') {
    openModal('Add Vehicle Pass — ' + esc(cat.name),
      balNote +
      '<form id="vForm" onsubmit="return cxSaveVehiclePass(event, \'' + catId + '\')" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Driver Name <span class="req">*</span></label><input type="text" id="vName"><div class="error"></div></div>' +
        '<div class="field"><label>Driver Mobile <span class="req">*</span></label><input type="tel" id="vMobile" placeholder="10-digit mobile"><div class="error"></div></div>' +
        '<div class="field"><label>Vehicle Number <span class="req">*</span></label><input type="text" id="vNo" placeholder="KA-01-AB-1234"><div class="error"></div></div>' +
        '<div class="field"><label>Seater <span class="req">*</span></label><select id="vSeater"><option>6 Seater</option><option>12 Seater</option></select></div>' +
        '<div class="field"><label>Driving Licence No. <span class="req">*</span></label><input type="text" id="vDl"><div class="error"></div></div>' +
        '<div class="field"><label>Upload DL Copy <span class="req">*</span></label><input type="file" id="vDlFile" accept=".pdf,image/*"><div class="error"></div></div>' +
      '</div></form>',
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="document.getElementById(\'vForm\').requestSubmit()"><span class="material-symbols-outlined">save</span>Save Pass</button>', true);
    return;
  }

  if (cat.kind === 'ceremony') {
    openCeremonyForm(catId, null, balNote);
    $('cOrg').value = CX.company;
    $('cerForm').setAttribute('onsubmit', 'return cxSaveCeremony(event, \'' + catId + '\')');
    return;
  }

  const dateChecks = cat.kind === 'invitee'
    ? '<div class="field full"><label>Event Date Selection <span class="req">*</span></label>' +
      '<div class="checks">' + CX_EVENT_DAYS.map((d, i) =>
        '<label class="check-item" id="dayChk' + i + '" onclick="cxToggleDay(' + i + ')"><input type="checkbox" id="day' + i + '" value="' + d + '">' + d + '</label>').join('') +
      '</div><div class="error" id="dayErr" style="display:none;color:var(--red);font-size:0.75rem;font-weight:600;margin-top:4px">Select at least one event date</div></div>'
    : '';

  openModal('Add ' + (cat.kind === 'invitee' ? 'Invitee' : 'Badge') + ' — ' + esc(cat.name),
    balNote +
    '<form id="pForm" onsubmit="return cxSaveBadgePass(event, \'' + catId + '\')" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>First Name <span class="req">*</span></label><input type="text" id="pFirst"><div class="error"></div></div>' +
      '<div class="field"><label>Last Name <span class="req">*</span></label><input type="text" id="pLast"><div class="error"></div></div>' +
      '<div class="field"><label>Email <span class="req">*</span></label><input type="email" id="pEmail"><div class="error"></div></div>' +
      '<div class="field"><label>Mobile <span class="req">*</span></label><input type="tel" id="pMobile" placeholder="10-digit mobile"><div class="error"></div></div>' +
      '<div class="field"><label>Designation</label><input type="text" id="pDesig"></div>' +
      dateChecks +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="document.getElementById(\'pForm\').requestSubmit()"><span class="material-symbols-outlined">save</span>Save Pass</button>', true);
}

function cxSaveBadgePass(e, catId) {
  e.preventDefault();
  clearErrs();
  const ex = cxEx();
  const cat = (ex.categories || []).find((x) => x.id === catId);
  const first = $('pFirst').value.trim();
  const last = $('pLast').value.trim();
  const email = $('pEmail').value.trim();
  const mobile = $('pMobile').value.trim();
  let ok = true;
  if (!first) { setErr('pFirst', 'First name is required'); ok = false; }
  if (!last) { setErr('pLast', 'Last name is required'); ok = false; }
  if (!email) { setErr('pEmail', 'Email is required'); ok = false; }
  else if (!EMAIL_RE.test(email)) { setErr('pEmail', 'Enter a valid email address'); ok = false; }
  if (!mobile) { setErr('pMobile', 'Mobile is required'); ok = false; }
  else if (!MOBILE_RE.test(mobile)) { setErr('pMobile', 'Enter a valid 10-digit mobile'); ok = false; }
  let days = [];
  if (cat.kind === 'invitee') {
    days = CX_EVENT_DAYS.filter((d, i) => $('day' + i).checked);
    if (!days.length) { $('dayErr').style.display = 'block'; ok = false; }
  }
  if (!ok) return false;
  if (cxQuota(ex, catId) - cxUsed(ex, catId) <= 0) { toast('No quota balance left in this category.', 'error'); return false; }
  const isInvitee = cat.kind === 'invitee';
  ex.passes.push({
    id: cxUid(ex, 'pass'), catId: catId, coexId: CX.coexId,
    data: { firstName: first, lastName: last, email: email, mobile: mobile, designation: $('pDesig').value.trim(), dates: days },
    // invitee entries are confirmed only after the main exhibitor's nodal officer approves them
    status: isInvitee ? 'pending_approval' : 'issued', amount: 0, createdAt: nowStr(), submittedBy: CX.company,
  });
  if (isInvitee) {
    if (!ex.notifications) ex.notifications = [];
    ex.notifications.unshift({ id: 'nt_' + Date.now(), icon: 'how_to_reg', color: 'var(--amber)',
      text: CX.company + ' submitted invitee ' + first + ' ' + last + ' — awaiting your nodal officer approval.', time: nowStr(), read: false });
  }
  cxSaveEx(ex);
  closeModal(); render();
  toast(isInvitee ? 'Invitee ' + first + ' ' + last + ' submitted — awaiting approval by ' + cxMain() + '’s nodal officer.' : 'Pass saved for ' + first + ' ' + last, 'success');
  return false;
}

/* inaugural / dinner nomination — written to the main exhibitor's state, pending its nodal officer's approval */
function cxSaveCeremony(e, catId) {
  e.preventDefault();
  clearErrs();
  const ex = cxEx();
  const cat = (ex.categories || []).find((x) => x.id === catId);
  const d = cerReadForm();
  if (!d) return false;
  if ((ex.passes || []).some((p) => p.catId === catId && p.status !== 'rejected' && ((p.data.email || '').toLowerCase() === d.email.toLowerCase() || p.data.idNo === d.idNo))) {
    setErr('pEmail', 'This person is already nominated for this invite'); return false;
  }
  if (cxQuota(ex, catId) - cxUsed(ex, catId) <= 0) { toast('No invite left in this category.', 'error'); return false; }
  d.organisation = CX.company;
  ex.passes.push({ id: cxUid(ex, 'pass'), catId: catId, coexId: CX.coexId, data: d, status: 'pending_approval', amount: 0, createdAt: nowStr(), submittedBy: CX.company });
  if (!ex.notifications) ex.notifications = [];
  ex.notifications.unshift({ id: 'nt_' + Date.now(), icon: 'celebration', color: 'var(--amber)',
    text: CX.company + ' nominated ' + d.firstName + ' ' + d.lastName + ' for the ' + cat.name + ' — awaiting your nodal officer approval.', time: nowStr(), read: false });
  cxSaveEx(ex);
  closeModal(); render();
  toast(cat.name + ' nomination for ' + d.firstName + ' ' + d.lastName + ' submitted — awaiting approval by ' + cxMain() + '’s nodal officer.', 'success');
  return false;
}
function cxOpenEInvite(passId) {
  const p = ((cxEx() || {}).passes || []).find((x) => x.id === passId && x.coexId === CX.coexId);
  if (p && p.status === 'issued') cerOpenInvite(p, CX.company);
}

function cxSaveVehiclePass(e, catId) {
  e.preventDefault();
  clearErrs();
  const ex = cxEx();
  const name = $('vName').value.trim();
  const mobile = $('vMobile').value.trim();
  const vehNo = $('vNo').value.trim();
  const dlNo = $('vDl').value.trim();
  const dlFile = $('vDlFile').files[0];
  let ok = true;
  if (!name) { setErr('vName', 'Driver name is required'); ok = false; }
  if (!mobile) { setErr('vMobile', 'Mobile is required'); ok = false; }
  else if (!MOBILE_RE.test(mobile)) { setErr('vMobile', 'Enter a valid 10-digit mobile'); ok = false; }
  if (!vehNo) { setErr('vNo', 'Vehicle number is required'); ok = false; }
  else if (!VEHNO_RE.test(vehNo)) { setErr('vNo', 'Enter a valid vehicle number (e.g. KA-01-AB-1234)'); ok = false; }
  if (!dlNo) { setErr('vDl', 'Driving licence number is required'); ok = false; }
  if (!dlFile) { setErr('vDlFile', 'Upload the DL copy'); ok = false; }
  if (!ok) return false;
  if (cxQuota(ex, catId) - cxUsed(ex, catId) <= 0) { toast('No quota balance left in this category.', 'error'); return false; }
  ex.passes.push({
    id: cxUid(ex, 'pass'), catId: catId, coexId: CX.coexId,
    data: {
      driverName: name, driverMobile: mobile, vehicleNo: vehNo.toUpperCase(),
      dlNumber: dlNo, dlFile: dlFile.name, seater: $('vSeater').value, company: CX.company,
    },
    status: 'issued', amount: 0, createdAt: nowStr(),
  });
  cxSaveEx(ex);
  closeModal(); render();
  toast('Vehicle pass saved for ' + name, 'success');
  return false;
}

/* ---------------- routes (override the main exhibitor's dashboard & pass pages) ---------------- */
ROUTES.dashboard = cxViewDashboard;
ROUTES.stall = cxViewStall;
ROUTES['passes/badges'] = () => cxViewPasses('badge');
ROUTES['passes/invitee'] = () => cxViewPasses('invitee');
ROUTES['passes/vehicle'] = () => cxViewPasses('vehicle');
ROUTES['passes/ceremony'] = () => cxViewPasses('ceremony');

// Live-refresh when the main exhibitor (another tab) allocates space / quota or changes the registration
window.addEventListener('storage', (e) => {
  if (!CX || e.key !== CX.parent.lsKey) return;
  if (!sbCoexEligible(cxRecord(cxEx()))) { coexLogout(); return; }
  cxSyncStalls(); cxUpdateNav(); render();
});

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (CX) { cxEnterApp(); return; }
  try { sessionStorage.removeItem(SB_COEX_SESSION_KEY); } catch (e) { /* stale session for a removed company */ }
  const sel = $('lgCoex');
  if (sel) sel.addEventListener('change', cxSyncLoginEmail);
  cxFillLogin();
});
