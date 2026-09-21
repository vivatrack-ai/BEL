/* ============================================================
   Evenuefy — Co-Exhibitor Portal
   Login for companies the main exhibitor (HAL) registered as
   co-exhibitors. Each co-exhibitor sees ONLY what is assigned
   to it: its registration profile, allocated stall space and
   pass quotas — and can fill passes against those quotas.
   Business rules (same as the main app):
     · Subsidiary — profile only; NOT entitled to passes & services
     · Separate  — stall space & pass quotas unlock only after the
       ₹40,000 registration payment is completed by the main exhibitor
   Reads/writes the exhibitor app's state (same-origin localStorage);
   in production this is the co-exhibitor API with role-based access.
   ============================================================ */

'use strict';

const SESSION_KEY = 'evenuefy_coexlogin_session';
const EX_LS_KEY = 'evenuefy_coex_module_v1';
const MAIN_EXHIBITOR = 'Hindustan Aeronautics Limited (HAL)';
const EVENT_DAYS = ['11 Feb 2027', '12 Feb 2027', '13 Feb 2027'];

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const nowStr = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const VEHNO_RE = /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}$/i;

function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

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

function setErr(id, msg) {
  const f = $(id).closest('.field');
  if (!f) return;
  f.classList.add('invalid');
  const e = f.querySelector('.error');
  if (e) e.textContent = msg;
}
function clearErrs() {
  document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
}

function loadExState() {
  try { const raw = localStorage.getItem(EX_LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveExState(st) {
  try { localStorage.setItem(EX_LS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
}
function uidEx(st, k) { st.seq[k] += 1; return k + '_' + st.seq[k]; }

/* ---------------- session / login ---------------- */
function currentCoex() {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const ex = loadExState();
    return ex ? (ex.coexhibitors || []).find((c) => c.id === id) || null : null;
  } catch (e) { return null; }
}

/* LOGIN RULE: only Separate co-exhibitors whose registration payment is
   complete get a working login. Subsidiary companies have no login. */
function loginEligible(ex) {
  return (ex && ex.coexhibitors || []).filter((c) => c.type === 'separate' && c.status === 'active');
}

function fillLoginOptions() {
  const ex = loadExState();
  const list = loginEligible(ex);
  const sel = $('lgCoex');
  if (!sel) return;
  if (!list.length) {
    $('noCoexNote').style.display = '';
    $('loginForm').style.display = 'none';
    return;
  }
  $('noCoexNote').style.display = 'none';
  $('loginForm').style.display = '';
  sel.innerHTML = list.map((c) =>
    '<option value="' + c.id + '">' + esc(c.company) + '</option>').join('');
  syncLoginEmail();
}
function syncLoginEmail() {
  const ex = loadExState();
  const c = ex ? (ex.coexhibitors || []).find((x) => x.id === $('lgCoex').value) : null;
  $('lgEmail').value = c ? c.email : '';
}

function coexLogin(e) {
  e.preventDefault();
  clearErrs();
  if (!$('lgPassword').value) { setErr('lgPassword', 'Password is required'); return false; }
  const id = $('lgCoex').value;
  if (!id) return false;
  // Guard: login works only for paid Separate co-exhibitors
  if (!loginEligible(loadExState()).some((c) => c.id === id)) {
    toast('Login is enabled only after the registration payment is completed by the main exhibitor.', 'error');
    return false;
  }
  try { sessionStorage.setItem(SESSION_KEY, id); } catch (err) { /* ignore */ }
  enterApp();
  const c = currentCoex();
  toast('Logged in as ' + (c ? c.company : 'co-exhibitor'), 'success');
  return false;
}

function coexLogout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  location.hash = '';
  $('appShell').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  document.title = 'Co-Exhibitor · Evenuefy';
  fillLoginOptions();
}

/* A co-exhibitor gets stall space & passes only when it is a Separate
   company whose registration payment is complete. */
const entitled = (c) => c.type === 'separate' && c.status === 'active';

function enterApp() {
  const c = currentCoex();
  if (!c || !entitled(c)) { coexLogout(); return; }
  $('loginScreen').style.display = 'none';
  $('appShell').style.display = 'flex';
  $('chipCoex').textContent = c.company;
  $('navCompanyName').textContent = c.company;
  // Stall & pass navigation only for entitled (Separate + paid) companies
  const show = entitled(c) ? '' : 'none';
  $('navStall').style.display = show;
  $('navPassLabel').style.display = show;
  $('navPassGroup').style.display = show;
  document.title = c.company + ' · Co-Exhibitor · Evenuefy';
  if (!location.hash || (!entitled(c) && location.hash !== '#/dashboard')) location.hash = '#/dashboard';
  render();
}

/* ---------------- shared quota math (mirror of app.js) ---------------- */
function quotaFor(ex, coexId, catId) {
  const q = (ex.quotas || []).find((x) => x.coexId === coexId && x.catId === catId);
  return q ? q.quota : 0;
}
function quotaUsed(ex, coexId, catId) {
  return (ex.passes || []).filter((p) => p.catId === catId && p.coexId === coexId).length;
}
function myCats(ex, c, kind) {
  return (ex.categories || []).filter((cat) => cat.kind === kind && quotaFor(ex, c.id, cat.id) > 0);
}

/* ============================================================
   ROUTER
   ============================================================ */
function render() {
  const c = currentCoex();
  if (!c) return;
  const route = location.hash.replace(/^#\//, '') || 'dashboard';
  let html = '';
  if (route === 'stall' && entitled(c)) html = viewStall();
  else if (route === 'badges' && entitled(c)) html = viewPasses('badge');
  else if (route === 'invitee' && entitled(c)) html = viewPasses('invitee');
  else if (route === 'vehicle' && entitled(c)) html = viewPasses('vehicle');
  else html = viewDashboard();
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const r = el.getAttribute('data-route');
    el.classList.toggle('active', route === r || (r === 'dashboard' && ['stall', 'badges', 'invitee', 'vehicle'].indexOf(route) < 0));
  });
  $('view').innerHTML = html;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
// Live-refresh when the main exhibitor (another tab) assigns stall/quota or pays
window.addEventListener('storage', (e) => {
  if (e.key !== EX_LS_KEY) return;
  if (currentCoex()) enterApp();
  else fillLoginOptions();
});

/* ============================================================
   VIEW · Dashboard — registration profile + assignment summary
   ============================================================ */
function statusPill(c) {
  if (c.status === 'active') return '<span class="pill green">Active</span>';
  return '<span class="pill amber">Registration Payment Pending</span>';
}

function viewDashboard() {
  const ex = loadExState();
  const c = currentCoex();
  const allocs = (ex.allocations || []).filter((a) => a.coexId === c.id);
  const totalSqm = allocs.reduce((a, x) => a + (x.sqm || 0), 0);
  const totalQuota = (ex.quotas || []).filter((q) => q.coexId === c.id).reduce((a, q) => a + q.quota, 0);
  const totalPasses = (ex.passes || []).filter((p) => p.coexId === c.id).length;

  let note = '';
  if (c.type === 'subsidiary') {
    note = '<div class="note"><b class="title">Subsidiary company</b>' +
      'As a Subsidiary of ' + esc(MAIN_EXHIBITOR) + ', this login can view and maintain the company profile. ' +
      'Subsidiary companies are <b>not entitled</b> to separate stall space, passes &amp; services.</div>';
  } else if (c.status !== 'active') {
    note = '<div class="note amber"><b class="title">Registration payment pending</b>' +
      'Your ' + money(40000) + ' registration fee has not been paid yet by the main exhibitor. ' +
      'Stall space &amp; pass quotas unlock automatically once ' + esc(MAIN_EXHIBITOR) + ' completes the payment from its cart.</div>';
  } else if (totalSqm === 0 && totalQuota === 0) {
    note = '<div class="note"><b class="title">Nothing assigned yet</b>' +
      'Your registration is active, but the main exhibitor has not allocated stall space or pass quotas yet. ' +
      'They will appear here automatically once assigned.</div>';
  }

  const tiles =
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Company Type</div><div class="t-value" style="font-size:1.15rem">' + (c.type === 'separate' ? 'Separate' : 'Subsidiary') + '</div></div>' +
      '<div class="tile"><div class="t-label">Registration Status</div><div class="t-value" style="font-size:1rem;padding-top:6px">' + statusPill(c) + '</div></div>' +
      (entitled(c)
        ? '<div class="tile accent"><div class="t-label">Allocated Space</div><div class="t-value">' + totalSqm + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>' +
          '<div class="tile"><div class="t-label">Pass Quota / Filled</div><div class="t-value">' + totalQuota + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> / ' + totalPasses + ' filled</span></div></div>'
        : '') +
    '</div>';

  const profile =
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">My Registration</h2>' +
      '<span class="result-count">Registered by ' + esc(MAIN_EXHIBITOR) + ' · ' + esc(c.createdAt || '') + '</span></div>' +
    '<form onsubmit="return saveProfile(event)" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Company Name</label><input type="text" value="' + esc(c.company) + '" readonly><div class="hint">Set at registration — contact the organiser to change.</div></div>' +
      '<div class="field"><label>Registration Number</label><input type="text" value="' + esc(c.regNo || '—') + '" readonly></div>' +
      '<div class="field"><label>Login Email</label><input type="email" value="' + esc(c.email) + '" readonly><div class="hint">This is your login identity.</div></div>' +
      '<div class="field"><label>Company Type</label><input type="text" value="' + (c.type === 'separate' ? 'Separate Company' : 'Subsidiary Company') + '" readonly></div>' +
      '<div class="field"><label>Nodal Person — First Name <span class="req">*</span></label><input type="text" id="pfFirst" value="' + esc(c.nodalFirst || '') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Nodal Person — Last Name <span class="req">*</span></label><input type="text" id="pfLast" value="' + esc(c.nodalLast || '') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Nodal Contact Number</label><input type="tel" id="pfMobile" value="' + esc(c.nodalMobile || '') + '" placeholder="10-digit mobile"><div class="error"></div></div>' +
      '<div class="field"><label>Designation</label><input type="text" id="pfDesig" value="' + esc(c.nodalDesig || '') + '" placeholder="e.g. Marketing Head"></div>' +
    '</div>' +
    '<div style="margin-top:16px;display:flex;justify-content:flex-end">' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">save</span>Save Profile</button>' +
    '</div></form></div>';

  return '<h1 class="page-title">Co-Exhibitor Dashboard</h1>' +
    '<p class="page-sub">Welcome, <b>' + esc(c.company) + '</b> — co-exhibitor of ' + esc(MAIN_EXHIBITOR) + '.</p>' +
    tiles + note + profile;
}

function saveProfile(e) {
  e.preventDefault();
  clearErrs();
  const first = $('pfFirst').value.trim();
  const last = $('pfLast').value.trim();
  const mobile = $('pfMobile').value.trim();
  let ok = true;
  if (!first) { setErr('pfFirst', 'First name is required'); ok = false; }
  if (!last) { setErr('pfLast', 'Last name is required'); ok = false; }
  if (mobile && !MOBILE_RE.test(mobile)) { setErr('pfMobile', 'Enter a valid 10-digit mobile number'); ok = false; }
  if (!ok) return false;
  const ex = loadExState();
  const c = (ex.coexhibitors || []).find((x) => x.id === sessionStorage.getItem(SESSION_KEY));
  if (!c) return false;
  c.nodalFirst = first; c.nodalLast = last;
  c.nodalMobile = mobile; c.nodalDesig = $('pfDesig').value.trim();
  saveExState(ex);
  render();
  toast('Profile updated', 'success');
  return false;
}

/* ============================================================
   VIEW · My Stall Space (read-only — allotted by main exhibitor)
   ============================================================ */
function viewStall() {
  const ex = loadExState();
  const c = currentCoex();
  const allocs = (ex.allocations || []).filter((a) => a.coexId === c.id);
  const stallById = (id) => (ex.stalls || []).find((s) => s.id === id) || {};
  const totalSqm = allocs.reduce((a, x) => a + (x.sqm || 0), 0);

  const rows = allocs.map((a, i) => {
    const st = stallById(a.stallId);
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(st.hall || '—') + '</td>' +
      '<td><span class="regno">' + esc(st.stall || '—') + '</span></td>' +
      '<td class="num">' + a.sqm + ' sqm</td></tr>';
  }).join('') ||
    '<tr><td colspan="4" style="color:var(--muted)">No stall space allocated yet — the main exhibitor allocates it from its portal.</td></tr>';

  return '<h1 class="page-title">My Stall Space</h1>' +
    '<p class="page-sub">Space allotted to you by ' + esc(MAIN_EXHIBITOR) + ' from its booked stalls. Allocation is managed by the main exhibitor.</p>' +
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
const KIND_TITLE = { badge: 'Badge Details', invitee: 'Invitee Details', vehicle: 'Vehicle Pass Details' };
const KIND_SUB = {
  badge: 'Badge quota assigned to you by the main exhibitor. Register your team members against the quota.',
  invitee: 'Invitee pass quota assigned to you. Registration is date-wise for each event day.',
  vehicle: 'Vehicle pass quota assigned to you. Register driver & vehicle details against the quota.',
};

function viewPasses(kind) {
  const ex = loadExState();
  const c = currentCoex();
  const cats = myCats(ex, c, kind);

  if (!cats.length) {
    return '<h1 class="page-title">' + KIND_TITLE[kind] + '</h1>' +
      '<p class="page-sub">' + KIND_SUB[kind] + '</p>' +
      '<div class="card"><div class="empty"><span class="material-symbols-outlined">' +
      (kind === 'vehicle' ? 'directions_car' : kind === 'invitee' ? 'mail' : 'badge') + '</span>' +
      '<h3>No quota assigned</h3><p>' + esc(MAIN_EXHIBITOR) + ' has not assigned you any ' +
      (kind === 'vehicle' ? 'vehicle pass' : kind === 'invitee' ? 'invitee' : 'badge') +
      ' quota yet. It will appear here automatically once assigned.</p></div></div>';
  }

  const quotaRows = cats.map((cat, i) => {
    const q = quotaFor(ex, c.id, cat.id);
    const used = quotaUsed(ex, c.id, cat.id);
    const bal = q - used;
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(cat.name) + '</td>' +
      '<td class="num">' + q + '</td><td class="num">' + used + '</td><td class="num">' + bal + '</td>' +
      '<td class="td-actions"><button class="btn btn-outline btn-sm" onclick="openPassForm(\'' + cat.id + '\')"' + (bal <= 0 ? ' disabled' : '') + '>' +
        '<span class="material-symbols-outlined" style="font-size:16px">add</span>Add</button></td></tr>';
  }).join('');

  const myPasses = (ex.passes || []).filter((p) => p.coexId === c.id &&
    cats.some((cat) => cat.id === p.catId));
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
      (kind === 'invitee' ? '<th>Event Dates</th>' : '') + '<th>Category</th><th>Created</th></tr>';
    passRows = myPasses.map((p, i) =>
      '<tr><td>' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc(p.data.firstName + ' ' + p.data.lastName) + '</td>' +
      '<td class="contact-cell">' + esc(p.data.email) + '<br><span class="ph">' + esc(p.data.mobile || '') + '</span></td>' +
      '<td>' + esc(p.data.designation || '—') + '</td>' +
      (kind === 'invitee' ? '<td>' + esc((p.data.dates || []).join(', ')) + '</td>' : '') +
      '<td>' + esc(catName(p.catId)) + '</td>' +
      '<td>' + esc(p.createdAt) + '</td></tr>').join('');
  }
  passRows = passRows || '<tr><td colspan="7" style="color:var(--muted)">No passes filled yet — use the Add button above to register against your quota.</td></tr>';

  return '<h1 class="page-title">' + KIND_TITLE[kind] + '</h1>' +
    '<p class="page-sub">' + KIND_SUB[kind] + '</p>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">My Quota</h2>' +
      '<button class="btn btn-outline btn-sm" onclick="render()"><span class="material-symbols-outlined" style="font-size:16px">refresh</span>Refresh</button></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Category Name</th><th>Quota Assigned</th><th>Filled</th><th>Balance</th><th>Action</th></tr>' +
    quotaRows + '</table></div></div>' +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Listing View</h2></div>' +
    '<div class="tablewrap"><table class="grid">' + passHead + passRows + '</table></div></div>';
}

/* ---------------- Add pass (badge / invitee / vehicle) ---------------- */
function toggleDay(i) {
  const cb = $('day' + i);
  cb.checked = !cb.checked;
  $('dayChk' + i).classList.toggle('selected', cb.checked);
}

function openPassForm(catId) {
  const ex = loadExState();
  const c = currentCoex();
  const cat = (ex.categories || []).find((x) => x.id === catId);
  if (!cat) return;
  const bal = quotaFor(ex, c.id, catId) - quotaUsed(ex, c.id, catId);
  if (bal <= 0) { toast('No quota balance left in this category.', 'error'); return; }

  const balNote = '<div class="note" style="margin-top:0"><b class="title">' + esc(cat.name) + '</b>' +
    'Balance quota: <b>' + bal + '</b>. This pass will consume your assigned quota.</div>';

  if (cat.kind === 'vehicle') {
    openModal('Add Vehicle Pass — ' + esc(cat.name),
      balNote +
      '<form id="vForm" onsubmit="return saveVehiclePass(event, \'' + catId + '\')" novalidate>' +
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

  const dateChecks = cat.kind === 'invitee'
    ? '<div class="field full"><label>Event Date Selection <span class="req">*</span></label>' +
      '<div class="checks">' + EVENT_DAYS.map((d, i) =>
        '<label class="check-item" id="dayChk' + i + '" onclick="toggleDay(' + i + ')"><input type="checkbox" id="day' + i + '" value="' + d + '">' + d + '</label>').join('') +
      '</div><div class="error" id="dayErr" style="display:none;color:var(--red);font-size:0.75rem;font-weight:600;margin-top:4px">Select at least one event date</div></div>'
    : '';

  openModal('Add ' + (cat.kind === 'invitee' ? 'Invitee' : 'Badge') + ' — ' + esc(cat.name),
    balNote +
    '<form id="pForm" onsubmit="return saveBadgePass(event, \'' + catId + '\')" novalidate>' +
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

function saveBadgePass(e, catId) {
  e.preventDefault();
  clearErrs();
  const ex = loadExState();
  const c = currentCoex();
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
    days = EVENT_DAYS.filter((d, i) => $('day' + i).checked);
    if (!days.length) { $('dayErr').style.display = 'block'; ok = false; }
  }
  if (!ok) return false;
  if (quotaFor(ex, c.id, catId) - quotaUsed(ex, c.id, catId) <= 0) {
    toast('No quota balance left in this category.', 'error'); return false;
  }
  ex.passes.push({
    id: uidEx(ex, 'pass'), catId: catId, coexId: c.id,
    data: { firstName: first, lastName: last, email: email, mobile: mobile, designation: $('pDesig').value.trim(), dates: days },
    status: 'issued', amount: 0, createdAt: nowStr(),
  });
  saveExState(ex);
  closeModal(); render();
  toast('Pass saved for ' + first + ' ' + last, 'success');
  return false;
}

function saveVehiclePass(e, catId) {
  e.preventDefault();
  clearErrs();
  const ex = loadExState();
  const c = currentCoex();
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
  if (quotaFor(ex, c.id, catId) - quotaUsed(ex, c.id, catId) <= 0) {
    toast('No quota balance left in this category.', 'error'); return false;
  }
  ex.passes.push({
    id: uidEx(ex, 'pass'), catId: catId, coexId: c.id,
    data: {
      driverName: name, driverMobile: mobile, vehicleNo: vehNo.toUpperCase(),
      dlNumber: dlNo, dlFile: dlFile.name, seater: $('vSeater').value, company: c.company,
    },
    status: 'issued', amount: 0, createdAt: nowStr(),
  });
  saveExState(ex);
  closeModal(); render();
  toast('Vehicle pass saved for ' + name, 'success');
  return false;
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const sel = $('lgCoex');
  if (sel) sel.addEventListener('change', syncLoginEmail);
  fillLoginOptions();
  if (currentCoex()) enterApp();
});
