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
  if (mCoex) { view = viewCatCoexPage; arg = mCoex[2]; }
  else if (mProf) { view = viewProfile; arg = mProf[1] || 'company'; }
  else view = ROUTES[route] || viewExhibitorDashboard;

  // sidebar active state
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const r = el.getAttribute('data-route');
    el.classList.toggle('active', route === r || (mCoex && r === 'passes/' + mCoex[1]) ||
      (r === 'aircraft' && route.indexOf('aircraft') === 0) ||
      (r === 'profile' && route.indexOf('profile') === 0));
  });

  $('view').innerHTML = view(arg);
  updateCartBadge();
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

function viewBadges() {
  const badgeCats = S.categories.filter((c) => c.kind === 'badge');
  const totals = badgeCats.reduce((a, c) => {
    a.total += catTotal(c);
    a.used += usedByExhibitor(c.id) + S.passes.filter((p) => p.catId === c.id && p.coexId).length;
    return a;
  }, { total: 0, used: 0 });

  return '<h1 class="page-title">Badge Details</h1>' +
    '<p class="page-sub">Category-wise badge quota. Allocate quota to co-exhibitors, register your team, or send e-invitee links.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Quota</div><div class="t-value">' + totals.total + '</div></div>' +
      '<div class="tile"><div class="t-label">Used</div><div class="t-value">' + totals.used + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Available</div><div class="t-value">' + (totals.total - totals.used) + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Category-wise List</h2></div>' +
      '<div class="tablewrap"><table class="grid">' +
      '<tr><th>Sr.</th><th>Type of Category</th><th>Area Wise (Free)</th><th>Paid Badges</th><th>Total Badges</th><th>Balance</th><th>Action</th></tr>' +
      badgeCats.map((c, i) => catRow(c, i)).join('') +
      '</table></div></div>' + footerTools();
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

  /* --- My Space strip — one chip-row per BOOKED stall; when no space is
     booked yet, the card turns into a friendly empty state instead --- */
  const spaceChips = S.stalls.map((st) =>
    '<div class="schip"><b>Hall</b><span>' + esc(st.hall) + '</span></div>' +
    '<div class="schip"><b>Stall No.</b><span>' + esc(st.stall) + '</span></div>' +
    '<div class="schip"><b>Area</b><span>' + st.area + ' SQM</span></div>' +
    '<span style="flex-basis:100%;height:0"></span>').join('');
  const spaceCard = S.stalls.length
    ? '<div class="card"><div class="card-head-row"><div>' +
        '<span class="pill blue">Aero Space · ' + S.stalls.length + ' stall(s) booked</span>' +
        '<h2 class="card-title" style="margin-top:8px">' + esc(EVENT.exhibitor) + '</h2></div>' +
        '<a class="btn btn-outline btn-sm" href="#/space-requirement"><span class="material-symbols-outlined" style="font-size:16px">design_services</span>Space Requirement</a></div>' +
        '<div class="space-chips">' + spaceChips + '</div></div>'
    : '<div class="card"><div class="card-head-row"><div>' +
        '<span class="pill amber">No Space Booked Yet</span>' +
        '<h2 class="card-title" style="margin-top:8px">' + esc(EVENT.exhibitor) + '</h2></div></div>' +
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">view_comfy_alt</span></span>' +
          '<div style="flex:1"><b style="font-size:0.9rem">Your space booking is not confirmed yet.</b>' +
          '<div style="font-size:0.78rem;color:var(--muted)">Submit your space requirement — booked stalls will appear here once the organiser confirms your space.</div></div>' +
          '<a class="btn btn-primary btn-sm" href="#/space-requirement">Submit Requirement</a>' +
        '</div></div>';

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
  const actionsCard = actions.length
    ? '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Pending Actions</h2>' +
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
      feat('#/space-requirement', 'fc-blue', 'view_comfy_alt', 'Space Booking',
        S.spaceRequirements.length + ' requirement(s) · ' + S.stalls.length + ' stall(s) booked') +
      feat('#/aircraft', 'fc-cyan', 'flight', 'Aircraft Registration',
        aircraft.length + ' application(s)') +
      feat('#/orders', 'fc-orange', 'receipt_long', 'My Orders',
        S.orders.length + ' order(s) · ' + money(paidInr) + ' paid') +
      feat('#/passes/badges', 'fc-green', 'badge', 'Badges',
        passesUsed + ' of ' + quotaTotal + ' passes used') +
      feat('#/co-exhibitors', 'fc-teal', 'group_add', 'Co-Exhibitor',
        S.coexhibitors.length + ' added' + (coexPending ? ' · ' + coexPending + ' payment pending' : '')) +
      soon('fc-purple', 'assignment', 'Exhibition Forms') +
      soon('fc-pink', 'meeting_room', 'Conference Halls') +
      soon('fc-amber', 'handshake', 'B2B Table') +
      feat('#/products', 'fc-red', 'inventory_2', 'Products',
        ((S.profile && S.profile.business.products.length) || 0) + ' product(s) in gallery') +
    '</div>';

  return '<div class="dash-hello"><div>' +
      '<h1 class="page-title">Hi ' + esc(EVENT.exhibitor) + ', let’s get started 👋</h1>' +
      '<p class="page-sub" style="margin-bottom:0">This is a quick summary of your participation. You can access every key section here.</p>' +
    '</div></div>' +
    spaceCard +
    actionsCard +
    '<div class="section-gap"><h2 class="card-title">Quick Access</h2>' + grid + '</div>' +
    footerTools();
}

/* ============================================================
   VIEW · My Orders — the exhibitor's own payment history
   ============================================================ */
const MY_ORDER_TYPE = { coex_reg: 'Co-Exhibitor Registration', vehicle: 'Vehicle Pass', aircraft_reg: 'Aircraft Registration' };

function viewMyOrders() {
  const paidInr = S.orders.filter((o) => o.currency !== 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const paidUsd = S.orders.filter((o) => o.currency === 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const cartTotal = S.cart.reduce((a, i) => a + Number(i.amount || 0), 0);

  const pendingRows = S.cart.map((i) =>
    '<tr><td><span style="color:var(--muted)">—</span></td>' +
    '<td><span class="td-strong">' + esc(MY_ORDER_TYPE[i.type] || i.type) + '</span>' +
      '<span class="td-sub">' + esc(i.label) + (i.sub ? ' · ' + esc(i.sub) : '') + '</span></td>' +
    '<td class="money">' + (i.currency === 'USD' ? '$' + Number(i.amount).toLocaleString('en-US') : money(i.amount)) + '</td>' +
    '<td><span class="pill amber">Pending</span></td>' +
    '<td><button class="btn-link" onclick="openCart()">Pay Now</button></td></tr>').join('');

  const paidRows = S.orders.slice().reverse().map((o) =>
    '<tr><td><span class="regno">' + esc(o.orderNo) + '</span></td>' +
    '<td><span class="td-strong">' + esc(MY_ORDER_TYPE[o.type] || o.type) + '</span>' +
      '<span class="td-sub">' + esc(o.label) + (o.sub ? ' · ' + esc(o.sub) : '') + '</span></td>' +
    '<td class="money">' + (o.currency === 'USD' ? '$' + Number(o.amount).toLocaleString('en-US') : money(o.amount)) + '</td>' +
    '<td><span class="pill green">Success</span></td>' +
    '<td>' + esc(o.paidAt) + '</td></tr>').join('');

  const rows = (pendingRows + paidRows) ||
    '<tr><td colspan="5" style="color:var(--muted)">No orders yet — payments you make from the cart will appear here.</td></tr>';

  return '<h1 class="page-title">My Orders</h1>' +
    '<p class="page-sub">All your payments — co-exhibitor registrations, vehicle passes and aircraft registration fees.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Orders</div><div class="t-value">' + S.orders.length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Total Paid</div><div class="t-value">' + money(paidInr) +
        (paidUsd ? ' <small style="font-size:0.65em">+ $' + paidUsd.toLocaleString('en-US') + '</small>' : '') + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending in Cart</div><div class="t-value">' + S.cart.length +
        (cartTotal ? '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> · ' + money(cartTotal) + '</span>' : '') + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Order History</h2>' +
      (S.cart.length ? '<button class="btn btn-primary btn-sm" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Pay Pending (' + S.cart.length + ')</button>' : '') +
    '</div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Order No.</th><th>Order Type / Item</th><th>Amount</th><th>Payment Status</th><th>Paid At</th></tr>' +
    rows + '</table></div></div>' +
    footerTools();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#/dashboard';
  render();
});
