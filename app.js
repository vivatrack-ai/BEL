/* ============================================================
   Evenuefy — Co-Exhibitor Module (functional prototype)
   State persists in localStorage. Reset via footer link.
   ============================================================ */

'use strict';

/* ---------------- Seed data (mirrors dev.evenuefy.com) ---------------- */
const EVENT = {
  name: 'Aero India 2027',
  dates: '10th to 15th Feb 2027',
  exhibitor: 'Hindustan Aeronautics Limited (HAL)',
  exhibitorCountry: 'India', // from the company's registration — drives INR vs USD pricing
  eventDays: ['11 Feb 2027', '12 Feb 2027', '13 Feb 2027'],
  coexRegFee: 40000, // Rs. incl. GST — Separate co-exhibitor registration
};

const SEED = {
  seq: { coex: 0, pass: 0, alloc: 0, quota: 0, cart: 0, invite: 0, sreq: 0, order: 0 },
  orders: [], // payment ledger — one record per paid cart item
  /* Space requirements. The exhibitor already filled these during
     REGISTRATION (source: 'registration') — this page lets them modify
     those and add more (source: 'exhibitor-portal'). */
  spaceRequirements: [
    { id: 'sreq_reg1', setupType: 'Raw',           sqm: 100, floors: null, openSides: 'One Side', source: 'registration', submittedAt: '20 Aug 2026' },
    { id: 'sreq_reg2', setupType: 'Outdoor Space', sqm: 200, floors: null, openSides: null,       source: 'registration', submittedAt: '20 Aug 2026' },
  ],
  srRegSeeded: true,
  // Confirmed (booked) spaces of the main exhibitor
  stalls: [
    { id: 'st1', hall: 'Hall A', stall: 'A8.5', area: 110 },
    { id: 'st2', hall: 'Hall 2', stall: 'C-25', area: 36 },
  ],
  // Pass categories. kind: badge | invitee | vehicle
  categories: [
    { id: 'cat_exh',      kind: 'badge',   name: 'Exhibitor',                     free: 6,   paid: 0 },
    { id: 'cat_staff',    kind: 'badge',   name: 'Exhibitor Support Staff',       free: 3,   paid: 0 },
    { id: 'cat_addl',     kind: 'badge',   name: 'Additional Exhibitor Badges',   free: 0,   paid: 5 },
    { id: 'cat_contr',    kind: 'badge',   name: 'Exhibitor - Contractor Badges', free: 100, paid: 0 },
    { id: 'cat_invitee',  kind: 'invitee', name: 'Exhibitor Invitee',             free: 30,  paid: 0 },
    { id: 'cat_veh',      kind: 'vehicle', name: 'Vehicle Pass',                  free: 2,   paid: 0 },
    { id: 'cat_veh12',    kind: 'vehicle', name: 'Vehicle Pass (Above 12 Seater)',free: 0,   paid: 2 },
  ],
  coexhibitors: [],   // {id,type,company,email,nodalFirst,nodalLast,regNo,status,createdAt}
  allocations: [],    // {id,coexId,stallId,sqm}
  quotas: [],         // {id,coexId,catId,quota}
  passes: [],         // {id,catId,coexId|null,data:{...},status,createdAt,amount}
  invites: [],        // {id,catId,coexId|null,firstName,lastName,email,sentAt}
  cart: [],           // {id,type:'coex_reg'|'vehicle',refId,label,sub,amount}
};

const LS_KEY = 'evenuefy_coex_module_v1';
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration: older saved state predates the Space Requirement page
      if (!parsed.spaceRequirements) parsed.spaceRequirements = [];
      if (!parsed.seq.sreq) parsed.seq.sreq = 0;
      if (!parsed.orders) parsed.orders = [];
      if (!parsed.seq.order) parsed.seq.order = 0;
      // Migration: inject the registration-time requirements once
      if (!parsed.srRegSeeded) {
        SEED.spaceRequirements.forEach((seedReq) => {
          if (!parsed.spaceRequirements.some((r) => r.id === seedReq.id)) {
            parsed.spaceRequirements.unshift(JSON.parse(JSON.stringify(seedReq)));
          }
        });
        parsed.srRegSeeded = true;
      }
      // Older entries without a source were added from this portal
      parsed.spaceRequirements.forEach((r) => { if (!r.source) r.source = 'exhibitor-portal'; });
      // Chalet requirements carry no sqm — only floor selection
      parsed.spaceRequirements.forEach((r) => { if (r.setupType === 'Chalet') r.sqm = null; });
      return parsed;
    }
  } catch (e) { /* storage unavailable — run in-memory */ }
  return JSON.parse(JSON.stringify(SEED));
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* in-memory only */ }
}
function resetDemo() {
  if (!confirm('Reset all demo data?')) return;
  S = JSON.parse(JSON.stringify(SEED));
  save();
  location.hash = '#/co-exhibitors';
  render();
  toast('Demo data reset', 'success');
}

/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const nowStr = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pad = (n, w) => String(n).padStart(w, '0');
const uid = (k) => { S.seq[k] += 1; return k + '_' + S.seq[k]; };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const VEHNO_RE = /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}$/i;

function coexById(id) { return S.coexhibitors.find((c) => c.id === id); }
function catById(id) { return S.categories.find((c) => c.id === id); }
function stallById(id) { return S.stalls.find((s) => s.id === id); }

/* ----- Quota math (single source of truth) ----- */
function catTotal(cat) { return cat.free + cat.paid; }
function usedByExhibitor(catId) { return S.passes.filter((p) => p.catId === catId && !p.coexId).length; }
function allocatedToCoex(catId) { return S.quotas.filter((q) => q.catId === catId).reduce((a, q) => a + q.quota, 0); }
function exhibitorBalance(catId) { const c = catById(catId); return catTotal(c) - usedByExhibitor(catId) - allocatedToCoex(catId); }
function quotaUsed(coexId, catId) { return S.passes.filter((p) => p.catId === catId && p.coexId === coexId).length; }
function quotaFor(coexId, catId) { const q = S.quotas.find((x) => x.coexId === coexId && x.catId === catId); return q ? q.quota : 0; }
function stallAllocated(stallId) { return S.allocations.filter((a) => a.stallId === stallId).reduce((s, a) => s + a.sqm, 0); }
function stallAvailable(stallId, excludeAllocId) {
  const used = S.allocations
    .filter((a) => a.stallId === stallId && a.id !== excludeAllocId)
    .reduce((s, a) => s + a.sqm, 0);
  return stallById(stallId).area - used;
}
function coexSqm(coexId) { return S.allocations.filter((a) => a.coexId === coexId).reduce((s, a) => s + a.sqm, 0); }

/* Separate co-exhibitors that are eligible for pass quotas.
   Subsidiaries are NOT entitled to passes/services (business rule). */
function quotaEligibleCoex() {
  return S.coexhibitors.filter((c) => c.type === 'separate' && c.status === 'active');
}

/* ---------------- Toast ---------------- */
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------------- Modal ---------------- */
function openModal(title, bodyHtml, footHtml, wide) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'modalOverlay';
  ov.innerHTML =
    '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
    '<div class="modal-head"><h3>' + title + '</h3>' +
    '<button class="modal-close" onclick="closeModal()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
    '<div class="modal-body">' + bodyHtml + '</div>' +
    (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
    '</div>';
  ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
}
function closeModal() { const m = $('modalOverlay'); if (m) m.remove(); }

/* Field error helpers */
function setErr(id, msg) {
  const f = $(id); if (!f) return;
  const field = f.closest('.field');
  if (field) { field.classList.add('invalid'); const e = field.querySelector('.error'); if (e) e.textContent = msg; }
}
function clearErrs(scope) {
  (scope || document).querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  'dashboard': viewExhibitorDashboard,
  'orders': viewMyOrders,
  'co-exhibitors': viewCoexList,
  'co-exhibitors/add': viewCoexAdd,
  'allocate-stall': viewAllocateStall,
  'space-requirement': viewSpaceRequirement,
  'passes/badges': viewBadges,
  'passes/invitee': viewInvitee,
  'passes/vehicle': viewVehicle,
};

function currentRoute() {
  const h = location.hash.replace(/^#\//, '') || 'dashboard';
  return h;
}

function render() {
  const route = currentRoute();
  // dynamic routes: passes/badges/coex/<catId>  ·  passes/vehicle/coex/<catId>
  let view = null, arg = null;
  const mCoex = route.match(/^passes\/(badges|invitee|vehicle)\/coex\/(.+)$/);
  const mProf = route.match(/^profile(?:\/(.+))?$/);
  const mHall = route.match(/^space-booking\/hall\/(.+)$/);
  if (mCoex) { view = viewCatCoexPage; arg = mCoex[2]; }
  else if (mProf) { view = viewProfile; arg = mProf[1] || 'company'; }
  else if (mHall) { view = viewHallStalls; arg = mHall[1]; }
  else view = ROUTES[route] || viewExhibitorDashboard;

  // sidebar active state
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const r = el.getAttribute('data-route');
    el.classList.toggle('active', route === r || (mCoex && r === 'passes/' + mCoex[1]) ||
      (r === 'aircraft' && route.indexOf('aircraft') === 0) ||
      (r === 'profile' && route.indexOf('profile') === 0) ||
      (r === 'exhibition-forms' && route.indexOf('exhibition-forms') === 0) ||
      (r === 'digital-showcase' && (route === 'products' || route.indexOf('booth/') === 0)) ||
      (r === 'space-booking/book' && route.indexOf('space-booking/hall') === 0) ||
      (r === 'space-booking/my' && route === 'space-booking/success'));
  });

  $('view').innerHTML = view(arg);
  updateCartBadge();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ============================================================
   VIEW · Co-Exhibitors list
   ============================================================ */
function coexStatusPill(c) {
  if (c.type === 'subsidiary') return '<span class="pill green">Active</span>';
  if (c.status === 'active') return '<span class="pill green">Active</span>';
  return '<span class="pill amber">Payment Pending</span>';
}
function coexTypePill(c) {
  return c.type === 'subsidiary'
    ? '<span class="pill gray">Subsidiary</span>'
    : '<span class="pill blue">Separate</span>';
}

function viewCoexList() {
  // Rule: no co-exhibitors yet -> open the Add form directly
  if (S.coexhibitors.length === 0) return viewCoexAdd(true);

  const rows = S.coexhibitors.map((c, i) => {
    const officer = c.type === 'separate' ? esc(c.nodalFirst + ' ' + c.nodalLast) : '—';
    const payBtn = (c.type === 'separate' && c.status === 'payment_pending')
      ? '<button class="btn-link" style="color:var(--amber)" onclick="openCart()">Complete Payment</button>'
      : '';
    return '<tr>' +
      '<td class="num">' + (i + 1) + '</td>' +
      '<td><span class="td-strong">' + esc(c.company) + '</span><span class="td-sub">' + esc(c.email) + '</span></td>' +
      '<td>' + coexTypePill(c) + '</td>' +
      '<td>' + officer + '</td>' +
      '<td class="num">' + (c.regNo ? '<code>' + esc(c.regNo) + '</code>' : '—') + '</td>' +
      '<td>' + coexStatusPill(c) + '</td>' +
      '<td class="num">' + (coexSqm(c.id) ? coexSqm(c.id) + ' sqm' : '—') + '</td>' +
      '<td class="td-actions">' +
        payBtn +
        '<button class="btn-link" onclick="openCoexView(\'' + c.id + '\')">View</button>' +
        '<button class="btn-link danger" onclick="deleteCoex(\'' + c.id + '\')">Delete</button>' +
      '</td></tr>';
  }).join('');

  const pendingCount = S.coexhibitors.filter((c) => c.status === 'payment_pending').length;
  const pendingBanner = pendingCount
    ? '<div class="note amber"><b class="title">' + pendingCount + ' registration payment pending</b>' +
      'The Separate co-exhibitor cannot receive pass quotas until the ' + money(EVENT.coexRegFee) + ' registration fee is paid. ' +
      '<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Complete Payment</button></div>'
    : '';

  return '' +
    '<h1 class="page-title">Co-Exhibitors</h1>' +
    '<p class="page-sub">Add co-exhibitor companies and distribute your booked space and pass quotas to them.</p>' +
    pendingBanner +
    '<div class="card">' +
      '<div class="card-head-row">' +
        '<h2 class="card-title">Co-Exhibitor List</h2>' +
        '<a class="btn btn-primary" href="#/co-exhibitors/add"><span class="material-symbols-outlined">add</span>Add New Co-Exhibitor</a>' +
      '</div>' +
      '<div class="tablewrap"><table class="grid">' +
        '<tr><th>Sr.</th><th>Company</th><th>Type</th><th>Nodal Officer</th><th>Reg. No.</th><th>Status</th><th>Space</th><th>Action</th></tr>' +
        rows +
      '</table></div>' +
    '</div>' +
    footerTools();
}

function openCoexView(id) {
  const c = coexById(id);
  const qRows = S.quotas.filter((q) => q.coexId === id).map((q) => {
    const cat = catById(q.catId);
    return '<tr><td>' + esc(cat.name) + '</td><td class="num">' + q.quota + '</td><td class="num">' + quotaUsed(id, q.catId) + '</td><td class="num">' + (q.quota - quotaUsed(id, q.catId)) + '</td></tr>';
  }).join('') || '<tr><td colspan="4" style="color:var(--muted)">No pass quota assigned yet</td></tr>';
  const aRows = S.allocations.filter((a) => a.coexId === id).map((a) => {
    const st = stallById(a.stallId);
    return '<tr><td>' + esc(st.hall) + '</td><td>' + esc(st.stall) + '</td><td class="num">' + a.sqm + ' sqm</td></tr>';
  }).join('') || '<tr><td colspan="3" style="color:var(--muted)">No space allocated yet</td></tr>';

  openModal('Co-Exhibitor · ' + esc(c.company),
    '<div class="form-grid">' +
      '<div><b>Type:</b> ' + coexTypePill(c) + '</div>' +
      '<div><b>Status:</b> ' + coexStatusPill(c) + '</div>' +
      '<div><b>Email:</b> ' + esc(c.email) + '</div>' +
      '<div><b>Reg. No.:</b> ' + (c.regNo ? '<code>' + esc(c.regNo) + '</code>' : '— (subsidiary)') + '</div>' +
      (c.type === 'separate' ? '<div class="full"><b>Nodal Officer:</b> ' + esc(c.nodalFirst + ' ' + c.nodalLast) + '</div>' : '') +
      '<div class="full"><b>Added:</b> ' + esc(c.createdAt) + '</div>' +
    '</div>' +
    '<h3 style="margin:18px 0 6px;font-size:0.9rem">Space Allocations</h3>' +
    '<div class="tablewrap"><table class="grid"><tr><th>Hall</th><th>Stall</th><th>Area</th></tr>' + aRows + '</table></div>' +
    '<h3 style="margin:18px 0 6px;font-size:0.9rem">Pass Quotas</h3>' +
    '<div class="tablewrap"><table class="grid"><tr><th>Category</th><th>Quota</th><th>Used</th><th>Balance</th></tr>' + qRows + '</table></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Close</button>');
}

function deleteCoex(id) {
  const hasAlloc = S.allocations.some((a) => a.coexId === id);
  const hasQuota = S.quotas.some((q) => q.coexId === id);
  const hasPasses = S.passes.some((p) => p.coexId === id);
  if (hasAlloc || hasQuota || hasPasses) {
    toast('Cannot delete: remove this co-exhibitor’s space allocations and pass quotas first.', 'error');
    return;
  }
  if (!confirm('Delete this co-exhibitor?')) return;
  S.coexhibitors = S.coexhibitors.filter((c) => c.id !== id);
  S.cart = S.cart.filter((i) => !(i.type === 'coex_reg' && i.refId === id));
  save(); render();
  toast('Co-exhibitor deleted', 'success');
}

/* ============================================================
   VIEW · Add Co-Exhibitor
   ============================================================ */
function viewCoexAdd(isFirst) {
  const back = isFirst ? '' : '<a class="back-link" href="#/co-exhibitors"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to list</a>';
  const firstNote = isFirst
    ? '<div class="note"><b class="title">No co-exhibitors added yet.</b>Add your first co-exhibitor below. Once added, the listing view will appear here.</div>'
    : '';

  return '' +
    back +
    '<h1 class="page-title">Add New Co-Exhibitor</h1>' +
    '<p class="page-sub">Choose the exhibitor type. Fields and rules change based on the type.</p>' +
    firstNote +
    '<div class="card">' +
    '<form id="coexForm" onsubmit="return submitCoex(event)" novalidate>' +

      '<div class="field full" style="margin-bottom:18px">' +
        '<label>Exhibitor Type <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
          '<label class="radio-card selected" id="rc_subsidiary" onclick="setCoexType(\'subsidiary\')">' +
            '<input type="radio" name="coexType" value="subsidiary" checked>' +
            '<b>Subsidiary</b><small>Division of your company. Login created, no charges.</small>' +
          '</label>' +
          '<label class="radio-card" id="rc_separate" onclick="setCoexType(\'separate\')">' +
            '<input type="radio" name="coexType" value="separate">' +
            '<b>Separate</b><small>Independent company. Login created, ' + money(EVENT.coexRegFee) + ' registration. Gets stall space &amp; pass quotas after payment.</small>' +
          '</label>' +
        '</div>' +
      '</div>' +

      /* --- Subsidiary fields --- */
      '<div id="subsidiaryFields">' +
        '<div class="form-grid">' +
          '<div class="field"><label>Subsidiary Company Name <span class="req">*</span></label>' +
            '<input type="text" id="subCompany" placeholder="e.g. HAL Rotary Division"><div class="error"></div></div>' +
          '<div class="field"><label>Subsidiary Company Email <span class="req">*</span></label>' +
            '<input type="email" id="subEmail" placeholder="name@company.com"><div class="error"></div></div>' +
        '</div>' +
        '<div class="note amber"><b class="title">Note — Subsidiary Co-Exhibitor</b><ul>' +
          '<li>Login is created for the subsidiary company (credentials sent by email on submission).</li>' +
          '<li>No registration charges.</li>' +
          '<li>This type is not allotted stall space.</li>' +
          '<li>Any subsidiary / division of the company will be considered part of the principal exhibitor.</li>' +
          '<li>This type is not entitled to any complimentary passes &amp; services.</li>' +
        '</ul></div>' +
      '</div>' +

      /* --- Separate fields --- */
      '<div id="separateFields" style="display:none">' +
        '<div class="form-grid">' +
          '<div class="field"><label>Nodal Officer First Name <span class="req">*</span></label>' +
            '<input type="text" id="sepFirst"><div class="error"></div></div>' +
          '<div class="field"><label>Nodal Officer Last Name <span class="req">*</span></label>' +
            '<input type="text" id="sepLast"><div class="error"></div></div>' +
          '<div class="field"><label>Nodal Officer Company Name <span class="req">*</span></label>' +
            '<input type="text" id="sepCompany"><div class="error"></div></div>' +
          '<div class="field"><label>Nodal Officer Email <span class="req">*</span></label>' +
            '<input type="email" id="sepEmail" placeholder="name@company.com">' +
            '<div class="hint">Login credentials &amp; welcome email will be sent here after payment.</div><div class="error"></div></div>' +
        '</div>' +
        '<div class="note"><b class="title">Note — Separate Co-Exhibitor</b><ul>' +
          '<li>Registration charges: <b>' + money(EVENT.coexRegFee) + ' (including GST)</b>.</li>' +
          '<li>Payment will be added to the <b>Main Exhibitor’s cart</b>.</li>' +
          '<li>A unique reference / registration number is generated on submission.</li>' +
          '<li>A separate login is created for the co-exhibitor; credentials and a welcome email are sent after payment.</li>' +
          '<li>Stall space can be allocated only after the registration payment is complete.</li>' +
        '</ul></div>' +
      '</div>' +

      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">' +
        (isFirst ? '' : '<a class="btn btn-outline" href="#/co-exhibitors">Cancel</a>') +
        '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">check</span>Submit</button>' +
      '</div>' +
    '</form>' +
    '</div>' +
    footerTools();
}

function setCoexType(t) {
  $('rc_subsidiary').classList.toggle('selected', t === 'subsidiary');
  $('rc_separate').classList.toggle('selected', t === 'separate');
  $('subsidiaryFields').style.display = t === 'subsidiary' ? '' : 'none';
  $('separateFields').style.display = t === 'separate' ? '' : 'none';
  document.querySelector('input[name="coexType"][value="' + t + '"]').checked = true;
}

function submitCoex(e) {
  e.preventDefault();
  clearErrs();
  const type = document.querySelector('input[name="coexType"]:checked').value;
  let ok = true;

  const emailInUse = (em) =>
    S.coexhibitors.some((c) => c.email.toLowerCase() === em.toLowerCase());

  if (type === 'subsidiary') {
    const company = $('subCompany').value.trim();
    const email = $('subEmail').value.trim();
    if (!company) { setErr('subCompany', 'Company name is required'); ok = false; }
    if (!email) { setErr('subEmail', 'Email is required'); ok = false; }
    else if (!EMAIL_RE.test(email)) { setErr('subEmail', 'Enter a valid email address'); ok = false; }
    else if (emailInUse(email)) { setErr('subEmail', 'This email is already used by another co-exhibitor'); ok = false; }
    if (!ok) return false;

    S.coexhibitors.push({
      id: uid('coex'), type: 'subsidiary', company: company, email: email,
      nodalFirst: '', nodalLast: '', regNo: '', status: 'active', createdAt: nowStr(),
    });
    save();
    toast('Subsidiary "' + company + '" added. Login credentials & welcome email sent to ' + email, 'success');
    location.hash = '#/co-exhibitors'; render();
  } else {
    const first = $('sepFirst').value.trim();
    const last = $('sepLast').value.trim();
    const company = $('sepCompany').value.trim();
    const email = $('sepEmail').value.trim();
    if (!first) { setErr('sepFirst', 'First name is required'); ok = false; }
    if (!last) { setErr('sepLast', 'Last name is required'); ok = false; }
    if (!company) { setErr('sepCompany', 'Company name is required'); ok = false; }
    if (!email) { setErr('sepEmail', 'Email is required'); ok = false; }
    else if (!EMAIL_RE.test(email)) { setErr('sepEmail', 'Enter a valid email address'); ok = false; }
    else if (emailInUse(email)) { setErr('sepEmail', 'This email is already used by another co-exhibitor'); ok = false; }
    if (!ok) return false;

    const id = uid('coex');
    const regNo = 'COEX-2027-' + pad(S.seq.coex, 4);
    S.coexhibitors.push({
      id: id, type: 'separate', company: company, email: email,
      nodalFirst: first, nodalLast: last, regNo: regNo,
      status: 'payment_pending', createdAt: nowStr(),
    });
    S.cart.push({
      id: uid('cart'), type: 'coex_reg', refId: id,
      label: 'Co-Exhibitor Registration — ' + company,
      sub: 'Reg. No. ' + regNo + ' · incl. GST',
      amount: EVENT.coexRegFee,
    });
    save();
    toast('Registration number ' + regNo + ' generated. ' + money(EVENT.coexRegFee) + ' added to your cart.', 'success');
    location.hash = '#/co-exhibitors'; render();
  }
  return false;
}

/* ============================================================
   VIEW · Allocate Stall
   ============================================================ */
/* Stall space can be allotted ONLY to Separate co-exhibitors whose
   registration payment is complete (business rule). */
function stallEligibleCoex() {
  return S.coexhibitors.filter((c) => c.type === 'separate' && c.status === 'active');
}

function viewAllocateStall() {
  if (stallEligibleCoex().length === 0) {
    return '<h1 class="page-title">Allocate Stall</h1>' +
      '<p class="page-sub">Stall space can be allocated only to <b>Separate</b> co-exhibitors whose registration payment is complete.</p>' +
      '<div class="card"><div class="empty"><span class="material-symbols-outlined">group_add</span>' +
      '<h3>No paid Separate co-exhibitors yet</h3><p>Add a Separate co-exhibitor and complete its registration payment first, then allocate stall space.</p>' +
      '<a class="btn btn-primary" href="#/co-exhibitors/add"><span class="material-symbols-outlined">add</span>Add Co-Exhibitor</a>' +
      '</div></div>' + footerTools();
  }

  const stallChips = S.stalls.map((st) => {
    const avail = stallAvailable(st.id);
    const pct = Math.round(((st.area - avail) / st.area) * 100);
    return '<div class="tile"><div class="t-label">' + esc(st.hall) + ' · ' + esc(st.stall) + '</div>' +
      '<div class="t-value">' + avail + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + st.area + ' sqm free</span></div>' +
      '<div class="usage"><div class="bar"><i style="width:' + pct + '%"></i></div><span>' + pct + '% allocated</span></div></div>';
  }).join('');

  const hasAllocs = S.allocations.length > 0;
  const rows = S.allocations.map((a, i) => {
    const c = coexById(a.coexId); const st = stallById(a.stallId);
    return '<tr>' +
      '<td class="num">' + (i + 1) + '</td>' +
      '<td><span class="td-strong">' + esc(c.company) + '</span><span class="td-sub">' + esc(c.email) + '</span></td>' +
      '<td>' + esc(st.hall) + '</td><td>' + esc(st.stall) + '</td>' +
      '<td class="num">' + a.sqm + ' sqm</td>' +
      '<td class="td-actions">' +
        '<button class="btn-link" onclick="openAllocForm(\'' + a.id + '\')">Edit</button>' +
        '<button class="btn-link danger" onclick="removeAlloc(\'' + a.id + '\')">Remove</button>' +
      '</td></tr>';
  }).join('');

  // Inline (empty-state) form: populate the stall dropdown after render
  if (!hasAllocs) setTimeout(function () { if ($('alStall') && !$('alStall').options.length) fillStallOptions(); }, 0);

  const listCard = hasAllocs
    ? '<div class="card"><div class="card-head-row"><h2 class="card-title">Allocated Stall List</h2>' +
      '<button class="btn btn-primary" onclick="openAllocForm()"><span class="material-symbols-outlined">add</span>Allocate Area</button></div>' +
      '<div class="tablewrap"><table class="grid">' +
      '<tr><th>Sr.</th><th>Co-Exhibitor</th><th>Hall</th><th>Stall</th><th>Allocated Space</th><th>Action</th></tr>' + rows +
      '</table></div></div>'
    : '<div class="card"><h2 class="card-title">Allocate Space to Co-Exhibitor</h2>' +
      '<p class="page-sub" style="margin-bottom:14px">No stall allocation yet — fill the form below to allocate area.</p>' +
      allocFormHtml(null) + '</div>';

  return '<h1 class="page-title">Allocate Stall</h1>' +
    '<p class="page-sub">Distribute your booked stall space among <b>Separate</b> co-exhibitors (registration payment complete). You cannot allocate more than the space you have booked.</p>' +
    '<div class="tiles">' + stallChips + '</div>' +
    listCard + footerTools();
}

function allocFormHtml(alloc) {
  const editing = !!alloc;
  // Only PAID Separate co-exhibitors can be allotted stall space.
  const coexOpts = stallEligibleCoex().map((c) =>
    '<option value="' + c.id + '"' + (editing && alloc.coexId === c.id ? ' selected' : '') + '>' +
    esc(c.company) + ' (Separate · Paid)</option>').join('');
  const halls = [...new Set(S.stalls.map((s) => s.hall))];
  const selHall = editing ? stallById(alloc.stallId).hall : halls[0];
  const hallOpts = halls.map((h) => '<option' + (h === selHall ? ' selected' : '') + '>' + esc(h) + '</option>').join('');

  return '<form id="allocForm" onsubmit="return submitAlloc(event, \'' + (editing ? alloc.id : '') + '\')" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Co-Exhibitor <span class="req">*</span></label>' +
        '<select id="alCoex">' + coexOpts + '</select><div class="error"></div></div>' +
      '<div class="field"><label>Hall <span class="req">*</span></label>' +
        '<select id="alHall" onchange="fillStallOptions()">' + hallOpts + '</select><div class="error"></div></div>' +
      '<div class="field"><label>Stall <span class="req">*</span></label>' +
        '<select id="alStall" onchange="updateAllocHint(\'' + (editing ? alloc.id : '') + '\')"></select><div class="error"></div></div>' +
      '<div class="field"><label>Allocate Space (Sqm) <span class="req">*</span></label>' +
        '<input type="number" id="alSqm" min="1" step="1" value="' + (editing ? alloc.sqm : '') + '" oninput="updateAllocHint(\'' + (editing ? alloc.id : '') + '\')">' +
        '<div class="hint" id="alHint"></div><div class="error"></div></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
      (editing ? '<button class="btn btn-outline" type="button" onclick="closeModal()">Cancel</button>' : '') +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">check</span>' + (editing ? 'Update Allocation' : 'Allocate Space') + '</button>' +
    '</div></form>';
}

function fillStallOptions(selectedStallId) {
  const hall = $('alHall').value;
  const opts = S.stalls.filter((s) => s.hall === hall).map((s) =>
    '<option value="' + s.id + '"' + (s.id === selectedStallId ? ' selected' : '') + '>' +
    esc(s.stall) + ' — ' + s.area + ' sqm booked</option>').join('');
  $('alStall').innerHTML = opts;
  updateAllocHint(window.__editingAllocId || '');
}

function updateAllocHint(excludeId) {
  const stallId = $('alStall').value;
  if (!stallId) { $('alHint').textContent = ''; return; }
  const avail = stallAvailable(stallId, excludeId || undefined);
  const val = parseInt($('alSqm').value, 10);
  let txt = 'Available on this stall: ' + avail + ' sqm';
  if (!isNaN(val) && val > avail) txt += ' — exceeds available space!';
  $('alHint').textContent = txt;
  $('alHint').style.color = (!isNaN(val) && val > avail) ? 'var(--red)' : '';
}

function openAllocForm(allocId) {
  const alloc = allocId ? S.allocations.find((a) => a.id === allocId) : null;
  window.__editingAllocId = allocId || '';
  if (alloc) {
    openModal('Edit Allocation', allocFormHtml(alloc));
    fillStallOptions(alloc.stallId);
  } else {
    // inline form exists when list empty; when list present use modal
    openModal('Allocate Space to Co-Exhibitor', allocFormHtml(null));
    fillStallOptions();
  }
}

function submitAlloc(e, editId) {
  e.preventDefault();
  clearErrs();
  const coexId = $('alCoex').value;
  const stallId = $('alStall').value;
  const sqm = parseInt($('alSqm').value, 10);
  let ok = true;
  if (!coexId) { setErr('alCoex', 'Select a co-exhibitor'); ok = false; }
  else {
    const c = coexById(coexId);
    if (!c || c.type !== 'separate' || c.status !== 'active') {
      setErr('alCoex', 'Stall space can be allocated only to Separate co-exhibitors with completed registration payment');
      ok = false;
    }
  }
  if (!stallId) { setErr('alStall', 'Select a stall'); ok = false; }
  if (isNaN(sqm) || sqm <= 0) { setErr('alSqm', 'Enter a valid area in sqm'); ok = false; }
  else {
    const avail = stallAvailable(stallId, editId || undefined);
    if (sqm > avail) { setErr('alSqm', 'Cannot allocate more than available space (' + avail + ' sqm) on this stall'); ok = false; }
  }
  if (!ok) return false;

  if (editId) {
    const a = S.allocations.find((x) => x.id === editId);
    a.coexId = coexId; a.stallId = stallId; a.sqm = sqm;
    toast('Allocation updated', 'success');
  } else {
    S.allocations.push({ id: uid('alloc'), coexId: coexId, stallId: stallId, sqm: sqm });
    toast(sqm + ' sqm allocated to ' + coexById(coexId).company, 'success');
  }
  save(); closeModal(); render();
  return false;
}

function removeAlloc(id) {
  if (!confirm('Remove this allocation? The area returns to your available pool.')) return;
  S.allocations = S.allocations.filter((a) => a.id !== id);
  save(); render();
  toast('Allocation removed', 'success');
}

/* ============================================================
   VIEW · Space Requirement (single page — five static fields)
   One fixed row per setup type, all saved together with a single
   Save button. Registration-time entries come pre-filled.
   A row with an empty value means "not required" (entry removed).
   Chalet: floors only (no sqm) · Shell/Raw: sqm + open sides.
   ============================================================ */
const SR_SETUP_TYPES = ['Shell', 'Raw', 'Static Display', 'Outdoor Space', 'Chalet'];
const SR_SIDES_TYPES = ['Shell', 'Raw'];
const SR_FLOOR_OPTS = ['1 Floor', '2 Floor'];
const SR_SIDE_OPTS = ['One Side', 'Two Side', 'Three Side', 'Four Side'];
const srKey = (t) => t.replace(/\W/g, '');
function srByType(type) { return S.spaceRequirements.find((r) => r.setupType === type); }

function srRow(type) {
  const k = srKey(type);
  const r = srByType(type);
  const isChalet = type === 'Chalet';
  const hasSides = SR_SIDES_TYPES.includes(type);

  const floorOpts = '<option value="">Select Floors</option>' +
    SR_FLOOR_OPTS.map((f) => '<option' + (r && r.floors === f ? ' selected' : '') + '>' + f + '</option>').join('');
  const sideOpts = SR_SIDE_OPTS.map((s) => '<option' + (r && r.openSides === s ? ' selected' : '') + '>' + s + '</option>').join('');

  const statusSub = r
    ? '<span class="td-sub">Submitted: ' + esc(r.submittedAt) + (r.modifiedAt ? ' · Modified: ' + esc(r.modifiedAt) : '') + '</span>'
    : '<span class="td-sub">Leave empty if not required</span>';

  return '<div class="sr-row">' +
    '<div class="sr-type"><b>' + esc(type) + '</b>' + statusSub + '</div>' +
    '<div class="sr-inputs">' +
      (!isChalet
        ? '<div class="field"><label>Required Space (Sqm)</label>' +
          '<input type="number" id="srSqm_' + k + '" min="1" step="1" value="' + (r && r.sqm != null ? r.sqm : '') + '" placeholder="e.g. 100"><div class="error"></div></div>'
        : '<div class="field"><label>Number of Floors</label><select id="srFloors_' + k + '">' + floorOpts + '</select><div class="error"></div></div>') +
      (hasSides
        ? '<div class="field"><label>Open Sides</label><select id="srSides_' + k + '">' + sideOpts + '</select><div class="error"></div></div>'
        : '') +
    '</div>' +
  '</div>';
}

function viewSpaceRequirement() {
  const srAll = S.spaceRequirements;
  const srTotalSqm = srAll.reduce((a, r) => a + (r.sqm || 0), 0);
  const tiles =
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Requirements</div><div class="t-value">' + srAll.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Total Space Requested</div><div class="t-value">' + srTotalSqm.toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>' +
    '</div>';

  return '<h1 class="page-title">Space Requirement</h1>' +
    '<p class="page-sub">The details you provided <b>during registration</b> are pre-filled below. Fill or update any setup type and press Save — leave a field empty if that type is not required.</p>' +
    tiles +
    '<div class="card">' +
      '<h2 class="card-title" style="margin-bottom:6px">Space Requirements — All Setup Types</h2>' +
      SR_SETUP_TYPES.map(srRow).join('') +
      '<div style="display:flex;justify-content:flex-end;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">' +
        '<button class="btn btn-primary" onclick="saveAllSpaceReqs()"><span class="material-symbols-outlined">save</span>Save Requirements</button>' +
      '</div>' +
    '</div>' +
    footerTools();
}

/* Single save: upserts every type in one go.
   Value present -> add or update. Value cleared -> entry removed. */
function saveAllSpaceReqs() {
  clearErrs();
  let ok = true;
  const staged = [];

  SR_SETUP_TYPES.forEach((type) => {
    const k = srKey(type);
    const isChalet = type === 'Chalet';
    if (isChalet) {
      const floors = $('srFloors_' + k).value;
      staged.push({ type: type, wanted: !!floors, sqm: null, floors: floors || null, openSides: null });
    } else {
      const raw = $('srSqm_' + k).value.trim();
      if (raw === '') { staged.push({ type: type, wanted: false }); return; }
      const sqm = parseInt(raw, 10);
      if (isNaN(sqm) || sqm <= 0) { setErr('srSqm_' + k, 'Enter a valid area in sqm'); ok = false; return; }
      const openSides = SR_SIDES_TYPES.includes(type) ? $('srSides_' + k).value : null;
      staged.push({ type: type, wanted: true, sqm: sqm, floors: null, openSides: openSides });
    }
  });
  if (!ok) return;

  let added = 0, updated = 0, removed = 0;
  staged.forEach((sRow) => {
    const existing = srByType(sRow.type);
    if (sRow.wanted) {
      if (existing) {
        const changed = existing.sqm !== sRow.sqm || existing.floors !== sRow.floors || existing.openSides !== sRow.openSides;
        if (changed) {
          existing.sqm = sRow.sqm; existing.floors = sRow.floors; existing.openSides = sRow.openSides;
          existing.modifiedAt = nowStr();
          updated++;
        }
      } else {
        S.spaceRequirements.push({
          id: uid('sreq'), setupType: sRow.type, sqm: sRow.sqm, floors: sRow.floors, openSides: sRow.openSides,
          source: 'exhibitor-portal', submittedAt: nowStr(),
        });
        added++;
      }
    } else if (existing) {
      S.spaceRequirements = S.spaceRequirements.filter((r) => r.setupType !== sRow.type);
      removed++;
    }
  });

  save(); render();
  const parts = [];
  if (added) parts.push(added + ' added');
  if (updated) parts.push(updated + ' updated');
  if (removed) parts.push(removed + ' removed');
  toast(parts.length ? 'Space requirements saved (' + parts.join(', ') + ')' : 'No changes to save', parts.length ? 'success' : undefined);
}

/* ============================================================
   VIEW · Passes › Badge Details
   ============================================================ */
function catRow(cat, i, coexLabel) {
  const total = catTotal(cat);
  const used = usedByExhibitor(cat.id) + S.passes.filter((p) => p.catId === cat.id && p.coexId).length;
  const bal = exhibitorBalance(cat.id);
  const pct = total ? Math.round((used / total) * 100) : 0;
  return '<tr>' +
    '<td class="num">' + (i + 1) + '</td>' +
    '<td><span class="td-strong">' + esc(cat.name) + '</span></td>' +
    '<td class="num">' + cat.free + '</td>' +
    '<td class="num">' + cat.paid + '</td>' +
    '<td class="num">' + total + '</td>' +
    '<td><div class="usage"><div class="bar"><i style="width:' + pct + '%"></i></div><span>' + bal + ' left</span></div></td>' +
    '<td class="td-actions">' +
      '<button class="btn-link" onclick="openViewPasses(\'' + cat.id + '\', null)">View Passes</button>' +
      '<a class="btn-link" href="#/passes/' + (cat.kind === 'invitee' ? 'invitee' : cat.kind === 'vehicle' ? 'vehicle' : 'badges') + '/coex/' + cat.id + '">' + (coexLabel || 'Co-Exhibitors') + '</a>' +
      '<button class="btn-link" onclick="' + (cat.kind === 'vehicle' ? 'openVehicleForm(\'' + cat.id + '\', null)' : 'openPassForm(\'' + cat.id + '\', null)') + '">Add New</button>' +
      (cat.kind === 'vehicle' ? '' : '<button class="btn-link" onclick="openSendLink(\'' + cat.id + '\', null)">' + (cat.kind === 'invitee' ? 'Invitee Link' : 'Send Link') + '</button>') +
    '</td></tr>';
}

/* Badge Quota Management — modelled on the live platform page:
   quota tiles, per-category cards with usage progress and actions
   (Invite Via Email · Registration Team · View Listing · Bulk
   Upload · Co-Exhibitor Quota) plus the badge-holder listing. */
window.__bqQ = window.__bqQ || '';
window.__bqCat = window.__bqCat || '';
function bqSetQ(v) { window.__bqQ = v; render(); const el = $('bqQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function bqSetCat(v) { window.__bqCat = v; render(); }

function openBulkUpload(catId) {
  const cat = catById(catId);
  openModal('Bulk Upload — ' + esc(cat.name),
    '<p style="margin-top:0;font-size:0.84rem;color:var(--muted)">Upload the filled badge template (Excel/CSV). Each row registers one badge holder against this category’s quota.</p>' +
    '<div class="field"><label>Template File <span class="req">*</span></label><input type="file" id="bulkFile" accept=".xlsx,.xls,.csv"><div class="error"></div></div>' +
    '<div class="hint" style="margin-top:6px"><a class="btn-link" style="padding:0" onclick="toast(\'Template downloaded (demo).\', \'success\')">Download blank template</a> · Maximum 5MB</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="submitBulkUpload(\'' + catId + '\')"><span class="material-symbols-outlined">upload</span>Upload</button>');
}
function submitBulkUpload(catId) {
  const f = $('bulkFile').files[0];
  if (!f) { setErr('bulkFile', 'Choose the filled template file'); return; }
  closeModal();
  toast('"' + f.name + '" received — badge holders will be imported after validation (demo).', 'success');
}

window.__bqIdx = window.__bqIdx || 0;
window.__bqDate = window.__bqDate || '';
function bqNav(d) {
  const n = S.categories.filter((c) => c.kind === 'badge').length;
  window.__bqIdx = (window.__bqIdx + d + n) % n;
  render();
}
function bqGoto(i) { window.__bqIdx = i; render(); }

function openViewQuota() {
  const badgeCats = S.categories.filter((c) => c.kind === 'badge');
  const catUsed = (c) => usedByExhibitor(c.id) + S.passes.filter((p) => p.catId === c.id && p.coexId).length;
  openModal('View Quota',
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Category</th><th>Free</th><th>Paid</th><th>Total</th><th>Used</th><th>Balance</th></tr>' +
    badgeCats.map((c) =>
      '<tr><td class="td-strong">' + esc(c.name) + '</td><td class="num">' + c.free + '</td><td class="num">' + c.paid + '</td>' +
      '<td class="num">' + catTotal(c) + '</td><td class="num">' + catUsed(c) + '</td>' +
      '<td class="num"><b>' + (catTotal(c) - catUsed(c)) + '</b></td></tr>').join('') +
    '</table></div>', '', true);
}

function eBadgeDownload(passId) {
  const p = S.passes.find((x) => x.id === passId);
  toast('E-Badge for ' + ((p && p.data.firstName) || 'holder') + ' generated — QR badge PDF downloads in production.', 'success');
}

function viewBadges() {
  const badgeCats = S.categories.filter((c) => c.kind === 'badge');
  const catUsed = (c) => usedByExhibitor(c.id) + S.passes.filter((p) => p.catId === c.id && p.coexId).length;
  const totals = badgeCats.reduce((a, c) => { a.total += catTotal(c); a.used += catUsed(c); return a; }, { total: 0, used: 0 });

  /* left — quota tiles (ticket watermarks) */
  const tiles =
    '<div class="bq-tiles">' +
      '<div class="bq-tile green"><span class="material-symbols-outlined wm">confirmation_number</span>' +
        '<div class="t-label">Total Quota</div><div class="t-big">' + totals.total + ' <small>Allocated Passes</small></div></div>' +
      '<div class="bq-pair">' +
        '<div class="bq-tile blue"><span class="material-symbols-outlined wm">confirmation_number</span>' +
          '<div class="t-label">Used</div><div class="t-big">' + totals.used + '</div></div>' +
        '<div class="bq-tile green"><span class="material-symbols-outlined wm">confirmation_number</span>' +
          '<div class="t-label">Available</div><div class="t-big">' + (totals.total - totals.used) + '</div></div>' +
      '</div></div>';

  /* right — ASSIGN QUOTA carousel (one category at a time) */
  if (window.__bqIdx >= badgeCats.length) window.__bqIdx = 0;
  const c = badgeCats[window.__bqIdx];
  const used = catUsed(c);
  const pct = catTotal(c) ? Math.round((used / catTotal(c)) * 100) : 0;
  const carousel =
    '<div class="bq-carousel"><span class="material-symbols-outlined wm">badge</span>' +
      '<div class="bq-nav"><button onclick="bqNav(-1)"><span class="material-symbols-outlined">chevron_left</span></button>' +
        '<button onclick="bqNav(1)"><span class="material-symbols-outlined">chevron_right</span></button></div>' +
      '<span style="font-size:0.7rem;font-weight:800;letter-spacing:0.12em;color:var(--muted);text-transform:uppercase">Assign Quota</span>' +
      '<div class="bq-cat-name">' + esc(c.name) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:800">' +
        '<span style="font-size:0.7rem;letter-spacing:0.1em;color:var(--muted);text-transform:uppercase">Usage Progress</span>' +
        '<span style="font-size:1.3rem">' + used + ' <span style="color:var(--muted);font-size:0.95rem">/ ' + catTotal(c) + '</span></span></div>' +
      '<div class="prog-bar" style="margin:6px 0 8px;height:8px"><i style="width:' + pct + '%"></i></div>' +
      '<div style="font-size:0.82rem;font-weight:700;margin-bottom:18px">' +
        (c.free ? 'Free: <b>' + c.free + '</b>' : '') + (c.free && c.paid ? ' &nbsp;·&nbsp; ' : '') + (c.paid ? 'Paid: <b>' + c.paid + '</b>' : '') + '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" onclick="openPassForm(\'' + c.id + '\')"><span class="material-symbols-outlined" style="font-size:17px">person_add</span>Registration Team</button>' +
        '<button class="btn btn-outline" onclick="bqSetCat(\'' + c.id + '\')">View Listing</button>' +
        '<button class="btn btn-outline" onclick="openBulkUpload(\'' + c.id + '\')">Bulk Upload</button>' +
        '<button class="btn btn-outline" onclick="openSendLink(\'' + c.id + '\')"><span class="material-symbols-outlined" style="font-size:16px">mail</span>Invite Via Email</button>' +
        '<a class="btn btn-outline" href="#/passes/badges/coex/' + c.id + '"><span class="material-symbols-outlined" style="font-size:16px">group_add</span>Co-Exhibitor Quota</a>' +
      '</div>' +
      '<div class="bq-dots">' + badgeCats.map((x, i) =>
        '<i class="' + (i === window.__bqIdx ? 'on' : '') + '" onclick="bqGoto(' + i + ')"></i>').join('') + '</div>' +
    '</div>';

  /* listing — Profile / Contact / Reg No / Ticket / Created / Payments / Registration / E-Badge */
  const q = window.__bqQ.toLowerCase();
  let holders = S.passes.filter((p) => badgeCats.some((x) => x.id === p.catId));
  if (window.__bqCat) holders = holders.filter((p) => p.catId === window.__bqCat);
  if (q) holders = holders.filter((p) =>
    ((p.data.firstName || '') + ' ' + (p.data.lastName || '') + ' ' + (p.data.email || '') + ' ' + (p.data.mobile || '')).toLowerCase().includes(q));
  if (window.__bqDate) holders = holders.filter((p) => moInDatePreset(p.createdAt, window.__bqDate));

  const holderRows = holders.map((p) => {
    const company = p.coexId && coexById(p.coexId) ? coexById(p.coexId).company : EVENT.exhibitor;
    return '<tr>' +
      '<td><div class="profile-cell"><span class="avatar">' + esc((p.data.firstName || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span><span class="td-strong">' + esc((p.data.firstName || '') + ' ' + (p.data.lastName || '')) + '</span>' +
        '<span class="td-sub" style="font-style:italic">' + esc(company) + '</span></span></div></td>' +
      '<td class="contact-cell">' + esc(p.data.email || '—') + '<br><span class="ph">' + esc(p.data.mobile ? '+91' + p.data.mobile : '') + '</span></td>' +
      '<td><span title="REG' + esc(String(p.id).replace(/\D/g, '') || '0000') + '" style="letter-spacing:0.2em;color:var(--muted)">••••</span></td>' +
      '<td>' + esc((catById(p.catId) || {}).name || '') + '</td>' +
      '<td>' + esc(p.createdAt || '') + '</td>' +
      '<td><span class="icon-act" title="' + (p.amount ? 'Paid — ' + money(p.amount) : 'Complimentary (Free quota)') + '" style="color:var(--green);cursor:default"><span class="material-symbols-outlined" style="font-size:19px">payments</span></span></td>' +
      '<td><span class="icon-act" title="Registered via exhibitor portal" style="color:#6C47C9;cursor:default"><span class="material-symbols-outlined" style="font-size:19px">how_to_reg</span></span></td>' +
      '<td><button class="icon-act" title="Download E-Badge" onclick="eBadgeDownload(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:19px;color:var(--muted)">badge</span></button></td>' +
    '</tr>';
  }).join('');
  const listEmpty = '<tr><td colspan="8"><div class="empty" style="padding:26px 10px">' +
    '<span class="material-symbols-outlined">badge</span><h3>Exhibitor Not Found</h3>' +
    '<p>Exhibitor will show up here once they are added.</p>' +
    '<button class="btn btn-primary btn-sm" onclick="openPassForm(\'' + (window.__bqCat || badgeCats[0].id) + '\')"><span class="material-symbols-outlined" style="font-size:16px">add</span>New User</button></div></td></tr>';

  return '<div class="card-head-row" style="margin-bottom:0"><div>' +
      '<h1 class="page-title">Badge Quota Management</h1>' +
      '<p class="page-sub">Oversee attendee registrations and manage your exhibitor team access with real-time tracking and allocation controls.</p></div>' +
      '<button class="btn-link" style="font-size:0.92rem" onclick="openViewQuota()">View Quota <span class="material-symbols-outlined" style="font-size:17px">chevron_right</span></button></div>' +
    '<div class="bq-grid">' + tiles + carousel + '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px;margin-bottom:6px">' +
      '<div style="flex:1;min-width:260px;display:flex;align-items:center;gap:8px;border:1px solid #CFD7E4;border-radius:9px;padding:0 12px">' +
        '<span class="material-symbols-outlined" style="font-size:19px;color:var(--muted)">search</span>' +
        '<input type="text" id="bqQ" value="' + esc(window.__bqQ) + '" placeholder="Enter search term (e.g., John Doe, user@example.com, 9876543210, REG12345)" oninput="bqSetQ(this.value)" ' +
          'style="flex:1;border:none;outline:none;padding:10px 0;font-family:inherit;font-size:0.86rem;background:none">' +
      '</div>' +
      '<select onchange="bqSetCat(this.value)" style="border:1px solid #CFD7E4;border-radius:9px;padding:9px 12px;font-family:inherit;font-size:0.86rem;cursor:pointer">' +
        '<option value="">Select ticket</option>' +
        badgeCats.map((x) => '<option value="' + x.id + '"' + (window.__bqCat === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>' +
      '<select onchange="window.__bqDate=this.value;render()" style="border:1px solid #CFD7E4;border-radius:9px;padding:9px 12px;font-family:inherit;font-size:0.86rem;cursor:pointer">' +
        [['', 'All Dates'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['month', 'Last 30 Days']].map(([v, l]) =>
          '<option value="' + v + '"' + (window.__bqDate === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '</div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Profile Info</th><th>Contact Info</th><th>Reg. No.</th><th>Ticket</th><th>Created At</th><th>Payments</th><th>Registration</th><th>E-Badge</th></tr>' +
    (holderRows || listEmpty) + '</table></div></div>' + footerTools();
}

/* ============================================================
   VIEW · Category > Co-Exhibitors page (shared by badge/invitee/vehicle)
   ============================================================ */
function viewCatCoexPage(catId) {
  const cat = catById(catId);
  if (!cat) { location.hash = '#/passes/badges'; return ''; }
  const backRoute = cat.kind === 'invitee' ? '#/passes/invitee' : cat.kind === 'vehicle' ? '#/passes/vehicle' : '#/passes/badges';
  const eligible = quotaEligibleCoex();
  const balance = exhibitorBalance(catId);

  const coexOpts = eligible.map((c) => '<option value="' + c.id + '">' + esc(c.company) + ' — ' + esc(c.email) + '</option>').join('');
  const assignCard = eligible.length === 0
    ? '<div class="note amber"><b class="title">No eligible co-exhibitors.</b>Quota can be assigned only to <b>Separate</b> co-exhibitors whose registration payment is complete. Subsidiary co-exhibitors are not entitled to passes &amp; services.</div>'
    : '<form onsubmit="return submitQuota(event, \'' + catId + '\')" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Co-Exhibitor <span class="req">*</span></label>' +
          '<select id="qCoex" onchange="updateQuotaStrip(\'' + catId + '\')">' + coexOpts + '</select><div class="error"></div></div>' +
        '<div class="field"><label>Allocate Quota <span class="req">*</span></label>' +
          '<input type="number" id="qQty" min="1" step="1" placeholder="Enter quota" oninput="updateQuotaStrip(\'' + catId + '\')"><div class="error"></div></div>' +
      '</div>' +
      '<div class="quota-strip" id="quotaStrip"></div>' +
      '<div style="display:flex;justify-content:flex-end">' +
        '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">assignment_turned_in</span>Assign Quota</button>' +
      '</div></form>';

  const qRows = S.quotas.filter((q) => q.catId === catId).map((q, i) => {
    const c = coexById(q.coexId);
    const used = quotaUsed(q.coexId, catId);
    return '<tr>' +
      '<td class="num">' + (i + 1) + '</td>' +
      '<td>' + esc(cat.name) + '</td>' +
      '<td><span class="td-strong">' + esc(c.company) + '</span><span class="td-sub">' + esc(c.email) + '</span></td>' +
      '<td class="num">' + q.quota + '</td>' +
      '<td class="num">' + (q.quota - used) + '</td>' +
      '<td class="td-actions">' +
        '<button class="btn-link" onclick="openViewPasses(\'' + catId + '\',\'' + q.coexId + '\')">View Passes</button>' +
        '<button class="btn-link" onclick="' + (cat.kind === 'vehicle' ? 'openVehicleForm(\'' + catId + '\',\'' + q.coexId + '\')' : 'openPassForm(\'' + catId + '\',\'' + q.coexId + '\')') + '">Add New</button>' +
        (cat.kind === 'vehicle' ? '' : '<button class="btn-link" onclick="openSendLink(\'' + catId + '\',\'' + q.coexId + '\')">Send Link</button>') +
        '<button class="btn-link danger" onclick="removeQuota(\'' + q.id + '\')">Remove</button>' +
      '</td></tr>';
  }).join('');

  return '<a class="back-link" href="' + backRoute + '"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to ' + (cat.kind === 'invitee' ? 'Exhibitor Invitee' : cat.kind === 'vehicle' ? 'Vehicle Pass Details' : 'Badge Details') + '</a>' +
    '<h1 class="page-title">Co-Exhibitors · ' + esc(cat.name) + '</h1>' +
    '<p class="page-sub">Assign ' + (cat.kind === 'vehicle' ? 'vehicle pass' : 'badge') + ' quota from your balance to co-exhibitors, and manage the passes they fill.</p>' +
    '<div class="card"><h2 class="card-title">Assign Quota</h2>' + assignCard + '</div>' +
    '<div class="card section-gap"><h2 class="card-title">Co-Exhibitor Assigned Quota List</h2>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Sr.</th><th>Category of Passes</th><th>Co-Exhibitor (Email)</th><th>Quota</th><th>Balance</th><th>Action</th></tr>' +
    (qRows || '<tr><td colspan="6" style="color:var(--muted)">No quota assigned to any co-exhibitor yet.</td></tr>') +
    '</table></div></div>' + footerTools();
}

function updateQuotaStrip(catId) {
  const strip = $('quotaStrip'); if (!strip) return;
  const coexId = $('qCoex').value;
  const qty = parseInt($('qQty').value, 10) || 0;
  const avail = exhibitorBalance(catId);
  const current = quotaFor(coexId, catId);
  const remaining = avail - qty;
  strip.innerHTML =
    '<div>Current quota of selected co-exhibitor: <b>' + current + '</b></div>' +
    '<div>Available Quota Balance: <b>' + avail + '</b></div>' +
    '<div>Remaining after assignment: <b class="' + (remaining < 0 ? 'neg' : '') + '">' + remaining + '</b></div>';
}

function submitQuota(e, catId) {
  e.preventDefault();
  clearErrs();
  const coexId = $('qCoex').value;
  const qty = parseInt($('qQty').value, 10);
  if (!coexId) { setErr('qCoex', 'Select a co-exhibitor'); return false; }
  if (isNaN(qty) || qty <= 0) { setErr('qQty', 'Enter a valid quota'); return false; }
  const avail = exhibitorBalance(catId);
  if (qty > avail) { setErr('qQty', 'Only ' + avail + ' available in your balance'); return false; }

  const existing = S.quotas.find((q) => q.coexId === coexId && q.catId === catId);
  if (existing) existing.quota += qty;
  else S.quotas.push({ id: uid('quota'), coexId: coexId, catId: catId, quota: qty });
  save(); render();
  toast(qty + ' quota assigned to ' + coexById(coexId).company, 'success');
  return false;
}

function removeQuota(id) {
  const q = S.quotas.find((x) => x.id === id);
  const used = quotaUsed(q.coexId, q.catId);
  if (used > 0) {
    toast('Cannot remove: ' + used + ' pass(es) already filled against this quota. You can only reduce unused quota.', 'error');
    return;
  }
  if (!confirm('Remove this quota assignment? The quota returns to your balance.')) return;
  S.quotas = S.quotas.filter((x) => x.id !== id);
  save(); render();
  toast('Quota removed', 'success');
}

/* ============================================================
   Pass forms (badge / invitee)
   ============================================================ */
function passContextCheck(catId, coexId) {
  // Returns remaining balance in the given context, or -1 with toast when blocked.
  const cat = catById(catId);
  if (coexId) {
    const bal = quotaFor(coexId, catId) - quotaUsed(coexId, catId);
    if (bal <= 0) { toast('No quota balance left for this co-exhibitor in this category.', 'error'); return -1; }
    return bal;
  }
  const bal = exhibitorBalance(catId);
  // Vehicle passes: additional PAID passes can always be purchased beyond quota.
  if (bal <= 0 && cat.kind === 'vehicle') return 0;
  if (bal <= 0) { toast('No balance left in this category. Reduce co-exhibitor quota or contact the organiser.', 'error'); return -1; }
  return bal;
}

function openPassForm(catId, coexId) {
  const cat = catById(catId);
  if (passContextCheck(catId, coexId) === -1) return;
  const onBehalf = coexId
    ? '<div class="note" style="margin-top:0"><b class="title">Filling on behalf of ' + esc(coexById(coexId).company) + '</b>This pass will consume the co-exhibitor’s assigned quota.</div>'
    : '';
  const dateChecks = cat.kind === 'invitee'
    ? '<div class="field full"><label>Event Date Selection <span class="req">*</span></label>' +
      '<div class="checks">' + EVENT.eventDays.map((d, i) =>
        '<label class="check-item" id="dayChk' + i + '" onclick="toggleDay(' + i + ')"><input type="checkbox" id="day' + i + '" value="' + d + '">' + d + '</label>').join('') +
      '</div><div class="error" id="dayErr" style="display:none;color:var(--red);font-size:0.75rem;font-weight:600;margin-top:4px">Select at least one event date</div></div>' +
      '<div class="field full"><label class="check-item" style="display:inline-flex" id="carChkWrap" onclick="toggleCarPass()">' +
        '<input type="checkbox" id="addCarPass"> Add Car Pass for this invitee</label>' +
        '<div class="hint">Car pass application opens after saving this invitee.</div></div>'
    : '';

  openModal((coexId ? 'Add Pass (Co-Exhibitor)' : 'Add New') + ' · ' + esc(cat.name),
    onBehalf +
    '<form id="passForm" onsubmit="return submitPass(event, \'' + catId + '\', \'' + (coexId || '') + '\')" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>First Name <span class="req">*</span></label><input type="text" id="pFirst"><div class="error"></div></div>' +
      '<div class="field"><label>Last Name <span class="req">*</span></label><input type="text" id="pLast"><div class="error"></div></div>' +
      '<div class="field"><label>Email <span class="req">*</span></label><input type="email" id="pEmail"><div class="error"></div></div>' +
      '<div class="field"><label>Mobile <span class="req">*</span></label><input type="tel" id="pMobile" placeholder="10-digit mobile"><div class="error"></div></div>' +
      '<div class="field full"><label>Designation</label><input type="text" id="pDesig"></div>' +
      dateChecks +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'passForm\').requestSubmit()"><span class="material-symbols-outlined">badge</span>Save Pass</button>');
}

function toggleDay(i) {
  setTimeout(() => { $('dayChk' + i).classList.toggle('selected', $('day' + i).checked); }, 0);
}
function toggleCarPass() {
  setTimeout(() => { $('carChkWrap').classList.toggle('selected', $('addCarPass').checked); }, 0);
}

function submitPass(e, catId, coexId) {
  e.preventDefault();
  clearErrs();
  coexId = coexId || null;
  const cat = catById(catId);
  const first = $('pFirst').value.trim();
  const last = $('pLast').value.trim();
  const email = $('pEmail').value.trim();
  const mobile = $('pMobile').value.trim();
  let ok = true;
  if (!first) { setErr('pFirst', 'Required'); ok = false; }
  if (!last) { setErr('pLast', 'Required'); ok = false; }
  if (!email || !EMAIL_RE.test(email)) { setErr('pEmail', 'Enter a valid email'); ok = false; }
  if (!MOBILE_RE.test(mobile)) { setErr('pMobile', 'Enter a valid 10-digit mobile number'); ok = false; }

  let days = [];
  if (cat.kind === 'invitee') {
    days = EVENT.eventDays.filter((d, i) => $('day' + i).checked);
    if (days.length === 0) { $('dayErr').style.display = 'block'; ok = false; }
  }
  if (!ok) return false;
  if (passContextCheck(catId, coexId) === -1) return false;

  S.passes.push({
    id: uid('pass'), catId: catId, coexId: coexId,
    data: { firstName: first, lastName: last, email: email, mobile: mobile, designation: $('pDesig').value.trim(), dates: days },
    status: 'issued', amount: 0, createdAt: nowStr(),
  });
  save();
  const wantCar = cat.kind === 'invitee' && $('addCarPass') && $('addCarPass').checked;
  closeModal(); render();
  toast('Pass saved for ' + first + ' ' + last, 'success');
  if (wantCar) {
    const vehCat = S.categories.find((c) => c.kind === 'vehicle');
    openVehicleForm(vehCat.id, coexId);
  }
  return false;
}

/* ============================================================
   Send Link (e-invitee)
   ============================================================ */
function openSendLink(catId, coexId) {
  const cat = catById(catId);
  const ctx = coexId ? '<div class="note" style="margin-top:0"><b class="title">Sending for ' + esc(coexById(coexId).company) + '</b>The registration completed via this link will consume the co-exhibitor’s quota.</div>' : '';
  openModal('Send ' + (cat.kind === 'invitee' ? 'Invitee' : 'Pass') + ' Link · ' + esc(cat.name),
    ctx +
    '<p style="margin-top:0;color:var(--muted);font-size:0.86rem">An email notification with a self-registration link will be sent to the person below.</p>' +
    '<form id="linkForm" onsubmit="return submitSendLink(event, \'' + catId + '\', \'' + (coexId || '') + '\')" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>First Name <span class="req">*</span></label><input type="text" id="lFirst"><div class="error"></div></div>' +
      '<div class="field"><label>Last Name <span class="req">*</span></label><input type="text" id="lLast"><div class="error"></div></div>' +
      '<div class="field"><label>Email <span class="req">*</span></label><input type="email" id="lEmail"><div class="error"></div></div>' +
      '<div class="field"><label>Category of Passes</label><input type="text" value="' + esc(cat.name) + '" readonly></div>' +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'linkForm\').requestSubmit()"><span class="material-symbols-outlined">mail</span>Send Link</button>');
}

function submitSendLink(e, catId, coexId) {
  e.preventDefault();
  clearErrs();
  const first = $('lFirst').value.trim();
  const last = $('lLast').value.trim();
  const email = $('lEmail').value.trim();
  let ok = true;
  if (!first) { setErr('lFirst', 'Required'); ok = false; }
  if (!last) { setErr('lLast', 'Required'); ok = false; }
  if (!email || !EMAIL_RE.test(email)) { setErr('lEmail', 'Enter a valid email'); ok = false; }
  if (!ok) return false;
  S.invites.push({ id: uid('invite'), catId: catId, coexId: coexId || null, firstName: first, lastName: last, email: email, sentAt: nowStr() });
  save(); closeModal();
  toast('E-invitee link sent to ' + email, 'success');
  return false;
}

/* ============================================================
   View Passes modal
   ============================================================ */
function openViewPasses(catId, coexId) {
  const cat = catById(catId);
  const list = S.passes.filter((p) => p.catId === catId && (coexId ? p.coexId === coexId : true));
  const isVeh = cat.kind === 'vehicle';
  const head = isVeh
    ? '<tr><th>Sr.</th><th>Driver</th><th>Vehicle No.</th><th>Seater</th><th>Filled By</th><th>Status</th><th>Created</th></tr>'
    : '<tr><th>Sr.</th><th>Name</th><th>Email / Mobile</th>' + (cat.kind === 'invitee' ? '<th>Event Dates</th>' : '') + '<th>Filled By</th><th>Status</th><th>Created</th></tr>';
  const rows = list.map((p, i) => {
    const by = p.coexId ? esc(coexById(p.coexId).company) : 'Exhibitor';
    const st = p.status === 'issued'
      ? '<span class="pill green">Issued</span>'
      : '<span class="pill amber">Payment Pending</span>';
    if (isVeh) {
      return '<tr><td class="num">' + (i + 1) + '</td>' +
        '<td><span class="td-strong">' + esc(p.data.driverName) + '</span><span class="td-sub">' + esc(p.data.driverMobile) + '</span></td>' +
        '<td>' + esc(p.data.vehicleNo) + '</td>' +
        '<td>' + esc(p.data.seater) + ' Seater' + (p.amount ? ' · ' + money(p.amount) : ' · Complimentary') + '</td>' +
        '<td>' + by + '</td><td>' + st + '</td><td class="num">' + esc(p.createdAt) + '</td></tr>';
    }
    return '<tr><td class="num">' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(p.data.firstName + ' ' + p.data.lastName) + '</td>' +
      '<td>' + esc(p.data.email) + '<span class="td-sub">' + esc(p.data.mobile) + '</span></td>' +
      (cat.kind === 'invitee' ? '<td>' + p.data.dates.map((d) => d.split(' ')[0] + ' Feb').join(', ') + '</td>' : '') +
      '<td>' + by + '</td><td>' + st + '</td><td class="num">' + esc(p.createdAt) + '</td></tr>';
  }).join('') || '<tr><td colspan="7" style="color:var(--muted)">No passes filled yet.</td></tr>';

  openModal('Passes · ' + esc(cat.name) + (coexId ? ' · ' + esc(coexById(coexId).company) : ''),
    '<div class="tablewrap"><table class="grid">' + head + rows + '</table></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Close</button>', true);
}

/* ============================================================
   VIEW · Passes › Exhibitor Invitee Details
   ============================================================ */
function viewInvitee() {
  const cats = S.categories.filter((c) => c.kind === 'invitee');
  return '<h1 class="page-title">Exhibitor Invitee Details</h1>' +
    '<p class="page-sub">Invitee passes for your guests. Registration is date-wise for each event day.</p>' +
    '<div class="note green"><b class="title">Auto-allocated on space booking</b>' +
    'On confirmation of your space booking, Exhibitor Invitee category passes were automatically allocated to you. ' +
    'Badge registrations are <b>date-wise</b> — each invitee selects entry date(s): 11th, 12th &amp; 13th Feb 2027.</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Listing View</h2></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Category Name</th><th>Area Wise (Total)</th><th>Paid</th><th>Total Badges</th><th>Balance</th><th>Action</th></tr>' +
    cats.map((c, i) => catRow(c, i)).join('') +
    '</table></div></div>' + footerTools();
}

/* ============================================================
   VIEW · Passes › Vehicle Pass Details
   ============================================================ */
function viewVehicle() {
  const cats = S.categories.filter((c) => c.kind === 'vehicle');
  return '<h1 class="page-title">Vehicle Pass Details</h1>' +
    '<p class="page-sub">Vehicle parking passes. 6-seater ' + money(3500) + ' · 12-seater ' + money(5000) + ' when purchased beyond complimentary quota.</p>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Vehicle Pass List</h2></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Category Name</th><th>Area Wise (Free)</th><th>Paid</th><th>Total Passes</th><th>Balance</th><th>Action</th></tr>' +
    cats.map((c, i) => catRow(c, i, 'Co-Exhibitor')).join('') +
    '</table></div></div>' + footerTools();
}

/* ----- Vehicle pass application form ----- */
function openVehicleForm(catId, coexId) {
  const cat = catById(catId);
  if (passContextCheck(catId, coexId) === -1) return;
  // Complimentary if free balance remains in this context; else paid via cart.
  const ctxFreeLeft = coexId
    ? Math.max(0, quotaFor(coexId, catId) - quotaUsed(coexId, catId)) // co-ex quota comes from free pool
    : Math.max(0, cat.free - S.passes.filter((p) => p.catId === catId && p.amount === 0).length);
  const payNote = ctxFreeLeft > 0
    ? '<div class="note green" style="margin-top:0"><b class="title">Complimentary pass available</b>This application will use a complimentary pass from the quota. No payment needed.</div>'
    : '<div class="note amber" style="margin-top:0"><b class="title">Paid pass</b>Complimentary quota exhausted — this pass will be added to the cart for payment (6-seater ' + money(3500) + ' / 12-seater ' + money(5000) + ').</div>';
  const onBehalf = coexId ? '<div class="note" style="margin-top:0"><b class="title">On behalf of ' + esc(coexById(coexId).company) + '</b>Payment (if any) is added to the Main Exhibitor’s cart.</div>' : '';

  openModal('Vehicle Pass Application · ' + esc(cat.name),
    onBehalf + payNote +
    '<form id="vehForm" onsubmit="return submitVehicle(event, \'' + catId + '\', \'' + (coexId || '') + '\', ' + (ctxFreeLeft > 0) + ')" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Driver Name <span class="req">*</span></label><input type="text" id="vName"><div class="error"></div></div>' +
      '<div class="field"><label>Driver Mobile <span class="req">*</span></label><input type="tel" id="vMobile" placeholder="10-digit mobile"><div class="error"></div></div>' +
      '<div class="field"><label>Vehicle No. <span class="req">*</span></label><input type="text" id="vVehNo" placeholder="e.g. KA 01 AB 1234"><div class="error"></div></div>' +
      '<div class="field"><label>Email <span class="req">*</span></label><input type="email" id="vEmail"><div class="error"></div></div>' +
      '<div class="field"><label>Driver Licence Number <span class="req">*</span></label><input type="text" id="vDlNo"><div class="error"></div></div>' +
      '<div class="field"><label>Company Name</label><input type="text" id="vCompany" value="' + esc(coexId ? coexById(coexId).company : EVENT.exhibitor) + '" readonly></div>' +
      '<div class="field"><label>Upload Driving Licence <span class="req">*</span></label><input type="file" id="vDlFile" accept="image/*,.pdf"><div class="error"></div></div>' +
      '<div class="field"><label>Upload Delivery Challan Photo <span class="req">*</span></label><input type="file" id="vChallan" accept="image/*,.pdf"><div class="error"></div></div>' +
      '<div class="field full"><label>Seater Type <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
          '<label class="radio-card selected" id="seat6" onclick="setSeater(6)"><input type="radio" name="seater" value="6" checked><b>6 Seater</b><small>' + money(3500) + (ctxFreeLeft > 0 ? ' · complimentary for this pass' : '') + '</small></label>' +
          '<label class="radio-card" id="seat12" onclick="setSeater(12)"><input type="radio" name="seater" value="12"><b>12 Seater</b><small>' + money(5000) + (ctxFreeLeft > 0 ? ' · complimentary for this pass' : '') + '</small></label>' +
        '</div></div>' +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'vehForm\').requestSubmit()"><span class="material-symbols-outlined">' + (ctxFreeLeft > 0 ? 'check' : 'shopping_cart') + '</span>' + (ctxFreeLeft > 0 ? 'Submit' : 'Submit & Add to Cart') + '</button>');
}

function setSeater(n) {
  $('seat6').classList.toggle('selected', n === 6);
  $('seat12').classList.toggle('selected', n === 12);
  document.querySelector('input[name="seater"][value="' + n + '"]').checked = true;
}

function submitVehicle(e, catId, coexId, isFree) {
  e.preventDefault();
  clearErrs();
  coexId = coexId || null;
  const name = $('vName').value.trim();
  const mobile = $('vMobile').value.trim();
  const vehNo = $('vVehNo').value.trim();
  const email = $('vEmail').value.trim();
  const dlNo = $('vDlNo').value.trim();
  const dlFile = $('vDlFile').files[0];
  const challan = $('vChallan').files[0];
  const seater = document.querySelector('input[name="seater"]:checked').value;
  let ok = true;
  if (!name) { setErr('vName', 'Required'); ok = false; }
  if (!MOBILE_RE.test(mobile)) { setErr('vMobile', 'Enter a valid 10-digit mobile number'); ok = false; }
  if (!vehNo) { setErr('vVehNo', 'Required'); ok = false; }
  else if (!VEHNO_RE.test(vehNo)) { setErr('vVehNo', 'Enter a valid vehicle number (e.g. KA 01 AB 1234)'); ok = false; }
  if (!email || !EMAIL_RE.test(email)) { setErr('vEmail', 'Enter a valid email'); ok = false; }
  if (!dlNo) { setErr('vDlNo', 'Required'); ok = false; }
  if (!dlFile) { setErr('vDlFile', 'Upload the driving licence'); ok = false; }
  if (!challan) { setErr('vChallan', 'Upload the delivery challan photo'); ok = false; }
  if (!ok) return false;
  if (passContextCheck(catId, coexId) === -1) return false;

  const amount = isFree ? 0 : (seater === '6' ? 3500 : 5000);
  const passId = uid('pass');
  S.passes.push({
    id: passId, catId: catId, coexId: coexId,
    data: {
      driverName: name, driverMobile: mobile, vehicleNo: vehNo.toUpperCase(), email: email,
      dlNumber: dlNo, dlFile: dlFile.name, challanFile: challan.name, seater: seater,
      company: $('vCompany').value,
    },
    status: isFree ? 'issued' : 'payment_pending',
    amount: amount, createdAt: nowStr(),
  });
  if (!isFree) {
    S.cart.push({
      id: uid('cart'), type: 'vehicle', refId: passId,
      label: 'Vehicle Pass — ' + seater + ' Seater (' + vehNo.toUpperCase() + ')',
      sub: 'Driver: ' + name, amount: amount,
    });
  }
  save(); closeModal(); render();
  toast(isFree
    ? 'Complimentary vehicle pass issued for ' + vehNo.toUpperCase()
    : 'Vehicle pass added to cart — complete payment to issue it.', 'success');
  return false;
}

/* ============================================================
   Cart & payment (simulated gateway)
   ============================================================ */
function updateCartBadge() {
  const n = S.cart.length;
  const b = $('cartCount');
  b.style.display = n ? 'flex' : 'none';
  b.textContent = n;
}

function openCart() {
  closeCart();
  const fmtItem = (i) => i.currency === 'USD' ? '$' + Number(i.amount).toLocaleString('en-US') : money(i.amount);
  const items = S.cart.map((i) =>
    '<div class="cart-item"><div><b>' + esc(i.label) + '</b><small>' + esc(i.sub) + '</small></div>' +
    '<div style="text-align:right"><span class="money">' + fmtItem(i) + '</span><br>' +
    '<button class="btn-link danger" onclick="removeCartItem(\'' + i.id + '\')">Remove</button></div></div>').join('') ||
    '<div class="empty" style="padding:30px 10px"><span class="material-symbols-outlined">shopping_cart</span><h3>Cart is empty</h3></div>';
  const totalInr = S.cart.filter((i) => i.currency !== 'USD').reduce((a, i) => a + i.amount, 0);
  const totalUsd = S.cart.filter((i) => i.currency === 'USD').reduce((a, i) => a + i.amount, 0);
  const totalStr = [totalInr ? money(totalInr) : '', totalUsd ? '$' + totalUsd.toLocaleString('en-US') : '']
    .filter(Boolean).join(' + ') || money(0);

  const wrap = document.createElement('div');
  wrap.id = 'cartWrap';
  wrap.innerHTML =
    '<div class="drawer-overlay" onclick="closeCart()"></div>' +
    '<div class="drawer"><div class="drawer-head"><h3>Cart · Main Exhibitor</h3>' +
    '<button class="modal-close" onclick="closeCart()"><span class="material-symbols-outlined">close</span></button></div>' +
    '<div class="drawer-body">' + items + '</div>' +
    '<div class="drawer-foot"><div class="cart-total"><span>Total (incl. GST)</span><span class="money">' + totalStr + '</span></div>' +
    '<button class="btn btn-primary" style="width:100%;justify-content:center" ' + (S.cart.length ? '' : 'disabled') + ' onclick="payCart()">' +
    '<span class="material-symbols-outlined">lock</span>Pay Now</button>' +
    '<p style="font-size:0.72rem;color:var(--muted);text-align:center;margin:8px 0 0">Demo checkout — integrate your payment gateway here.</p></div></div>';
  document.body.appendChild(wrap);
}
function closeCart() { const c = $('cartWrap'); if (c) c.remove(); }

function removeCartItem(id) {
  const item = S.cart.find((i) => i.id === id);
  if (item.type === 'coex_reg') {
    toast('Registration fee can’t be removed while the co-exhibitor exists. Delete the co-exhibitor instead.', 'error');
    return;
  }
  if (item.type === 'aircraft_reg') {
    toast('Registration fee can’t be removed while the aircraft exists. Delete the aircraft instead.', 'error');
    return;
  }
  // vehicle: drop the pending pass too
  S.passes = S.passes.filter((p) => p.id !== item.refId);
  S.cart = S.cart.filter((i) => i.id !== id);
  save(); openCart(); render();
  toast('Removed from cart', 'success');
}

function payCart() {
  const paidCoex = [];
  if (!S.orders) S.orders = [];
  if (!S.seq.order) S.seq.order = 0;
  S.cart.forEach((i) => {
    if (i.type === 'coex_reg') {
      const c = coexById(i.refId);
      if (c) { c.status = 'active'; paidCoex.push(c); }
    } else if (i.type === 'vehicle') {
      const p = S.passes.find((x) => x.id === i.refId);
      if (p) p.status = 'issued';
    } else if (i.type === 'aircraft_reg') {
      const a = (S.aircraft || []).find((x) => x.id === i.refId);
      if (a) { a.status = 'registered'; a.paidAt = nowStr(); }
    }
    // Payment ledger record (Orders page reads this)
    S.orders.push({
      id: uid('order'),
      orderNo: 'ORD-2027-' + pad(S.seq.order, 4),
      type: i.type, label: i.label, sub: i.sub || '', refId: i.refId,
      amount: i.amount, currency: i.currency || 'INR',
      status: 'success',
      paidAt: nowStr(), paidAtIso: new Date().toISOString(),
      payer: EVENT.exhibitor,
    });
  });
  S.cart = [];
  save(); closeCart(); render();
  toast('Payment successful!', 'success');
  paidCoex.forEach((c) => {
    setTimeout(() => toast('Welcome email with login credentials sent to ' + c.email + ' (' + c.company + ')', 'success'), 500);
  });
}

/* ============================================================
   Shared footer + boot
   ============================================================ */
function footerTools() {
  return '<div class="footer-tools"><button onclick="resetDemo()">Reset demo data</button></div>';
}

/* ============================================================
   VIEW · Exhibitor Dashboard — quick access to every module
   ============================================================ */
function viewExhibitorDashboard() {
  const aircraft = S.aircraft || [];
  const paidInr = S.orders.filter((o) => o.currency !== 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const quotaTotal = S.categories.reduce((a, c) => a + catTotal(c), 0);
  const passesUsed = S.passes.length;
  const coexPending = S.coexhibitors.filter((c) => c.status === 'payment_pending').length;
  const acftDrafts = aircraft.filter((a) => a.status === 'draft').length;
  const acftUnpaid = aircraft.filter((a) => a.status === 'approved' && a.price != null).length;

  /* --- Aero Space hero — gradient banner with boarding-pass style
     stall tickets; friendly amber hero when nothing is booked yet --- */
  const totalSqm = S.stalls.reduce((a, st) => a + st.area, 0);
  const stallTickets = S.stalls.map((st) =>
    '<div class="stall-ticket">' +
      '<span class="sicon"><span class="material-symbols-outlined">storefront</span></span>' +
      '<div><div class="sno">' + esc(st.stall) + '</div>' +
      '<div class="smeta">' + esc(st.hall) + ' · ' + st.area + ' SQM</div></div>' +
    '</div>').join('');
  const spaceCard = S.stalls.length
    ? '<div class="hero-space">' +
        '<span class="material-symbols-outlined watermark">flight_takeoff</span>' +
        '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
          '<span class="hero-eyebrow"><span class="material-symbols-outlined" style="font-size:13px">verified</span>Aero Space · Booking Confirmed</span>' +
          '<h2>' + esc(EVENT.exhibitor) + '</h2>' +
          '<div class="stall-tickets">' + stallTickets + '</div>' +
          '<div class="hero-stats">' +
            '<div class="hero-stat"><b>' + S.stalls.length + '</b><span>Stalls Booked</span></div>' +
            '<div class="hero-stat"><b>' + totalSqm + ' <small style="font-size:0.75rem;font-weight:700">SQM</small></b><span>Total Area</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="btn-hero" href="#/space-requirement"><span class="material-symbols-outlined" style="font-size:17px">design_services</span>Space Requirement</a>' +
          '<a class="btn-hero btn-hero-ghost" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:17px">assignment</span>Exhibition Forms</a>' +
        '</div></div></div>'
    : '<div class="hero-space amber">' +
        '<span class="material-symbols-outlined watermark">flight</span>' +
        '<div class="hero-flex"><div style="flex:1;min-width:260px">' +
          '<span class="hero-eyebrow"><span class="material-symbols-outlined" style="font-size:13px">hourglass_top</span>Aero Space · Booking Pending</span>' +
          '<h2>' + esc(EVENT.exhibitor) + '</h2>' +
          '<p style="margin:10px 0 0;font-size:0.86rem;color:#FBE9C8;max-width:520px">Your space booking is not confirmed yet. Submit your space requirement — booked stalls will appear here once the organiser confirms your space.</p>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="btn-hero" href="#/space-requirement"><span class="material-symbols-outlined" style="font-size:17px">design_services</span>Submit Requirement</a>' +
        '</div></div></div>';

  /* --- Pending actions (only what actually needs attention) --- */
  const actions = [];
  if (S.cart.length) actions.push({
    icon: 'shopping_cart', title: S.cart.length + ' item(s) in cart awaiting payment',
    sub: 'Complete the payment to activate registrations & passes.',
    btn: '<button class="btn btn-primary btn-sm" onclick="openCart()">Pay Now</button>',
  });
  if (coexPending) actions.push({
    icon: 'group_add', title: coexPending + ' co-exhibitor registration payment pending',
    sub: 'Separate co-exhibitors unlock stall & quotas after the ' + money(EVENT.coexRegFee) + ' fee.',
    btn: '<button class="btn btn-outline btn-sm" onclick="openCart()">Complete Payment</button>',
  });
  if (acftDrafts) actions.push({
    icon: 'flight', title: acftDrafts + ' aircraft application(s) in draft',
    sub: 'Complete all 4 forms to submit for committee approval.',
    btn: '<a class="btn btn-outline btn-sm" href="#/aircraft">Continue</a>',
  });
  if (acftUnpaid) actions.push({
    icon: 'payments', title: acftUnpaid + ' approved aircraft registration(s) unpaid',
    sub: 'The committee approved — pay the registration fee from your cart.',
    btn: '<button class="btn btn-outline btn-sm" onclick="openCart()">Pay Fee</button>',
  });
  const formsPending = (typeof exFormsSubmitted === 'function') ? 5 - exFormsSubmitted() : 0;
  if (formsPending > 0) actions.push({
    icon: 'assignment', title: formsPending + ' exhibition form(s) pending',
    sub: 'Catalogue, sponsorship, contractor, furniture & electrical forms — deadline 31 Dec 2026.',
    btn: '<a class="btn btn-outline btn-sm" href="#/exhibition-forms">Fill Now</a>',
  });
  const b2bPending = (typeof b2bIncomingPending === 'function' && S.b2b) ? b2bIncomingPending() : 0;
  if (b2bPending > 0) actions.push({
    icon: 'hub', title: b2bPending + ' incoming B2B meeting request(s)',
    sub: 'Visitors matched to your offering want to meet — accept or decline their requests.',
    btn: '<a class="btn btn-outline btn-sm" href="#/b2b-matchmaking" onclick="window.__b2bTab=\'meetings\'">Respond</a>',
  });
  const actionsCard = actions.length
    ? '<div class="card section-gap pending-card"><div class="card-head-row"><h2 class="card-title">Pending Actions</h2>' +
      '<span class="pill amber">' + actions.length + ' pending</span></div>' +
      actions.map((a) =>
        '<div class="action-row"><span class="aicon"><span class="material-symbols-outlined">' + a.icon + '</span></span>' +
        '<div class="atext"><b>' + a.title + '</b><span>' + a.sub + '</span></div>' + a.btn + '</div>').join('') +
      '</div>'
    : '';

  /* --- Feature grid --- */
  const feat = (route, color, icon, title, sub) =>
    '<div class="feat-card" onclick="location.hash=\'' + route + '\'">' +
      '<span class="material-symbols-outlined fgo">arrow_forward</span>' +
      '<span class="ficon ' + color + '"><span class="material-symbols-outlined">' + icon + '</span></span>' +
      '<span class="ftitle">' + title + '</span>' +
      (sub ? '<span class="fsub">' + sub + '</span>' : '') +
    '</div>';
  const soon = (color, icon, title) =>
    '<div class="feat-card soon">' +
      '<span class="soon-pill">Coming Soon</span>' +
      '<span class="ficon ' + color + '"><span class="material-symbols-outlined">' + icon + '</span></span>' +
      '<span class="ftitle">' + title + '</span>' +
    '</div>';

  const grid =
    '<div class="feat-grid">' +
      feat('#/profile', 'fc-slate', 'account_circle', 'Exhibitor Profile',
        (typeof profileOverallPct === 'function' ? profileOverallPct() + '% profile complete' : '')) +
      feat('#/space-booking/my', 'fc-blue', 'view_comfy_alt', 'Space Booking',
        ((S.spaceBooking && S.spaceBooking.applications.length) || 0) + ' application(s) · ' + S.stalls.length + ' stall(s) booked') +
      feat('#/aircraft', 'fc-cyan', 'flight', 'Aircraft Registration',
        aircraft.length + ' application(s)') +
      feat('#/orders', 'fc-orange', 'receipt_long', 'My Orders',
        S.orders.length + ' order(s) · ' + money(paidInr) + ' paid') +
      feat('#/passes/badges', 'fc-green', 'badge', 'Badges',
        passesUsed + ' of ' + quotaTotal + ' passes used') +
      feat('#/co-exhibitors', 'fc-teal', 'group_add', 'Co-Exhibitor',
        S.coexhibitors.length + ' added' + (coexPending ? ' · ' + coexPending + ' payment pending' : '')) +
      feat('#/exhibition-forms', 'fc-purple', 'assignment', 'Exhibition Forms',
        (typeof exFormsSubmitted === 'function' ? exFormsSubmitted() + ' of 5 forms submitted' : '')) +
      feat('#/conference-hall', 'fc-pink', 'meeting_room', 'Meeting Rooms',
        (S.bookings ? S.bookings.filter((b) => b.kind === 'conference').length : 0) + ' booking(s)') +
      feat('#/meeting-room', 'fc-amber', 'handshake', 'B2B Table',
        (S.bookings ? S.bookings.filter((b) => b.kind === 'b2b').length : 0) + ' booking(s)') +
      feat('#/b2b-matchmaking', 'fc-teal', 'hub', 'B2B Matchmaking',
        (typeof b2bIncomingPending === 'function' && S.b2b
          ? S.b2b.meetings.filter((m) => m.status === 'confirmed').length + ' confirmed · ' + b2bIncomingPending() + ' incoming'
          : '')) +
      feat('#/digital-showcase', 'fc-red', 'storefront', 'Digital Showcase',
        ((S.profile && S.profile.business.products.length) || 0) + ' product(s) · ' +
        (S.booth ? S.booth.videos.length : 0) + ' video(s) · ' +
        (S.booth ? S.booth.documents.length : 0) + ' doc(s)') +
    '</div>';

  /* --- Important Documents and Agenda (organiser circulars) --- */
  const impDocsCard =
    '<div class="card section-gap" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
      '<span class="icon-sq" style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#EAF0FC,#FBF1DC)">' +
        '<span class="material-symbols-outlined" style="font-size:30px;color:var(--blue)">history_edu</span></span>' +
      '<div style="flex:1;min-width:240px">' +
        '<b style="font-size:0.98rem">Important Documents and Agenda</b>' +
        '<div style="font-size:0.8rem;color:var(--muted)">The important document files contain vital information and guidelines to help you make the most of your participation.</div>' +
      '</div>' +
      '<button class="btn btn-primary" onclick="openImportantDocs()">Important Documents' +
        '<span class="material-symbols-outlined" style="font-size:17px">chevron_right</span></button>' +
    '</div>';

  return '<div class="dash-hello"><div>' +
      '<h1 class="page-title">Hi ' + esc(EVENT.exhibitor) + ', let’s get started 👋</h1>' +
      '<p class="page-sub" style="margin-bottom:0">This is a quick summary of your participation. You can access every key section here.</p>' +
    '</div></div>' +
    spaceCard +
    actionsCard +
    impDocsCard +
    '<div class="section-gap"><div class="dash-section-head"><h2 class="card-title" style="margin:0">Quick Access</h2>' +
      '<span class="sub">Everything assigned to your participation, one tap away</span></div>' + grid + '</div>' +
    footerTools();
}

/* ============================================================
   VIEW · My Orders — the exhibitor's own payment history
   ============================================================ */
const MY_ORDER_TYPE = { coex_reg: 'Co-Exhibitor Registration', vehicle: 'Vehicle Pass', aircraft_reg: 'Aircraft Registration', exh_form: 'Exhibition Form', booking: 'Hall / Table Booking', space: 'Space Booking' };

window.__moQ = window.__moQ || '';
window.__moType = window.__moType || '';
window.__moDate = window.__moDate || '';
window.__moPage = window.__moPage || 1;
const MO_ROWS = 10;
function moSetQ(v) { window.__moQ = v; window.__moPage = 1; render(); const el = $('moQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function moSetType(v) { window.__moType = v; window.__moPage = 1; render(); }
function moSetDate(v) { window.__moDate = v; window.__moPage = 1; render(); }
function moPage(d) { window.__moPage += d; render(); }

function moParseTs(s) {
  if (!s) return null;
  const d = new Date(String(s).replace('Sept', 'Sep').replace(',', ''));
  return isNaN(d.getTime()) ? null : d;
}
function moInDatePreset(s, preset) {
  if (!preset) return true;
  const d = moParseTs(s);
  if (!d) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const day = 864e5;
  if (preset === 'today') return d >= t;
  if (preset === 'yesterday') return d >= new Date(t - day) && d < t;
  if (preset === 'week') return d >= new Date(t - 6 * day);
  if (preset === 'month') return d >= new Date(t - 29 * day);
  return true;
}

/* Printable tax invoice for any paid order (same pattern as the
   aircraft invoice — opens a print-ready window). */
function downloadOrderInvoice(orderNo) {
  const o = S.orders.find((x) => x.orderNo === orderNo);
  if (!o) { toast('Invoice is available after payment.', 'error'); return; }
  const invNo = 'INV-' + o.orderNo.replace('ORD-', '');
  const amt = o.currency === 'USD' ? '$' + Number(o.amount).toLocaleString('en-US') : money(o.amount);
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + invNo + '</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#212B36;margin:0;padding:40px;font-size:14px}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2F62D8;padding-bottom:16px}' +
    '.logo{font-size:26px;font-weight:800;color:#2F62D8}' +
    'h1{font-size:20px;margin:0;text-align:right}.muted{color:#6B7686;font-size:12px}' +
    '.grid{display:flex;justify-content:space-between;margin:24px 0}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px}' +
    'th{background:#F1F4F9;text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}' +
    'td{padding:10px 12px;border-bottom:1px solid #E6EAF2}' +
    '.total td{font-weight:800;font-size:16px;border-top:2px solid #212B36;border-bottom:none}' +
    '.right{text-align:right}.stamp{display:inline-block;margin-top:8px;padding:4px 14px;border:2px solid #1E8E5A;color:#1E8E5A;font-weight:800;border-radius:6px;transform:rotate(-4deg)}' +
    '.foot{margin-top:36px;font-size:11px;color:#6B7686;border-top:1px solid #E6EAF2;padding-top:12px}' +
    '.noprint{margin-top:24px}@media print{.noprint{display:none}}' +
    '</style></head><body>' +
    '<div class="top"><div><div class="logo">evenuefy</div><div class="muted">' + esc(EVENT.name) + ' · ' + esc(EVENT.dates) + '</div></div>' +
    '<div><h1>TAX INVOICE</h1><div class="muted right">Invoice No: <b>' + esc(invNo) + '</b><br>Date: ' + esc(o.paidAt || '') + '</div></div></div>' +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(EVENT.exhibitor) + '</b><br>' + esc(EVENT.exhibitorCountry) + '</div>' +
    '<div class="right"><div class="muted">ORDER</div><b>' + esc(o.orderNo) + '</b><br><span class="stamp">PAID</span></div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount</th></tr>' +
    '<tr><td>' + esc(MY_ORDER_TYPE[o.type] || o.type) + ' — ' + esc(o.label) +
      (o.sub ? '<br><span class="muted">' + esc(o.sub) + '</span>' : '') + '</td>' +
      '<td class="right">' + esc(amt) + '</td></tr>' +
    '<tr class="total"><td>Total (' + (o.currency === 'USD' ? 'USD' : 'INR, incl. GST') + ')</td><td class="right">' + esc(amt) + '</td></tr></table>' +
    '<div class="foot">This is a computer-generated invoice for the payment collected on behalf of the organiser · ' + esc(EVENT.name) + ' · Payment method: CARD.</div>' +
    '<div class="noprint"><button onclick="window.print()" style="background:#2F62D8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>' +
    '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the invoice.', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

function viewMyOrders() {
  const paidInr = S.orders.filter((o) => o.currency !== 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const paidUsd = S.orders.filter((o) => o.currency === 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const cartTotal = S.cart.reduce((a, i) => a + Number(i.amount || 0), 0);

  /* one unified list — cart items ride on top as Pending */
  const all = S.cart.map((i) => ({
    id: '—', type: i.type, label: i.label, sub: i.sub || '', amount: i.amount,
    currency: i.currency || 'INR', method: '—', status: 'pending', date: '',
  })).concat(S.orders.slice().reverse().map((o) => ({
    id: o.orderNo, type: o.type, label: o.label, sub: o.sub || '', amount: o.amount,
    currency: o.currency || 'INR', method: 'CARD', status: 'success', date: o.paidAt,
  })));

  const q = window.__moQ.toLowerCase();
  let list = all;
  if (q) list = list.filter((o) => (o.id + ' ' + o.label + ' ' + o.sub + ' ' + (MY_ORDER_TYPE[o.type] || '')).toLowerCase().includes(q));
  if (window.__moType) list = list.filter((o) => o.type === window.__moType);
  if (window.__moDate) list = list.filter((o) => o.status === 'pending' ? false : moInDatePreset(o.date, window.__moDate));

  const totalPages = Math.max(1, Math.ceil(list.length / MO_ROWS));
  if (window.__moPage > totalPages) window.__moPage = totalPages;
  const start = (window.__moPage - 1) * MO_ROWS;
  const pageList = list.slice(start, start + MO_ROWS);

  const typeIcon = { coex_reg: 'group_add', vehicle: 'directions_car', aircraft_reg: 'flight', exh_form: 'assignment', booking: 'meeting_room', space: 'grid_on' };
  const rows = pageList.map((o) =>
    '<tr><td><span class="regno">' + esc(o.id) + '</span></td>' +
    '<td><span class="td-strong"><span class="material-symbols-outlined" style="font-size:16px;color:var(--blue);vertical-align:-3px">' + (typeIcon[o.type] || 'receipt_long') + '</span> ' +
      esc(MY_ORDER_TYPE[o.type] || o.type) + '</span>' +
      '<span class="td-sub">' + esc(o.label) + (o.sub ? ' · ' + esc(o.sub) : '') + '</span></td>' +
    '<td class="money">' + (o.currency === 'USD' ? '$' + Number(o.amount).toLocaleString('en-US') : money(o.amount)) + '</td>' +
    '<td>' + (o.status === 'success' ? 'CARD' : '<span style="color:var(--muted)">—</span>') + '</td>' +
    '<td>' + (o.status === 'success'
      ? '<span class="pill green"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:-2px">check_circle</span> Success</span>'
      : '<span class="pill amber">Pending</span>') + '</td>' +
    '<td>' + (o.date
      ? esc(o.date) + ' <button class="btn-link" title="Download Invoice" onclick="downloadOrderInvoice(\'' + esc(o.id) + '\')"><span class="material-symbols-outlined" style="font-size:17px">receipt_long</span></button>'
      : '<button class="btn-link" onclick="openCart()">Pay Now</button>') + '</td></tr>').join('') ||
    '<tr><td colspan="6" style="color:var(--muted)">' +
      (all.length ? 'No orders match your search / filter.' : 'No orders yet — payments you make from the cart will appear here.') + '</td></tr>';

  const typeOpts = '<select onchange="moSetType(this.value)" style="border:1px solid #CFD7E4;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.84rem;cursor:pointer">' +
    '<option value="">All Types</option>' +
    Object.keys(MY_ORDER_TYPE).map((k) => '<option value="' + k + '"' + (window.__moType === k ? ' selected' : '') + '>' + MY_ORDER_TYPE[k] + '</option>').join('') +
    '</select>';

  return '<h1 class="page-title">My Orders</h1>' +
    '<p class="page-sub">All your payments — space booking, exhibition forms, passes, aircraft registration and bookings.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Orders</div><div class="t-value">' + S.orders.length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Total Paid</div><div class="t-value">' + money(paidInr) +
        (paidUsd ? ' <small style="font-size:0.65em">+ $' + paidUsd.toLocaleString('en-US') + '</small>' : '') + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending in Cart</div><div class="t-value">' + S.cart.length +
        (cartTotal ? '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> · ' + money(cartTotal) + '</span>' : '') + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Order History</h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
        '<input type="text" id="moQ" value="' + esc(window.__moQ) + '" placeholder="Search orders.." oninput="moSetQ(this.value)" ' +
          'style="min-width:190px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.84rem">' +
        typeOpts +
        '<select onchange="moSetDate(this.value)" style="border:1px solid #CFD7E4;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.84rem;cursor:pointer">' +
          [['', 'All Dates'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['month', 'Last 30 Days']].map(([v, l]) =>
            '<option value="' + v + '"' + (window.__moDate === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
        (S.cart.length ? '<button class="btn btn-primary btn-sm" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Pay Pending (' + S.cart.length + ')</button>' : '') +
      '</div></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Payment Info</th><th>Type</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr>' +
    rows + '</table></div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px;font-size:0.8rem;color:var(--muted)">' +
      '<span>Total: <b>' + list.length + '</b> · Rows ' + MO_ROWS + '</span>' +
      '<span style="display:flex;align-items:center;gap:8px">Showing <b>' + (list.length ? start + 1 : 0) + '</b> to <b>' + Math.min(start + MO_ROWS, list.length) + '</b>' +
        '<button class="btn btn-outline btn-sm" onclick="moPage(-1)"' + (window.__moPage <= 1 ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_left</span></button>' +
        '<button class="btn btn-outline btn-sm" onclick="moPage(1)"' + (window.__moPage >= totalPages ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_right</span></button>' +
      '</span></div>' +
    '</div>' +
    footerTools();
}

/* ============================================================
   Notifications — bell in the header, "Only show Unread" toggle,
   platform-style empty state. Stored in shared state so read
   status persists.
   ============================================================ */
(function migrateNotifs() {
  if (!S.notifications) {
    S.notifications = [
      { id: 'nt1', icon: 'check_circle', color: 'var(--green)', text: 'Your space booking application has been received.', time: '2 days ago', read: false },
      { id: 'nt2', icon: 'warning', color: 'var(--amber)', text: 'Exhibition forms are due by 31 Dec 2026 — 5 forms pending.', time: '3 days ago', read: false },
      { id: 'nt3', icon: 'campaign', color: 'var(--blue)', text: 'New circular released: Exhibitor Guidelines.', time: '1 week ago', read: true },
      { id: 'nt4', icon: 'flight', color: 'var(--blue)', text: 'Aircraft registration window is open for Static & Flying Display.', time: '1 week ago', read: true },
    ];
  }
  if (!S.queries) S.queries = []; // help-desk queries {tid,cat,title,desc,file,status,createdAt}
  save();
})();

window.__notifUnreadOnly = false;

function notifUnread() { return S.notifications.filter((n) => !n.read).length; }
function updateNotifBadge() {
  const el = $('notifCount');
  if (!el) return;
  const n = notifUnread();
  el.textContent = n;
  el.style.display = n ? 'flex' : 'none';
}

function openNotifications() {
  const list = window.__notifUnreadOnly ? S.notifications.filter((n) => !n.read) : S.notifications;
  const rows = list.map((n) =>
    '<div class="action-row" style="cursor:pointer;' + (n.read ? 'opacity:0.65' : '') + '" onclick="markNotifRead(\'' + n.id + '\')">' +
      '<span class="aicon" style="background:#F1F4FA;color:' + n.color + '"><span class="material-symbols-outlined">' + n.icon + '</span></span>' +
      '<div class="atext"><b style="font-weight:' + (n.read ? '500' : '700') + '">' + esc(n.text) + '</b><span>' + esc(n.time) + '</span></div>' +
      (n.read ? '' : '<span style="width:9px;height:9px;border-radius:99px;background:var(--blue);flex:none"></span>') +
    '</div>').join('');
  const empty =
    '<div class="empty" style="padding:40px 10px"><span class="material-symbols-outlined" style="font-size:56px;color:var(--blue)">notifications</span>' +
    '<h3>No Notifications yet</h3><p>' + (window.__notifUnreadOnly ? 'You have read everything — nice!' : 'Updates from the organiser will appear here.') + '</p></div>';
  openModal('Notification',
    '<div style="display:flex;justify-content:flex-end;gap:14px;margin-bottom:8px;align-items:center">' +
      '<label class="check-item' + (window.__notifUnreadOnly ? ' selected' : '') + '" style="display:inline-flex;border:none;padding:2px 6px" ' +
        'onclick="event.preventDefault();window.__notifUnreadOnly=!window.__notifUnreadOnly;openNotifications()">' +
        '<input type="checkbox"' + (window.__notifUnreadOnly ? ' checked' : '') + '>Only show Unread</label>' +
      (notifUnread() ? '<button class="btn-link" onclick="markAllNotifsRead()">Mark all read</button>' : '') +
    '</div>' +
    (rows || empty), '', true);
}
function markNotifRead(id) {
  const n = S.notifications.find((x) => x.id === id);
  if (n && !n.read) { n.read = true; save(); }
  updateNotifBadge();
  openNotifications();
}
function markAllNotifsRead() {
  S.notifications.forEach((n) => { n.read = true; });
  save(); updateNotifBadge(); openNotifications();
}

/* ============================================================
   Help Desk — "How can we assist you today?" (platform widget):
   Raise a Query (category · title · description · attachment) and
   Track Your Query by tracking number.
   ============================================================ */
const QUERY_CATS = ['General', 'Space Booking', 'Payments & Orders', 'Passes & Badges', 'Exhibition Forms', 'Technical Issue'];

function openHelpDesk() {
  const optionCard = (icon, title, sub, fn, label) =>
    '<div class="card" style="padding:16px;margin-top:12px;cursor:pointer" onclick="' + fn + '">' +
      '<b style="font-size:0.94rem">' + title + '</b>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:4px 0 10px">' + sub + '</p>' +
      '<span class="btn btn-outline btn-sm">' + icon + ' ' + label + ' <span class="material-symbols-outlined" style="font-size:15px">chevron_right</span></span>' +
    '</div>';
  openModal('👋 Welcome! How can we assist you today?',
    '<p style="margin:0;color:var(--muted);font-size:0.84rem">Here’s what you can do</p>' +
    optionCard('✋', 'Raise a Query?', 'Have a question or issue? Use our form to create a new query.', 'openRaiseQuery()', 'Raise a Query') +
    optionCard('🔎', 'Track Your Query?', 'Already submitted a query? Enter your tracking number to check its status.', 'openTrackQuery()', 'Track existing'));
}

function openRaiseQuery() {
  openModal('Select Your Query',
    '<div class="form-grid">' +
      '<div class="field full"><label>Query Category <span class="req">*</span></label><select id="qCat">' +
        QUERY_CATS.map((c) => '<option>' + c + '</option>').join('') + '</select></div>' +
      '<div class="field full"><label>Query Title <span class="req">*</span></label><input type="text" id="qTitle"><div class="error"></div></div>' +
      '<div class="field full"><label>Description <span class="req">*</span></label>' +
        '<textarea id="qDesc" rows="3" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem"></textarea><div class="error"></div></div>' +
      '<div class="field full"><label>Attachments</label><input type="file" id="qFile" accept=".pdf,image/*"><div class="hint">Maximum 5MB file size allowed</div></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="openHelpDesk()">Back</button>' +
    '<button class="btn btn-primary" onclick="submitQuery()"><span class="material-symbols-outlined">send</span>Submit</button>', true);
}

function submitQuery() {
  clearErrs();
  const title = $('qTitle').value.trim();
  const desc = $('qDesc').value.trim();
  let ok = true;
  if (!title) { setErr('qTitle', 'Query title is required'); ok = false; }
  if (!desc) { setErr('qDesc', 'Description is required'); ok = false; }
  const f = $('qFile').files[0];
  if (f && f.size > 5 * 1024 * 1024) { toast('Attachment is larger than 5 MB.', 'error'); return; }
  if (!ok) return;
  S.seq.query = (S.seq.query || 0) + 1;
  const tid = 'QRY-2027-' + pad(S.seq.query, 4);
  S.queries.unshift({ tid: tid, cat: $('qCat').value, title: title, desc: desc, file: f ? f.name : '', status: 'Open', createdAt: nowStr() });
  save();
  openModal('Query Submitted',
    '<div style="text-align:center;padding:14px 4px">' +
      '<span class="material-symbols-outlined" style="font-size:56px;color:var(--green)">check_circle</span>' +
      '<h3 style="margin:8px 0 4px">We’ve received your query</h3>' +
      '<p style="font-size:0.84rem;color:var(--muted)">Our helpdesk team will get back to you shortly. Save your tracking number:</p>' +
      '<div class="regno" style="font-size:1.2rem;background:var(--blue-soft);color:var(--blue);padding:8px 18px;border-radius:9px;display:inline-block">' + tid + '</div>' +
    '</div>',
    '<button class="btn btn-primary" onclick="closeModal()">Done</button>');
  toast('Query ' + tid + ' raised.', 'success');
}

function openTrackQuery() {
  const recent = S.queries.slice(0, 4).map((q) =>
    '<div class="action-row" style="cursor:pointer" onclick="$(\'trkNo\').value=\'' + q.tid + '\';trackQuery()">' +
      '<span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">contact_support</span></span>' +
      '<div class="atext"><b>' + esc(q.tid) + ' · ' + esc(q.title) + '</b><span>' + esc(q.cat) + ' · ' + esc(q.createdAt) + '</span></div>' +
      '<span class="pill ' + (q.status === 'Resolved' ? 'green' : 'amber') + '">' + q.status + '</span>' +
    '</div>').join('');
  openModal('Track Your Query',
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input type="text" id="trkNo" placeholder="e.g. QRY-2027-0001" style="flex:1;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem">' +
      '<button class="btn btn-primary" onclick="trackQuery()">🔎 Track</button></div>' +
    '<div id="trkResult"></div>' +
    (recent ? '<div style="margin-top:10px"><b style="font-size:0.82rem;color:var(--muted)">YOUR RECENT QUERIES</b>' + recent + '</div>' : ''),
    '<button class="btn btn-outline" onclick="openHelpDesk()">Back</button>', true);
}

function trackQuery() {
  const no = $('trkNo').value.trim().toUpperCase();
  const q = S.queries.find((x) => x.tid === no);
  $('trkResult').innerHTML = q
    ? '<div class="note green" style="margin:0"><b class="title">' + esc(q.tid) + ' — ' + q.status + '</b>' +
      esc(q.title) + ' · ' + esc(q.cat) + '<br><span style="color:var(--muted)">Raised ' + esc(q.createdAt) +
      (q.file ? ' · Attachment: ' + esc(q.file) : '') + '. Our helpdesk team is reviewing your query.</span></div>'
    : '<div class="note amber" style="margin:0"><b class="title">No query found</b>Check the tracking number — e.g. QRY-2027-0001.</div>';
}

/* ============================================================
   Important Documents and Agenda — organiser-published circulars
   (in production these rows serve the PDFs uploaded in the CMS)
   ============================================================ */
const IMPORTANT_DOCS = [
  { name: 'Terms & Condition', sub: 'Participation terms for Aero India 2027' },
  { name: 'Exhibitor Manual', sub: 'Stall guidelines, timelines & venue rules' },
  { name: 'AERO INDIA — Flying Display Manual', sub: 'Flying display procedures & safety' },
  { name: 'Event Agenda & Programme', sub: 'Day-wise schedule, 10–15 Feb 2027' },
  { name: 'Exhibitor Guidelines Circular', sub: 'Latest circular from the organiser' },
];

function openImportantDocs() {
  const rows = IMPORTANT_DOCS.map((d, i) =>
    '<div class="doc-row" style="border:1px solid var(--line);border-radius:10px;padding:13px 14px;margin-bottom:10px;cursor:pointer" onclick="viewImportantDoc(' + i + ')">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">description</span></span>' +
      '<div class="dname">' + esc(d.name) + '<small>' + esc(d.sub) + ' · PDF</small></div>' +
      '<span class="material-symbols-outlined" style="color:var(--muted)">chevron_right</span>' +
    '</div>').join('');
  openModal('Important Documents And Agenda', rows, '', true);
}

function viewImportantDoc(i) {
  toast('Opening "' + IMPORTANT_DOCS[i].name + '" — in production this serves the organiser-uploaded PDF.', 'success');
}

/* ============================================================
   Exhibitor login gate — the app opens on a login screen; the
   shell renders only for a logged-in session (demo credentials).
   ============================================================ */
const EXH_SESSION_KEY = 'evenuefy_exhibitor_session';
function exhibitorLoggedIn() {
  try { return sessionStorage.getItem(EXH_SESSION_KEY) === 'yes'; } catch (e) { return false; }
}

function exhibitorLogin(e) {
  e.preventDefault();
  clearErrs();
  const email = $('lgEmail').value.trim();
  const pwd = $('lgPassword').value;
  let ok = true;
  if (!email) { setErr('lgEmail', 'Email is required'); ok = false; }
  else if (!EMAIL_RE.test(email)) { setErr('lgEmail', 'Enter a valid email address'); ok = false; }
  if (!pwd) { setErr('lgPassword', 'Password is required'); ok = false; }
  if (!ok) return false;
  try { sessionStorage.setItem(EXH_SESSION_KEY, 'yes'); } catch (err) { /* ignore */ }
  enterExhibitorApp();
  toast('Welcome back, ' + EVENT.exhibitor, 'success');
  return false;
}

function exhibitorLogout() {
  try { sessionStorage.removeItem(EXH_SESSION_KEY); } catch (e) { /* ignore */ }
  location.hash = '';
  $('appShell').style.display = 'none';
  $('loginScreen').style.display = 'flex';
}

function enterExhibitorApp() {
  $('loginScreen').style.display = 'none';
  $('appShell').style.display = 'flex';
  if (!location.hash) location.hash = '#/dashboard';
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  if (exhibitorLoggedIn()) enterExhibitorApp();
  // not logged in → the login screen stays visible; the shell renders after login
});
