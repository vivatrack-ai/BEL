/* ============================================================
   Evenuefy — Committee Portal · Aircraft Approvals
   Two separate committee logins:
     · Static Display Committee — sees & approves ONLY Static Display applications
     · Flying Display Committee — sees & approves ONLY Flying Display applications
   The Organiser Admin (admin.html) continues to see both.
   Reads/writes the exhibitor portal's state (same-origin localStorage);
   in production this is the applications API with role-based access.
   ============================================================ */

'use strict';

/* payment: Static Display registrations carry a weight-based fee, so only the
   Static committee sees fee/payment columns and the Orders page. Flying Display
   has no fee — its committee gets NO payment-related UI at all. */
const COMMITTEES = {
  static: { id: 'static', name: 'Static Display Committee', category: 'Static Display', email: 'static.committee@aeroindia.in', payment: true },
  flying: { id: 'flying', name: 'Flying Display Committee', category: 'Flying Display', email: 'flying.committee@aeroindia.in', payment: false },
};
const SESSION_KEY = 'evenuefy_committee_session';
const EX_LS_KEY = 'evenuefy_coex_module_v1';
const EX_COMPANY = 'Hindustan Aeronautics Limited (HAL)';

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const nowStr = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

function loadExState() {
  try { const raw = localStorage.getItem(EX_LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveExState(st) {
  try { localStorage.setItem(EX_LS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
}

/* ---------------- session / login ---------------- */
function currentCommittee() {
  try { const id = sessionStorage.getItem(SESSION_KEY); return id ? COMMITTEES[id] : null; }
  catch (e) { return null; }
}

function committeeLogin(e) {
  e.preventDefault();
  const id = $('lgCommittee').value;
  const email = $('lgEmail').value.trim();
  const pwd = $('lgPassword').value;
  let ok = true;
  const setErr = (elId, msg) => {
    const f = $(elId).closest('.field');
    f.classList.add('invalid');
    f.querySelector('.error').textContent = msg;
  };
  document.querySelectorAll('#loginForm .field.invalid').forEach((f) => f.classList.remove('invalid'));
  if (!email) { setErr('lgEmail', 'Email is required'); ok = false; }
  if (!pwd) { setErr('lgPassword', 'Password is required'); ok = false; }
  if (!ok) return false;
  try { sessionStorage.setItem(SESSION_KEY, id); } catch (err) { /* ignore */ }
  enterApp();
  toast('Logged in as ' + COMMITTEES[id].name, 'success');
  return false;
}

function committeeLogout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  location.hash = '';
  $('appShell').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  document.title = 'Committee · Aircraft Approvals · Evenuefy';
}

function enterApp() {
  const c = currentCommittee();
  if (!c) return;
  $('loginScreen').style.display = 'none';
  $('appShell').style.display = 'flex';
  $('chipCommittee').textContent = c.name;
  $('navCommitteeName').textContent = c.name;
  // Orders (payment ledger) exists only in the Static Display Committee login
  $('navOrders').style.display = c.payment ? '' : 'none';
  document.title = c.name + ' · Aircraft Approvals · Evenuefy';
  if (!location.hash || (!c.payment && location.hash === '#/orders')) location.hash = '#/approvals';
  render();
}

/* ---------------- shared pills / formatting ---------------- */
const acFmtFee = (a) => a.price == null ? '—'
  : (a.feeCurrency === 'USD' ? '$' + Number(a.price).toLocaleString('en-US') : money(a.price));

function acStatusPill(s) {
  const map = {
    draft: ['gray', 'Draft'], submitted: ['amber', 'Pending Approval'],
    approved: ['green', 'Approved'], registered: ['green', 'Approved'],
    rejected: ['red', 'Rejected'],
  };
  const m = map[s] || ['gray', s];
  return '<span class="pill ' + m[0] + '">' + m[1] + '</span>';
}
function acPayPill(a) {
  if (a.status === 'registered') return '<span class="pill green">Paid</span>';
  if (a.status === 'approved') {
    return a.price != null ? '<span class="pill amber">Payment Pending</span>' : '<span class="pill gray">No Fee</span>';
  }
  return '<span style="color:var(--muted)">—</span>';
}
const formsDone = (a) =>
  '<span class="pill green">Form 1 ✓</span> ' +
  ['air7a', 'air4', 'air7b'].map((f) => {
    const labels = { air7a: 'Air-7A', air4: 'Air-4', air7b: '7B & 9' };
    return a[f] ? '<span class="pill green">' + labels[f] + ' ✓</span>' : '<span class="pill amber">' + labels[f] + ' —</span>';
  }).join(' ');

/* ---------------- Export to Excel (.xlsx via SheetJS; CSV fallback) ----------------
   Multi-sheet: sheets = [{ name, headers, rows }] — one tab per form so the
   export carries the FULL application data, not just statuses. */
function exportWorkbook(filename, sheets) {
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => {
      const ws = XLSX.utils.aoa_to_sheet([s.headers].concat(s.rows));
      ws['!cols'] = s.headers.map((h, i) => ({
        wch: Math.min(50, Math.max(String(h).length + 2, 10,
          ...s.rows.map((r) => String(r[i] == null ? '' : r[i]).length + 2))),
      }));
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename + '.xlsx');
  } else {
    const s = sheets[0]; // CSV can hold one sheet — fall back to the summary
    const csv = [s.headers].concat(s.rows)
      .map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '.csv';
    a.click();
  }
  toast('Export downloaded: ' + filename, 'success');
}
const exportStamp = () => new Date().toISOString().slice(0, 10);

/* ---------------- Date-range filtering (shared) ---------------- */
function parseTs(s) {
  if (!s) return null;
  const d = new Date(String(s).replace('Sept', 'Sep').replace(',', ''));
  return isNaN(d.getTime()) ? null : d;
}
function inDateRange(s, from, to) {
  if (!from && !to) return true;
  const d = parseTs(s);
  if (!d) return false;
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}
const dateInputStyle = 'border:1px solid #CFD7E4;border-radius:8px;padding:6px 10px;font-family:inherit;font-size:0.83rem;background:var(--card);color:var(--ink)';
/* Compact filter controls that sit in the table-card header, on the same
   row as the Export to Excel button (no separate filter card). */
function toolbarSel(options, active, fn, allLabel) {
  return '<select onchange="' + fn + '(this.value)" style="' + dateInputStyle + ';cursor:pointer">' +
    '<option value="">' + allLabel + '</option>' +
    options.map(([v, l]) =>
      '<option value="' + v + '"' + (active === v ? ' selected' : '') + '>' + l + '</option>').join('') +
    '</select>';
}
function toolbarDates(from, to, fromFn, toFn) {
  return '<input type="date" value="' + esc(from) + '" onchange="' + fromFn + '(this.value)" title="From date" style="' + dateInputStyle + '">' +
    '<span style="font-size:0.78rem;color:var(--muted)">to</span>' +
    '<input type="date" value="' + esc(to) + '" onchange="' + toFn + '(this.value)" title="To date" style="' + dateInputStyle + '">';
}

/* Date filter as ONE dropdown (Today / Yesterday / Last 7 Days / Custom).
   The From–To inputs appear only when Custom Range is selected. */
const DATE_PRESET_OPTS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['custom', 'Custom Range']];
function presetRange(mode) {
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t = new Date();
  if (mode === 'today') return { from: iso(t), to: iso(t) };
  if (mode === 'yesterday') { const y = new Date(t.getTime() - 864e5); return { from: iso(y), to: iso(y) }; }
  if (mode === 'week') { const w = new Date(t.getTime() - 6 * 864e5); return { from: iso(w), to: iso(t) }; }
  return { from: '', to: '' };
}
function dateFilterRange(F) { return F.dateMode === 'custom' ? { from: F.from, to: F.to } : presetRange(F.dateMode); }
function toolbarDateSel(F, modeFn, fromFn, toFn) {
  return '<select onchange="' + modeFn + '(this.value)" style="' + dateInputStyle + ';cursor:pointer">' +
    '<option value="">Date: All</option>' +
    DATE_PRESET_OPTS.map(([v, l]) =>
      '<option value="' + v + '"' + (F.dateMode === v ? ' selected' : '') + '>' + l + '</option>').join('') +
    '</select>' +
    (F.dateMode === 'custom' ? toolbarDates(F.from, F.to, fromFn, toFn) : '');
}

/* Applications visible to the logged-in committee: ONLY its category */
function committeeApps() {
  const c = currentCommittee();
  const ex = loadExState();
  const list = (ex && ex.aircraft) ? ex.aircraft : [];
  return list.filter((a) => a.displayType === c.category);
}

/* ---------------- Approvals filters (status · payment [static only] · date) ---------------- */
const CF = { status: null, pay: null, dateMode: '', from: '', to: '' };
function cfSetStatus(v) { CF.status = v || null; render(); }
function cfSetPay(v) { CF.pay = v || null; render(); }
function cfSetDateMode(v) { CF.dateMode = v; if (v !== 'custom') { CF.from = ''; CF.to = ''; } render(); }
function cfSetFrom(v) { CF.from = v; render(); }
function cfSetTo(v) { CF.to = v; render(); }
function cfClear() { CF.status = null; CF.pay = null; CF.dateMode = ''; CF.from = ''; CF.to = ''; render(); }

const APP_STATUS_CHIPS = [['draft', 'Draft'], ['submitted', 'Pending Approval'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const PAY_CHIPS = [['success', 'Success'], ['pending', 'Pending'], ['failed', 'Failed']];
const appStatusKey = (a) => (a.status === 'registered' ? 'approved' : a.status);
const payKey = (a) => a.status === 'registered' ? 'success'
  : (a.status === 'approved' && a.price != null ? 'pending' : (a.paymentFailed ? 'failed' : '-'));

function filteredCommitteeApps() {
  const c = currentCommittee();
  let list = committeeApps();
  if (CF.status) list = list.filter((a) => appStatusKey(a) === CF.status);
  if (c.payment && CF.pay) list = list.filter((a) => payKey(a) === CF.pay);
  const r = dateFilterRange(CF);
  list = list.filter((a) => inDateRange(a.submittedForApprovalAt || a.createdAt, r.from, r.to));
  return list;
}

/* Full-form sheets so the export carries EVERYTHING the exhibitor filled */
function aircraftFormSheets(list) {
  return [
    {
      name: 'Air-7A',
      headers: ['Application No', 'Model', 'Aircraft Type', 'Last Intermediate Landing', 'Date & ETA at Airbase',
        'Departure Date & Time', 'Airfield of Departure', 'First Landing in India', 'Saved At'],
      rows: list.filter((a) => a.air7a).map((a) => {
        const d = a.air7a;
        return [a.appNo, a.model, d.aircraftType, d.lastLanding, d.eta, d.departure, d.depAirfield, d.firstLanding, d.savedAt];
      }),
    },
    {
      name: 'Air-4',
      headers: ['Application No', 'Model', 'Rolls Allowed', 'Roll Types', 'Manoeuvres File', 'Certificate Type',
        'Issued By', 'Stated Restrictions', 'Certificate No', 'Valid Upto', 'Call Sign', 'Endurance',
        'Air Display Manoeuvres', 'Fine Weather Desc', 'Fine Min Cloud Base', 'Fine Min Visibility',
        'Bad Weather Desc', 'Bad Min Cloud Base', 'Bad Min Visibility', 'Saved At'],
      rows: list.filter((a) => a.air4).map((a) => {
        const d = a.air4;
        return [a.appNo, a.model, d.rollsAllowed, (d.rollTypes || []).join(', '), d.manoeuvresFile, d.certType,
          d.issuedBy, d.restrictions, d.certNo, d.validUpto, d.callSign,
          (d.endHrs || 0) + ' Hrs ' + (d.endMin || 0) + ' Min',
          (d.manoeuvres || []).join(', '), d.fineDesc, d.fineBase, d.fineVis, d.badDesc, d.badBase, d.badVis, d.savedAt];
      }),
    },
    {
      name: 'AIR 7B & 9',
      headers: ['Application No', 'Model', 'Purpose of Flights', 'Overfly-Technical-Traffic', 'ATS Routes', 'Route Itinerary',
        'Timings in India', 'Airport Last Departure-First Landing', 'Type', 'State of Registry', 'Telephony Designator',
        'Air-Dropping', 'Seats > 30', 'Payload > 3t', 'ACAS-II-TCAS-II', 'Noise Certificate',
        'Pilot Name', 'Pilot Nationality', 'Operator Name', 'Operator Nationality', 'Address',
        'Permit No', 'Crew', 'Passengers', 'Goods Carried', 'Danger Permit File', 'Special Permit File',
        'Uplift', 'Crew (Uplift)', 'Address 2', 'Agent Name', 'Agent Address', 'Saved At'],
      rows: list.filter((a) => a.air7b).map((a) => {
        const d = a.air7b;
        return [a.appNo, a.model, d.purpose, d.overfly, d.atsRoutes, d.itinerary, d.timings, d.lastAirport,
          d.type, d.stateOfRegistry, d.telephony, d.airdrop, d.seats30, d.payload3t, d.acas, d.noiseCert,
          d.pilotName, d.pilotNat, d.operatorName, d.operatorNat, d.address, d.permitNo, d.crew, d.passengers,
          d.goods, d.dangerPermitFile, d.specialPermitFile, d.uplift, d.crew2, d.address2, d.agentName, d.agentAddr, d.savedAt];
      }),
    },
  ];
}

/* Export THIS committee's applications (its own category, respecting the
   active filters) — full data across one summary sheet + one sheet per form.
   Fee/payment columns only appear in the Static committee's export. */
function exportCommitteeApps() {
  const c = currentCommittee();
  const list = filteredCommitteeApps();
  if (!list.length) { toast('No ' + c.category + ' applications to export.', 'error'); return; }
  const statusLabel = { draft: 'Draft', submitted: 'Pending Approval', approved: 'Approved', registered: 'Approved', rejected: 'Rejected' };
  const payLabel = (a) => a.status === 'registered' ? 'Paid'
    : a.status === 'approved' ? (a.price != null ? 'Payment Pending' : 'No Fee') : '-';
  const headers = ['Sr.', 'Application No', 'Exhibitor', 'Model', 'Make', 'Usage', 'Type of Display',
    'Weight (kg)', 'Aircraft Reg No', 'Year of Registration', 'Registered With Organisation', 'Manufacturing Year', 'Aircraft Image']
    .concat(c.payment ? ['Fee', 'Currency'] : [])
    .concat(['Air-7A Filled', 'Air-4 Filled', '7B & 9 Filled', 'Application Status'])
    .concat(c.payment ? ['Payment Status'] : [])
    .concat(['Created At', 'Submitted At', 'Approved By', 'Remark']);
  const rows = list.map((a, i) =>
    [i + 1, a.appNo || '-', EX_COMPANY, a.model, a.make, a.usage, a.displayType,
      a.weight, a.regNo, a.yearOfReg || '-', a.regWithOrg || '-', a.mfgYear || '-', a.imageName || '-']
      .concat(c.payment ? [a.price != null ? a.price : '-', a.feeCurrency || '-'] : [])
      .concat([a.air7a ? 'Yes' : 'No', a.air4 ? 'Yes' : 'No', a.air7b ? 'Yes' : 'No', statusLabel[a.status] || a.status])
      .concat(c.payment ? [payLabel(a)] : [])
      .concat([a.createdAt || '-', a.submittedForApprovalAt || '-', a.approvedBy || '-', a.remark || '-']));
  exportWorkbook(c.category.replace(/\s+/g, '-') + '-Applications-' + exportStamp(),
    [{ name: 'Applications', headers: headers, rows: rows }].concat(aircraftFormSheets(list)));
}

/* ============================================================
   ROUTER
   ============================================================ */
function render() {
  const c = currentCommittee();
  if (!c) return;
  const route = location.hash.replace(/^#\//, '') || 'approvals';
  let html = '';
  const mDetail = route.match(/^application\/(.+)$/);
  if (mDetail) html = viewApplication(mDetail[1]);
  else if (route === 'orders' && c.payment) html = viewCommitteeOrders();
  else html = viewApprovals();
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const r = el.getAttribute('data-route');
    el.classList.toggle('active', route === r || (r === 'approvals' && (!!mDetail || (route === 'orders' && !c.payment))));
  });
  $('view').innerHTML = html;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
// Live-refresh when the exhibitor (another tab) submits a new application
window.addEventListener('storage', (e) => { if (e.key === EX_LS_KEY && currentCommittee()) render(); });

/* ============================================================
   VIEW · Aircraft Approvals (category-filtered)
   ============================================================ */
function viewApprovals() {
  const c = currentCommittee();
  const all = committeeApps();
  const list = filteredCommitteeApps();
  const counts = {
    total: all.length,
    submitted: all.filter((a) => a.status === 'submitted').length,
    approved: all.filter((a) => a.status === 'approved').length,
    registered: all.filter((a) => a.status === 'registered').length,
    rejected: all.filter((a) => a.status === 'rejected').length,
  };
  const nCols = c.payment ? 7 : 5;

  const rows = list.map((a) =>
    '<tr>' +
    '<td><span class="regno">' + esc(a.appNo || '—') + '</span></td>' +
    '<td><div class="profile-cell"><span class="avatar">' + esc(EX_COMPANY.charAt(0)) + '</span>' +
      '<span><span class="td-strong">' + esc(a.model) + '</span>' +
      '<span class="td-sub">' + esc(EX_COMPANY) + '</span>' +
      '<span class="td-sub">' + esc(a.usage) + ' · ' + esc(a.displayType) + ' · ' + Number(a.weight).toLocaleString('en-IN') + ' kg · <span class="regno">' + esc(a.regNo) + '</span></span></span></div></td>' +
    (c.payment ? '<td class="money">' + acFmtFee(a) + '</td>' : '') +
    '<td style="min-width:170px">' + formsDone(a) + '</td>' +
    '<td>' + acStatusPill(a.status) + (a.status === 'rejected' && a.remark ? '<span class="td-sub" style="color:var(--red)">' + esc(a.remark) + '</span>' : '') + '</td>' +
    (c.payment ? '<td>' + acPayPill(a) + '</td>' : '') +
    '<td class="td-actions">' +
      '<a class="btn-link" href="#/application/' + a.id + '">View</a>' +
      (a.status === 'submitted'
        ? '<button class="btn-link" style="color:var(--green)" onclick="approveApp(\'' + a.id + '\')">Approve</button>' +
          '<button class="btn-link danger" onclick="rejectApp(\'' + a.id + '\')">Reject</button>'
        : '') +
    '</td></tr>').join('') ||
    '<tr><td colspan="' + nCols + '" style="color:var(--muted)">' +
      (all.length ? 'No applications match the selected filters.' : 'No ' + esc(c.category) + ' applications received yet.') +
    '</td></tr>';

  /* Tiles: the Flying committee has no fee, so no payment tiles at all */
  const tiles = c.payment
    ? '<div class="tile blue"><div class="t-label">' + esc(c.category) + ' Applications</div><div class="t-value">' + counts.total + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending Approval</div><div class="t-value">' + counts.submitted + '</div></div>' +
      '<div class="tile"><div class="t-label">Approved · Unpaid</div><div class="t-value">' + counts.approved + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Registered (Paid)</div><div class="t-value">' + counts.registered + '</div></div>' +
      '<div class="tile"><div class="t-label">Rejected</div><div class="t-value">' + counts.rejected + '</div></div>'
    : '<div class="tile blue"><div class="t-label">' + esc(c.category) + ' Applications</div><div class="t-value">' + counts.total + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending Approval</div><div class="t-value">' + counts.submitted + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Approved</div><div class="t-value">' + (counts.approved + counts.registered) + '</div></div>' +
      '<div class="tile"><div class="t-label">Rejected</div><div class="t-value">' + counts.rejected + '</div></div>';

  const hasFilter = CF.status || CF.pay || CF.dateMode;
  const toolbar =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
      '<span class="result-count">' + list.length + ' of ' + all.length + '</span>' +
      toolbarSel(APP_STATUS_CHIPS, CF.status, 'cfSetStatus', 'Application Status: All') +
      (c.payment ? toolbarSel(PAY_CHIPS, CF.pay, 'cfSetPay', 'Payment: All') : '') +
      toolbarDateSel(CF, 'cfSetDateMode', 'cfSetFrom', 'cfSetTo') +
      (hasFilter ? '<button class="btn btn-outline btn-sm" onclick="cfClear()" title="Clear filters"><span class="material-symbols-outlined" style="font-size:16px">filter_alt_off</span>Clear</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="exportCommitteeApps()"' + (list.length ? '' : ' disabled') + '><span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
      '<button class="btn btn-outline btn-sm" onclick="render()" title="Refresh"><span class="material-symbols-outlined" style="font-size:16px">refresh</span></button>' +
    '</div>';

  return '<h1 class="page-title">' + esc(c.name) + ' — Aircraft Approvals</h1>' +
    '<p class="page-sub">This committee can view and approve only <b>' + esc(c.category) + '</b> aircraft applications.' +
    (c.payment ? ' On approval, the registration fee is enabled in the exhibitor’s cart for payment.' : ' Flying Display applications carry no registration fee.') + '</p>' +
    '<div class="tiles">' + tiles + '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Applications</h2>' +
      toolbar + '</div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Application No.</th><th>Aircraft / Exhibitor</th>' + (c.payment ? '<th>Fee</th>' : '') +
    '<th>Forms</th><th>Application Status</th>' + (c.payment ? '<th>Payment Status</th>' : '') + '<th>Action</th></tr>' +
    rows + '</table></div></div>';
}

/* ---------------- approve / reject (recorded with committee name) ---------------- */
function approveApp(id) {
  const c = currentCommittee();
  const ex = loadExState(); if (!ex) return;
  const a = ex.aircraft.find((x) => x.id === id); if (!a) return;
  if (a.displayType !== c.category) { toast('This application belongs to another committee.', 'error'); return; }
  const confirmMsg = c.payment
    ? 'Approve application ' + (a.appNo || '') + ' (' + a.model + ')?\nThe registration fee ' + acFmtFee(a) + ' will be enabled for payment in the exhibitor’s cart.'
    : 'Approve application ' + (a.appNo || '') + ' (' + a.model + ')?';
  if (!confirm(confirmMsg)) return;
  a.status = 'approved';
  a.approvedAt = nowStr();
  a.approvedBy = c.name;
  a.remark = '';
  saveExState(ex);
  render();
  toast('Application ' + (a.appNo || '') + ' approved by ' + c.name + '.', 'success');
}

function rejectApp(id) {
  const c = currentCommittee();
  const ex = loadExState(); if (!ex) return;
  const a = ex.aircraft.find((x) => x.id === id); if (!a) return;
  if (a.displayType !== c.category) { toast('This application belongs to another committee.', 'error'); return; }
  const remark = prompt('Reason for rejection (shown to the exhibitor):', '');
  if (remark === null) return;
  a.status = 'rejected';
  a.remark = remark.trim() || 'Rejected by ' + c.name;
  a.rejectedBy = c.name;
  saveExState(ex);
  render();
  toast('Application ' + (a.appNo || '') + ' rejected.', 'error');
}

/* ============================================================
   VIEW · Application detail (category-guarded)
   ============================================================ */
function kvGrid(pairs) {
  return '<div class="form-grid" style="margin-top:10px">' +
    pairs.filter((p) => p).map((p) => {
      const flags = p[2] || '';
      const val = p[1] != null && String(p[1]).trim() !== ''
        ? (flags.indexOf('html') >= 0 ? p[1] : esc(p[1]))
        : '<span style="color:var(--muted)">—</span>';
      return '<div' + (flags.indexOf('full') >= 0 ? ' class="full"' : '') + '><b>' + p[0] + ':</b> ' + val + '</div>';
    }).join('') +
    '</div>';
}
function formCard(title, savedAt, inner) {
  return '<div class="card section-gap" style="border-left:3px solid var(--blue)">' +
    '<div class="card-head-row"><h2 class="card-title">' + title + '</h2>' +
    (savedAt ? '<span class="result-count">Saved: ' + esc(savedAt) + '</span>' : '') + '</div>' + inner + '</div>';
}
function pendingCard(title) {
  return '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">' + title + '</h2>' +
    '<span class="pill amber">Not filled yet</span></div></div>';
}
function uploadLink(acftId, path, name) {
  if (!name) return '';
  return '<a class="btn-link" style="padding:0" onclick="viewUpload(\'' + acftId + '\',\'' + path + '\')">' +
    esc(name) + ' <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">open_in_new</span></a>';
}

async function viewUpload(acftId, path) {
  const ex = loadExState();
  const a = ex && ex.aircraft ? ex.aircraft.find((x) => x.id === acftId) : null;
  if (!a) return;
  const parts = path.split('.');
  const obj = parts.length === 2 ? (a[parts[0]] || {}) : a;
  const dataKey = parts[parts.length - 1];
  const nameKey = {
    imageData: 'imageName', manoeuvresData: 'manoeuvresFile',
    dangerPermitData: 'dangerPermitFile', specialPermitData: 'specialPermitFile',
  }[dataKey];
  const data = obj[dataKey];
  const name = obj[nameKey] || 'file';
  if (!data) {
    toast('No preview available for "' + name + '" — the file was larger than 2 MB or was uploaded before previews were enabled.', 'error');
    return;
  }
  const blob = await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob);
  const isImg = data.indexOf('data:image') === 0;
  openModal('Uploaded File — ' + esc(name),
    isImg
      ? '<div style="text-align:center"><img src="' + url + '" alt="' + esc(name) + '" style="max-width:100%;max-height:65vh;border-radius:8px;border:1px solid var(--line)"></div>'
      : '<iframe src="' + url + '" style="width:100%;height:65vh;border:1px solid var(--line);border-radius:8px"></iframe>',
    '<a class="btn btn-outline" href="' + url + '" download="' + esc(name) + '"><span class="material-symbols-outlined">download</span>Download</a>' +
    '<button class="btn btn-primary" onclick="closeModal()">Close</button>', true);
}

function viewApplication(id) {
  const c = currentCommittee();
  const ex = loadExState();
  const a = ex && ex.aircraft ? ex.aircraft.find((x) => x.id === id) : null;
  if (!a) { location.hash = '#/approvals'; return ''; }
  // Category guard: a committee can open only its own category's applications
  if (a.displayType !== c.category) {
    return '<a class="back-link" href="#/approvals"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Aircraft Approvals</a>' +
      '<div class="card"><div class="empty"><span class="material-symbols-outlined">lock</span>' +
      '<h3>Access restricted</h3><p>This application belongs to the <b>' + esc(a.displayType) + '</b> category — it is not visible to the ' + esc(c.name) + '.</p></div></div>';
  }

  const head =
    '<a class="back-link" href="#/approvals"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Aircraft Approvals</a>' +
    '<div class="card-head-row"><div>' +
      '<h1 class="page-title">' + esc(a.model) + ' <span class="regno" style="font-size:1rem">' + esc(a.appNo || '') + '</span></h1>' +
      '<p class="page-sub" style="margin-bottom:0">' + esc(EX_COMPANY) + ' · ' + acStatusPill(a.status) + (c.payment ? ' ' + acPayPill(a) : '') +
      (a.submittedForApprovalAt ? ' · Submitted: ' + esc(a.submittedForApprovalAt) : '') +
      (a.approvedBy ? ' · Approved by: ' + esc(a.approvedBy) : '') +
      (a.status === 'rejected' && a.remark ? ' · <span style="color:var(--red)">' + esc(a.remark) + '</span>' : '') + '</p>' +
    '</div>' +
    (a.status === 'submitted'
      ? '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-primary" onclick="approveApp(\'' + a.id + '\')"><span class="material-symbols-outlined">check</span>Approve</button>' +
        '<button class="btn btn-danger-soft btn" onclick="rejectApp(\'' + a.id + '\')"><span class="material-symbols-outlined">close</span>Reject</button></div>'
      : '') +
    '</div>';

  const f1 = formCard('Form 1 — Aircraft Detail', a.createdAt, kvGrid([
    ['Aircraft Usage', a.usage], ['Type of Display', a.displayType],
    ['Model of Aircraft', a.model], ['Make of Aircraft', a.make],
    ['Weight', Number(a.weight).toLocaleString('en-IN') + ' kg'],
    c.payment ? ['Registration Fee', a.price != null ? acFmtFee(a) : '—'] : null,
    ['Year of Registration', a.yearOfReg], ['Registered With Organisation', a.regWithOrg],
    ['Registered No.', a.regNo], ['Manufacturing Year', a.mfgYear],
    ['Aircraft Image', uploadLink(a.id, 'imageData', a.imageName), 'html'],
  ]));

  const d7 = a.air7a;
  const f2 = d7 ? formCard('Form 2 — Aircraft Arrival Detail (Air-7A)', d7.savedAt, kvGrid([
    ['Aircraft Type', d7.aircraftType],
    ['Last Intermediate Landing Prior to Airbase', d7.lastLanding],
    ['Date & ETA at Airbase', d7.eta], ['Departure Date & Time', d7.departure],
    ['Airfield of Departure', d7.depAirfield], ['First Landing in India', d7.firstLanding],
  ])) : pendingCard('Form 2 — Aircraft Arrival Detail (Air-7A)');

  const d4 = a.air4;
  const f3 = d4 ? formCard('Form 3 — Flying Display (Air-4)', d4.savedAt, kvGrid([
    ['Consecutive Rolls Allowed', d4.rollsAllowed],
    ['Roll Type(s)', (d4.rollTypes || []).join(', ')],
    ['Manoeuvres Document', uploadLink(a.id, 'air4.manoeuvresData', d4.manoeuvresFile), 'html'],
    ['Certificate Type', d4.certType], ['Issued By', d4.issuedBy],
    ['Stated Restrictions', d4.restrictions, 'full'],
    ['Certificate No.', d4.certNo], ['Valid Upto', d4.validUpto],
    ['Call Sign', d4.callSign],
    ['Estimated Safe Endurance', (d4.endHrs || 0) + ' Hrs ' + (d4.endMin || 0) + ' Min'],
    ['Air Display Manoeuvres', (d4.manoeuvres || []).join(', '), 'full'],
    ['Fine Weather — Description', d4.fineDesc, 'full'],
    ['Fine Weather — Min Cloud Base', d4.fineBase], ['Fine Weather — Min Visibility', d4.fineVis],
    ['Bad Weather — Description', d4.badDesc, 'full'],
    ['Bad Weather — Min Cloud Base', d4.badBase], ['Bad Weather — Min Visibility', d4.badVis],
  ])) : pendingCard('Form 3 — Flying Display (Air-4)');

  const db = a.air7b;
  const f4 = db ? formCard('Form 4 — DGCA Non-Schedule Flights (AIR 7B & 9)', db.savedAt,
    kvGrid([
      ['Purpose of Flights', db.purpose, 'full'],
      ['Over-flying / Technical Landing / Traffic', db.overfly, 'full'],
      ['ATS Route(s)', db.atsRoutes, 'full'],
      ['Complete Route Itinerary', db.itinerary, 'full'],
      ['Arrival & Departure Timings in India', db.timings],
      ['Airport of Last Departure / First Landing', db.lastAirport],
      ['Type', db.type], ['State of Registry / Nationality', db.stateOfRegistry],
      ['Telephony Designator', db.telephony],
      ['Capable of Air-Dropping', db.airdrop], ['Seating Capacity > 30', db.seats30],
      ['Pay-load > 3 Tons', db.payload3t], ['ACAS-II / TCAS-II Fitted', db.acas],
      ['Noise Certificate Available', db.noiseCert],
      ['Pilot Name', db.pilotName], ['Pilot Nationality', db.pilotNat],
      ['Aircraft Operator Name', db.operatorName], ['Operator Nationality', db.operatorNat],
      ['Address (Tel/Fax)', db.address, 'full'],
    ]) +
    '<h3 style="margin:18px 0 4px;font-size:0.95rem">Onboard Details</h3>' +
    kvGrid([
      ['Operator Certificate / Permit No.', db.permitNo], ['Number of Crew', db.crew],
      ['Number of Passengers', db.passengers], ['Goods Carried', db.goods],
      ['Dangerous Goods DGCA Permit', uploadLink(a.id, 'air7b.dangerPermitData', db.dangerPermitFile), 'html'],
      ['Special Equipment DGCA Permit', uploadLink(a.id, 'air7b.specialPermitData', db.specialPermitFile), 'html'],
      ['Passengers / Cargo Uplifted in India', db.uplift], ['Number of Crew (Uplift)', db.crew2],
      ['Address (Tel/Fax)', db.address2, 'full'],
    ]) +
    '<h3 style="margin:18px 0 4px;font-size:0.95rem">Travel / Cargo Agent in India</h3>' +
    kvGrid([
      ['Name', db.agentName], ['Address (Tel/Fax)', db.agentAddr, 'full'],
    ])) : pendingCard('Form 4 — DGCA Non-Schedule Flights (AIR 7B & 9)');

  return head + f1 + f2 + f3 + f4;
}

/* ============================================================
   VIEW · Orders — payment ledger (Static Display Committee only;
   the Flying committee has no payment UI at all).
   Paid records come from ex.orders (written by the exhibitor app's
   payCart); items still in the cart appear as Pending.
   ============================================================ */
const ORDER_TYPE_LABEL = { coex_reg: 'Co-Exhibitor Registration', vehicle: 'Vehicle Pass', aircraft_reg: 'Aircraft Registration' };
const ORDER_STATUS_CHIPS = [['success', 'Success'], ['pending', 'Pending'], ['failed', 'Failed']];
const OF = { status: null, dateMode: '', from: '', to: '' };
function ofSetStatus(v) { OF.status = v || null; render(); }
function ofSetDateMode(v) { OF.dateMode = v; if (v !== 'custom') { OF.from = ''; OF.to = ''; } render(); }
function ofSetFrom(v) { OF.from = v; render(); }
function ofSetTo(v) { OF.to = v; render(); }
function ofClear() { OF.status = null; OF.dateMode = ''; OF.from = ''; OF.to = ''; render(); }

/* Committee sees ONLY aircraft-registration payments of ITS OWN category
   (Static Display) — co-exhibitor / vehicle payments stay with the admin. */
function ordersData() {
  const c = currentCommittee();
  const ex = loadExState();
  if (!ex) return [];
  const cat = (ex.aircraft || []).filter((a) => a.displayType === c.category);
  const catIds = new Set(cat.map((a) => a.id));
  const mine = (o) => o.type === 'aircraft_reg' && catIds.has(o.refId);
  const pending = (ex.cart || []).filter(mine).map((i) => ({
    id: 'pend-' + i.id, orderNo: '—', type: i.type, label: i.label, sub: i.sub || '',
    amount: i.amount, currency: i.currency || 'INR', status: 'pending', paidAt: '', payer: EX_COMPANY,
  }));
  const paid = (ex.orders || []).filter(mine).slice().reverse(); // newest first
  // Backfill: aircraft paid BEFORE the orders ledger existed have no order
  // record — synthesize one from the application so old payments still show.
  const seen = new Set(paid.map((o) => o.refId));
  cat.filter((a) => a.status === 'registered' && a.price != null && !seen.has(a.id))
    .forEach((a) => paid.push({
      id: 'legacy-' + a.id, orderNo: '—', type: 'aircraft_reg',
      label: 'Aircraft Registration — ' + a.model, sub: a.appNo || a.regNo, refId: a.id,
      amount: a.price, currency: a.feeCurrency || 'INR', status: 'success',
      paidAt: a.approvedAt || '', payer: EX_COMPANY,
    }));
  return pending.concat(paid);
}
function filteredOrders() {
  let list = ordersData();
  if (OF.status) list = list.filter((o) => o.status === OF.status);
  const r = dateFilterRange(OF);
  if (r.from || r.to) list = list.filter((o) => inDateRange(o.paidAtIso || o.paidAt, r.from, r.to));
  return list;
}
const orderAmt = (o) => (o.currency === 'USD' ? '$' : '₹') + Number(o.amount).toLocaleString('en-IN');
function orderStatusPill(s) {
  if (s === 'success') return '<span class="pill green">Success</span>';
  if (s === 'pending') return '<span class="pill amber">Pending</span>';
  return '<span class="pill red">Failed</span>';
}

function viewCommitteeOrders() {
  const all = ordersData();
  const list = filteredOrders();
  const succ = all.filter((o) => o.status === 'success');
  const collectedInr = succ.filter((o) => o.currency !== 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const collectedUsd = succ.filter((o) => o.currency === 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const nPending = all.filter((o) => o.status === 'pending').length;
  const nFailed = all.filter((o) => o.status === 'failed').length;

  const hasFilter = OF.status || OF.dateMode;
  const toolbar =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
      '<span class="result-count">' + list.length + ' of ' + all.length + '</span>' +
      toolbarSel(ORDER_STATUS_CHIPS, OF.status, 'ofSetStatus', 'Payment: All') +
      toolbarDateSel(OF, 'ofSetDateMode', 'ofSetFrom', 'ofSetTo') +
      (hasFilter ? '<button class="btn btn-outline btn-sm" onclick="ofClear()" title="Clear filters"><span class="material-symbols-outlined" style="font-size:16px">filter_alt_off</span>Clear</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="exportOrders()"' + (list.length ? '' : ' disabled') + '><span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
      '<button class="btn btn-outline btn-sm" onclick="render()" title="Refresh"><span class="material-symbols-outlined" style="font-size:16px">refresh</span></button>' +
    '</div>';

  const rows = list.map((o) =>
    '<tr>' +
    '<td><span class="regno">' + esc(o.orderNo || '—') + '</span></td>' +
    '<td><span class="td-strong">' + esc(ORDER_TYPE_LABEL[o.type] || o.type) + '</span>' +
      '<span class="td-sub">' + esc(o.label || '') + (o.sub ? ' · ' + esc(o.sub) : '') + '</span></td>' +
    '<td>' + esc(o.payer || EX_COMPANY) + '</td>' +
    '<td class="money">' + orderAmt(o) + '</td>' +
    '<td>' + orderStatusPill(o.status) + '</td>' +
    '<td>' + (o.paidAt ? esc(o.paidAt) : '<span style="color:var(--muted)">—</span>') + '</td>' +
    '</tr>').join('') ||
    '<tr><td colspan="6" style="color:var(--muted)">' +
      (all.length ? 'No orders match the selected filters.' : 'No orders yet — payments made in the exhibitor app will appear here.') +
    '</td></tr>';

  const c = currentCommittee();
  return '<h1 class="page-title">Orders</h1>' +
    '<p class="page-sub">Aircraft registration payments for <b>' + esc(c.category) + '</b> applications only. Fees enabled on approval that are awaiting payment show as Pending.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Orders</div><div class="t-value">' + all.length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Collected</div><div class="t-value">₹' + collectedInr.toLocaleString('en-IN') +
        (collectedUsd ? ' <small style="font-size:0.65em">+ $' + collectedUsd.toLocaleString('en-IN') + '</small>' : '') + '</div></div>' +
      '<div class="tile"><div class="t-label">Success</div><div class="t-value">' + succ.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending</div><div class="t-value">' + nPending + '</div></div>' +
      '<div class="tile"><div class="t-label">Failed</div><div class="t-value">' + nFailed + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Payment Ledger</h2>' +
      toolbar + '</div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Order No.</th><th>Order Type / Item</th><th>Payer</th><th>Amount</th><th>Payment Status</th><th>Paid At</th></tr>' +
    rows + '</table></div></div>';
}

function exportOrders() {
  const c = currentCommittee();
  const list = filteredOrders();
  if (!list.length) { toast('No orders to export.', 'error'); return; }
  exportWorkbook(c.category.replace(/\s+/g, '-') + '-Orders-' + exportStamp(), [{
    name: 'Orders',
    headers: ['Sr.', 'Order No', 'Order Type', 'Item', 'Details', 'Payer', 'Amount', 'Currency', 'Payment Status', 'Paid At'],
    rows: list.map((o, i) => [
      i + 1, o.orderNo || '-', ORDER_TYPE_LABEL[o.type] || o.type, o.label || '-', o.sub || '-',
      o.payer || EX_COMPANY, o.amount, o.currency || 'INR',
      o.status === 'success' ? 'Success' : o.status === 'pending' ? 'Pending' : 'Failed',
      o.paidAt || '-',
    ]),
  }]);
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Keep the email field in sync with the chosen committee (demo convenience)
  const sel = $('lgCommittee');
  if (sel) sel.addEventListener('change', () => { $('lgEmail').value = COMMITTEES[sel.value].email; });
  if (currentCommittee()) enterApp();
});
