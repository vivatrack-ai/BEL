/* ============================================================
   Evenuefy — Admin · Space Requirement Module
   Data source: real "Exhibiting Company Stall Inquiry" report
   (admin-data.js, generated from the platform's XLSX export).
   - One exhibitor can have MULTIPLE requirement entries
   - Filters: stall type / size (sqmt) / open sides
   - Bulk email to filtered or selected exhibitors
   State persists in localStorage; reset via footer link.
   ============================================================ */

'use strict';

/* ---------------- Constants (from the report's vocabulary) ---------------- */
const SETUP_TYPES = ['Shell', 'Raw', 'Pavilion', 'Outdoor', 'Chalet'];
const SIZE_TYPES = ['Shell', 'Raw', 'Pavilion', 'Outdoor']; // size filter applies to these (Chalet has no sqmt)
const SIDES_TYPES = ['Shell', 'Raw'];                       // open-sides filter applies to these
const FLOOR_OPTS = ['1 Floor', '2 Floor'];                  // Chalet floors (report's One/Two Side mapped)
const SIZE_BUCKETS = [
  { id: 'below100', label: 'Below 100 Sqm',       test: (n) => n != null && n < 100 },
  { id: '100to200', label: '100 Sqm to 200 Sqm',  test: (n) => n != null && n >= 100 && n <= 200 },
  { id: '200to400', label: '200 Sqm to 400 Sqm',  test: (n) => n != null && n > 200 && n <= 400 },
  { id: '400to500', label: '400 Sqm to 500 Sqm',  test: (n) => n != null && n > 400 && n <= 500 },
  { id: 'above500', label: 'Above 500 Sqm',       test: (n) => n != null && n > 500 },
];
const SIDE_OPTS = ['One Side Open', 'Two Side Open', 'Three Side Open', 'Four Side Open'];

/* ---------------- Seed = the real report ---------------- */
const ADMIN_SEED = {
  exhibitors: (window.ADMIN_DATA || { exhibitors: [] }).exhibitors,
  requirements: (window.ADMIN_DATA || { requirements: [] }).requirements,
  emailLog: [],
};

const ADMIN_LS_KEY = 'evenuefy_admin_spacereq_v4';
let A = loadAdmin();

function loadAdmin() {
  try {
    const raw = localStorage.getItem(ADMIN_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.exhibitors && parsed.requirements) {
        if (!parsed.emailLog) parsed.emailLog = [];
        return parsed;
      }
    }
  } catch (e) { /* in-memory */ }
  return JSON.parse(JSON.stringify(ADMIN_SEED));
}
function saveAdmin() {
  try { localStorage.setItem(ADMIN_LS_KEY, JSON.stringify(A)); } catch (e) { /* in-memory */ }
}
function resetAdminDemo() {
  if (!confirm('Reset to the original report data?')) return;
  A = JSON.parse(JSON.stringify(ADMIN_SEED));
  SEL.clear();
  saveAdmin();
  location.hash = '#/dashboard';
  render();
  toast('Data reset to report', 'success');
}

/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');

/* ---------------- Export to Excel (.xlsx via SheetJS; CSV fallback) ----------------
   exportWorkbook supports MULTIPLE sheets so every form's full data ships
   in one file: sheets = [{ name, headers, rows }] */
function exportWorkbook(filename, sheets) {
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    sheets.forEach((sh) => {
      const ws = XLSX.utils.aoa_to_sheet([sh.headers].concat(sh.rows));
      ws['!cols'] = sh.headers.map((h, i) => ({
        wch: Math.min(60, Math.max(String(h).length + 2, 10,
          ...sh.rows.map((r) => String(r[i] == null ? '' : r[i]).length + 2))),
      }));
      XLSX.utils.book_append_sheet(wb, ws, String(sh.name).slice(0, 31));
    });
    XLSX.writeFile(wb, filename + '.xlsx');
  } else {
    // offline fallback: CSV of the first sheet (opens in Excel)
    const sh = sheets[0];
    const csv = [sh.headers].concat(sh.rows)
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
function exportToExcel(filename, sheetName, headers, rows) {
  exportWorkbook(filename, [{ name: sheetName, headers, rows }]);
}
const exportStamp = () => new Date().toISOString().slice(0, 10);

/* ---------------- date-range filtering ---------------- */
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
const nowStr = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function exById(id) { return A.exhibitors.find((e) => e.id === id); }
function reqsOf(exId) { return A.requirements.filter((r) => r.exId === exId); }
function typePill(t) { return '<span class="pill gray">' + esc(t) + '</span>'; }
const fmtSqm = (n) => (n != null && n > 0) ? Number(n).toLocaleString('en-IN') + ' sqm' : '—';
const fmtReg = (r) => r ? '<span class="regno">' + esc(r) + '</span>' : '<span style="color:var(--muted)">—</span>';

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

/* ============================================================
   Filter + selection + pagination state
   ============================================================ */
const F = { types: [], size: null, floors: null, sides: null };
const SEL = new Set();
const PG = { page: 1, rows: 10 };

function toggleType(t) {
  const i = F.types.indexOf(t);
  if (i >= 0) F.types.splice(i, 1); else F.types.push(t);
  if (!F.types.some((x) => SIZE_TYPES.includes(x))) F.size = null;
  if (!F.types.includes('Chalet')) F.floors = null;
  if (!F.types.some((x) => SIDES_TYPES.includes(x))) F.sides = null;
  PG.page = 1;
  render();
}
function setSize(id) { F.size = (F.size === id ? null : id); PG.page = 1; render(); }
function setFloors(v) { F.floors = (F.floors === v ? null : v); PG.page = 1; render(); }
function setSides(v) { F.sides = (F.sides === v ? null : v); PG.page = 1; render(); }
function clearFilters() { F.types = []; F.size = null; F.floors = null; F.sides = null; PG.page = 1; render(); }
function setPageRows(n) { PG.rows = parseInt(n, 10) || 10; PG.page = 1; render(); }
function gotoPage(p) { PG.page = p; render(); }

/* Each requirement row filters independently. */
function filteredRequirements() {
  return A.requirements.filter((r) => {
    if (F.types.length && !F.types.includes(r.setupType)) return false;
    if (F.size && SIZE_TYPES.includes(r.setupType)) {
      const bucket = SIZE_BUCKETS.find((b) => b.id === F.size);
      if (!bucket.test(r.sqm)) return false;
    }
    if (F.floors && r.setupType === 'Chalet' && r.floors !== F.floors) return false;
    if (F.sides && SIDES_TYPES.includes(r.setupType) && r.openSides !== F.sides) return false;
    return true;
  });
}

function toggleSel(id, checked) {
  if (checked) SEL.add(id); else SEL.delete(id);
  render();
}
function toggleSelAll(checked) {
  filteredRequirements().forEach((r) => { if (checked) SEL.add(r.id); else SEL.delete(r.id); });
  render();
}

/* ============================================================
   Bulk email (recipients de-duplicated per exhibitor)
   ============================================================ */
function emailTargets() {
  const reqs = SEL.size ? A.requirements.filter((r) => SEL.has(r.id)) : filteredRequirements();
  const byEx = new Map();
  reqs.forEach((r) => {
    if (!byEx.has(r.exId)) byEx.set(r.exId, []);
    byEx.get(r.exId).push(r);
  });
  return [...byEx.entries()]
    .map(([exId, rs]) => ({ ex: exById(exId), reqs: rs }))
    .filter((t) => t.ex && t.ex.email);
}

function openBulkEmail() {
  const targets = emailTargets();
  if (!targets.length) { toast('No requirements in the current filter/selection.', 'error'); return; }
  const mode = SEL.size ? SEL.size + ' selected requirement(s)' : 'all ' + filteredRequirements().length + ' filtered requirement(s)';
  const recRows = targets.slice(0, 50).map((t, i) =>
    '<tr><td class="num">' + (i + 1) + '</td>' +
    '<td><span class="td-strong">' + esc(t.ex.company) + '</span><span class="td-sub">' + esc(t.ex.regNo || '—') + ' · ' + esc(t.ex.email) + '</span></td>' +
    '<td>' + t.reqs.map((r) => typePill(r.setupType) + ' ' + (r.sqm != null ? fmtSqm(r.sqm) : esc(r.openSides || ''))).join('<br>') + '</td></tr>').join('');
  const moreNote = targets.length > 50 ? '<p style="font-size:0.8rem;color:var(--muted)">…and ' + (targets.length - 50) + ' more recipients.</p>' : '';

  openModal('Send Bulk Email',
    '<div class="note" style="margin-top:0"><b class="title">' + targets.length + ' exhibitor(s) will receive this email</b>' +
      'Based on ' + mode + '. Each company is emailed once, even if it has multiple requirement entries.</div>' +
    '<div class="tablewrap" style="max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">' +
      '<table class="grid"><tr><th>Sr.</th><th>Exhibitor</th><th>Requirements</th></tr>' + recRows + '</table></div>' +
    moreNote +
    '<form id="bulkForm" onsubmit="return sendBulkEmail(event)" novalidate>' +
      '<div class="field" style="margin:12px 0"><label>Subject <span class="req">*</span></label>' +
        '<input type="text" id="bmSubject" placeholder="e.g. Aero India 2027 — Space allotment update"><div class="error"></div></div>' +
      '<div class="field"><label>Message <span class="req">*</span></label>' +
        '<textarea id="bmBody" rows="5" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.9rem" placeholder="Write your message… ({{company}} and {{requirement}} will be personalised per exhibitor)"></textarea>' +
        '<div class="hint">Placeholders: {{company}}, {{requirement}} (auto-filled per exhibitor)</div><div class="error"></div></div>' +
    '</form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="$(\'bulkForm\').requestSubmit()"><span class="material-symbols-outlined">send</span>Send Email</button>',
    true);
}

function sendBulkEmail(e) {
  e.preventDefault();
  const subject = $('bmSubject').value.trim();
  const body = $('bmBody').value.trim();
  let ok = true;
  document.querySelectorAll('#bulkForm .field').forEach((f) => f.classList.remove('invalid'));
  if (!subject) { const f = $('bmSubject').closest('.field'); f.classList.add('invalid'); f.querySelector('.error').textContent = 'Subject is required'; ok = false; }
  if (!body) { const f = $('bmBody').closest('.field'); f.classList.add('invalid'); f.querySelector('.error').textContent = 'Message is required'; ok = false; }
  if (!ok) return false;

  const targets = emailTargets();
  A.emailLog.unshift({
    sentAt: nowStr(),
    subject: subject,
    recipients: targets.map((t) => t.ex.email),
    count: targets.length,
  });
  saveAdmin();
  SEL.clear();
  closeModal(); render();
  toast('Bulk email sent to ' + targets.length + ' exhibitor(s)', 'success');
  return false;
}

/* ============================================================
   ROUTER
   ============================================================ */
function currentRoute() { return location.hash.replace(/^#\//, '') || 'dashboard'; }

function render() {
  const route = currentRoute();
  let html = '';
  const mDetail = route.match(/^exhibitor\/(.+)$/);
  if (mDetail) html = viewExhibitorDetail(mDetail[1]);
  else if (route === 'space-requirements') html = viewSpaceRequirements();
  else if (route === 'aircraft-approvals') html = viewAircraftApprovals();
  else if (route === 'orders') html = viewOrders();
  else if (route.indexOf('aircraft-application/') === 0) html = viewAircraftApplication(route.split('/')[1]);
  else html = viewDashboard();

  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const r = el.getAttribute('data-route');
    el.classList.toggle('active', route === r || (mDetail && r === 'space-requirements') ||
      (r === 'aircraft-approvals' && route.indexOf('aircraft-application/') === 0));
  });

  $('view').innerHTML = html;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

/* ============================================================
   VIEW · Space Requirement Dashboard
   ============================================================ */
function viewDashboard() {
  const reqs = A.requirements;
  const totalSqm = reqs.reduce((a, r) => a + (r.sqm || 0), 0);
  const chalets = reqs.filter((r) => r.setupType === 'Chalet').length;
  const exWithReqs = new Set(reqs.map((r) => r.exId)).size;
  const multiCompanies = A.exhibitors.filter((ex) => reqsOf(ex.id).length > 1).length;

  const maxCount = Math.max(...SETUP_TYPES.map((t) => reqs.filter((r) => r.setupType === t).length), 1);
  const typeBars = SETUP_TYPES.map((t) => {
    const n = reqs.filter((r) => r.setupType === t).length;
    return '<div class="bar-row"><span>' + esc(t) + '</span>' +
      '<span class="track"><i class="fill" style="width:' + Math.round((n / maxCount) * 100) + '%"></i></span>' +
      '<span class="val">' + n + '</span></div>';
  }).join('');

  const sizeCounts = SIZE_BUCKETS.map((b) => reqs.filter((r) => SIZE_TYPES.includes(r.setupType) && b.test(r.sqm)).length);
  const sizeMax = Math.max(...sizeCounts, 1);
  const sizeRows = SIZE_BUCKETS.map((b, i) =>
    '<div class="bar-row"><span>' + b.label + '</span>' +
    '<span class="track"><i class="fill" style="width:' + Math.round((sizeCounts[i] / sizeMax) * 100) + '%"></i></span>' +
    '<span class="val">' + sizeCounts[i] + '</span></div>').join('');

  // The report is exported newest-first — top rows are the latest inquiries.
  const recent = reqs.slice(0, 5).map((r) => {
    const ex = exById(r.exId);
    return '<tr>' +
      '<td><div class="profile-cell"><span class="avatar">' + esc((ex.company || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="td-strong">' + esc(ex.company) + '</span></div></td>' +
      '<td class="contact-cell">' + esc(ex.email) + '<br><span class="ph">' + esc(ex.phone) + '</span></td>' +
      '<td>' + fmtReg(ex.regNo) + '</td>' +
      '<td>' + typePill(r.setupType) + '</td>' +
      '<td class="num">' + fmtSqm(r.sqm) + '</td>' +
      '<td class="td-actions"><a class="btn-link" href="#/exhibitor/' + ex.id + '">View</a></td></tr>';
  }).join('');

  return '<h1 class="page-title">Space Requirement Dashboard</h1>' +
    '<p class="page-sub">Overview of space booking requirements captured from exhibitors. One exhibitor can submit multiple requirements.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Requirements</div><div class="t-value">' + reqs.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Exhibitors</div><div class="t-value">' + exWithReqs + '</div></div>' +
      '<div class="tile"><div class="t-label">Total Space Requested</div><div class="t-value">' + totalSqm.toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>' +
      '<div class="tile accent"><div class="t-label">Multi-Requirement Companies</div><div class="t-value">' + multiCompanies + '</div></div>' +
      '<div class="tile"><div class="t-label">Chalet Requests</div><div class="t-value">' + chalets + '</div></div>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="card"><h2 class="card-title">By Space Setup Type</h2><div class="bar-rows">' + typeBars + '</div></div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">By Size (Shell · Raw · Pavilion · Outdoor)</h2><div class="bar-rows">' + sizeRows + '</div></div>' +
    '</div>' +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Recent Submissions</h2>' +
      '<a class="btn btn-outline btn-sm" href="#/space-requirements">View All<span class="material-symbols-outlined" style="font-size:16px">chevron_right</span></a></div>' +
      '<div class="tablewrap"><table class="grid">' +
      '<tr><th>Profile Info</th><th>Contact Info</th><th>Reg. No.</th><th>Setup Type</th><th>Size</th><th>Action</th></tr>' +
      recent + '</table></div></div>' +
    footerTools();
}

/* ============================================================
   VIEW · Space Requirements (listing per the report columns)
   ============================================================ */
function viewSpaceRequirements() {
  const sizeVisible = F.types.some((t) => SIZE_TYPES.includes(t));
  const floorsVisible = F.types.includes('Chalet');
  const sidesVisible = F.types.some((t) => SIDES_TYPES.includes(t));
  const anyFilter = F.types.length || F.size || F.floors || F.sides;
  const list = filteredRequirements();
  const allChecked = list.length > 0 && list.every((r) => SEL.has(r.id));

  const typeChips = SETUP_TYPES.map((t) =>
    '<button class="fchip' + (F.types.includes(t) ? ' on' : '') + '" onclick="toggleType(\'' + t + '\')">' + esc(t) + '</button>').join('');
  const sizeChips = SIZE_BUCKETS.map((b) =>
    '<button class="fchip' + (F.size === b.id ? ' on' : '') + '" onclick="setSize(\'' + b.id + '\')">' + b.label + '</button>').join('');
  const floorChips = FLOOR_OPTS.map((f) =>
    '<button class="fchip' + (F.floors === f ? ' on' : '') + '" onclick="setFloors(\'' + f + '\')">' + esc(f) + '</button>').join('');
  const sideChips = SIDE_OPTS.map((s) =>
    '<button class="fchip' + (F.sides === s ? ' on' : '') + '" onclick="setSides(\'' + s + '\')">' + esc(s) + '</button>').join('');

  const filterPanel =
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Filter — Space Requirement</h2>' +
      (anyFilter ? '<button class="btn btn-outline btn-sm filter-clear" onclick="clearFilters()"><span class="material-symbols-outlined" style="font-size:16px">filter_alt_off</span>Clear Filters</button>' : '') +
    '</div>' +
    '<div class="filter-panel">' +
      '<div class="filter-row"><span class="filter-label">Space Setup Type</span><div class="filter-chips">' + typeChips + '</div></div>' +
      (sizeVisible ? '<div class="filter-row"><span class="filter-label">Size Filter</span><div class="filter-chips">' + sizeChips + '</div></div>' : '') +
      (floorsVisible ? '<div class="filter-row"><span class="filter-label">Number of Floors</span><div class="filter-chips">' + floorChips + '</div></div>' : '') +
      (sidesVisible ? '<div class="filter-row"><span class="filter-label">Open Sides (Shell &amp; Raw)</span><div class="filter-chips">' + sideChips + '</div></div>' : '') +
    '</div></div>';

  // Pagination
  const totalPages = Math.max(1, Math.ceil(list.length / PG.rows));
  if (PG.page > totalPages) PG.page = totalPages;
  const start = (PG.page - 1) * PG.rows;
  const pageList = list.slice(start, start + PG.rows);
  const showFrom = list.length ? start + 1 : 0;
  const showTo = Math.min(start + PG.rows, list.length);

  const rows = pageList.map((r) => {
    const ex = exById(r.exId);
    const all = reqsOf(r.exId);
    const multi = all.length > 1
      ? ' <span class="pill blue" title="This exhibitor has submitted ' + all.length + ' requirements">Req ' + (all.indexOf(r) + 1) + ' of ' + all.length + '</span>'
      : '';
    return '<tr>' +
      '<td><input type="checkbox" ' + (SEL.has(r.id) ? 'checked ' : '') + 'onchange="toggleSel(\'' + r.id + '\', this.checked)" aria-label="Select requirement"></td>' +
      '<td><div class="profile-cell"><span class="avatar">' + esc((ex.company || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span><span class="td-strong">' + esc(ex.company) + '</span>' + (multi ? '<span class="td-sub">' + multi.trim() + '</span>' : '') + '</span></div></td>' +
      '<td class="contact-cell">' + esc(ex.email) + '<br><span class="ph">' + esc(ex.phone) + '</span></td>' +
      '<td>' + fmtReg(ex.regNo) + '</td>' +
      '<td>' + typePill(r.setupType) + '</td>' +
      '<td class="num">' + fmtSqm(r.sqm) + '</td>' +
      '<td>' + (r.floors ? esc(r.floors) : '—') + '</td>' +
      '<td>' + (r.openSides ? esc(r.openSides) : '—') + '</td>' +
      '<td class="td-actions"><a class="btn-link" href="#/exhibitor/' + ex.id + '">View Details</a></td></tr>';
  }).join('') ||
    '<tr><td colspan="9" style="color:var(--muted)">No requirements match the selected filters.</td></tr>';

  const emailBtnLabel = SEL.size
    ? 'Send Bulk Email (' + SEL.size + ' selected)'
    : 'Send Bulk Email (all ' + list.length + ' filtered)';

  const logRows = A.emailLog.slice(0, 5).map((l, i) =>
    '<tr><td class="num">' + (i + 1) + '</td>' +
    '<td class="td-strong">' + esc(l.subject) + '</td>' +
    '<td class="num">' + l.count + ' exhibitor(s)</td>' +
    '<td class="num">' + esc(l.sentAt) + '</td></tr>').join('');
  const emailLogCard = A.emailLog.length
    ? '<div class="card section-gap"><h2 class="card-title">Bulk Email History</h2>' +
      '<div class="tablewrap"><table class="grid">' +
      '<tr><th>Sr.</th><th>Subject</th><th>Recipients</th><th>Sent At</th></tr>' + logRows + '</table></div></div>'
    : '';

  return '<h1 class="page-title">Space Requirements</h1>' +
    '<p class="page-sub">Stall inquiries from exhibiting companies — one row per requirement (an exhibitor can submit more than one). Filter the segment you need, then send them a bulk email.</p>' +
    filterPanel +
    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Requirement List</h2>' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<span class="result-count">' + list.length + ' of ' + A.requirements.length + ' requirements</span>' +
        '<button class="btn btn-outline btn-sm" onclick="exportRequirements()"' + (list.length ? '' : ' disabled') + '>' +
          '<span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
        '<button class="btn btn-primary btn-sm" onclick="openBulkEmail()"' + (list.length || SEL.size ? '' : ' disabled') + '>' +
          '<span class="material-symbols-outlined" style="font-size:16px">mail</span>' + emailBtnLabel + '</button>' +
      '</div></div>' +
      '<div class="tablewrap"><table class="grid">' +
      '<tr><th><input type="checkbox" ' + (allChecked ? 'checked ' : '') + 'onchange="toggleSelAll(this.checked)" title="Select all filtered (across pages)" aria-label="Select all filtered"></th>' +
      '<th>Profile Info</th><th>Contact Info</th><th>Reg. No.</th><th>Setup Type</th><th>Size</th><th>Floors</th><th>Open Sides</th><th>Action</th></tr>' +
      rows + '</table></div>' +
      '<div style="display:flex;align-items:center;justify-content:flex-end;gap:16px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:0.83rem;color:var(--muted)">' +
        '<span>Rows <select onchange="setPageRows(this.value)" style="border:1px solid #CFD7E4;border-radius:7px;padding:4px 8px;font-family:inherit;font-size:0.83rem;margin-left:4px">' +
          [10, 25, 50].map((n) => '<option' + (PG.rows === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></span>' +
        '<span>Showing <b style="color:var(--ink)">' + showFrom + '</b> to <b style="color:var(--ink)">' + showTo + '</b> of <b style="color:var(--ink)">' + list.length + '</b></span>' +
        '<span style="display:flex;gap:6px">' +
          '<button class="btn btn-outline btn-sm" ' + (PG.page <= 1 ? 'disabled ' : '') + 'onclick="gotoPage(' + (PG.page - 1) + ')" aria-label="Previous page"><span class="material-symbols-outlined" style="font-size:17px">keyboard_arrow_left</span></button>' +
          '<span style="align-self:center;font-weight:700;color:var(--ink)">' + PG.page + ' / ' + totalPages + '</span>' +
          '<button class="btn btn-outline btn-sm" ' + (PG.page >= totalPages ? 'disabled ' : '') + 'onclick="gotoPage(' + (PG.page + 1) + ')" aria-label="Next page"><span class="material-symbols-outlined" style="font-size:17px">keyboard_arrow_right</span></button>' +
        '</span>' +
      '</div></div>' +
    emailLogCard +
    footerTools();
}

/* Export the CURRENT filtered requirement list (one row per requirement) */
function exportRequirements() {
  const list = filteredRequirements();
  if (!list.length) { toast('Nothing to export for the selected filters.', 'error'); return; }
  const headers = ['Sr.', 'Organization Name', 'Email', 'Contact No', 'Registration No', 'Stall Type', 'Stall-Sqmt', 'Floors', 'Open Sides'];
  const rows = list.map((r, i) => {
    const ex = exById(r.exId);
    return [i + 1, ex.company, ex.email, ex.phone, ex.regNo || '-', r.setupType,
      r.sqm != null ? r.sqm : '-', r.floors || '-', r.openSides || '-'];
  });
  exportToExcel('Space-Requirements-' + exportStamp(), 'Space Requirements', headers, rows);
}

/* ============================================================
   VIEW · Exhibitor Detailed View
   ============================================================ */
function requirementBlock(r, idx, total) {
  return '<div class="card" style="border-left:3px solid var(--blue);margin-top:' + (idx ? '14px' : '0') + '">' +
    '<div class="card-head-row"><h2 class="card-title">Requirement ' + (idx + 1) + (total > 1 ? ' of ' + total : '') + '</h2></div>' +
    '<div class="tiles" style="margin-bottom:0">' +
      '<div class="tile blue"><div class="t-label">Stall Type</div><div class="t-value" style="font-size:1.15rem">' + esc(r.setupType) + '</div></div>' +
      (r.sqm != null
        ? '<div class="tile"><div class="t-label">Requested Size</div><div class="t-value">' + Number(r.sqm).toLocaleString('en-IN') + '<span style="font-size:0.85rem;color:var(--muted);font-weight:600"> sqm</span></div></div>'
        : '') +
      (r.floors
        ? '<div class="tile"><div class="t-label">Number of Floors</div><div class="t-value" style="font-size:1.15rem">' + esc(r.floors) + '</div></div>'
        : '') +
      (r.openSides
        ? '<div class="tile"><div class="t-label">Open Sides</div><div class="t-value" style="font-size:1.15rem">' + esc(r.openSides) + '</div></div>'
        : '') +
    '</div></div>';
}

function viewExhibitorDetail(exId) {
  const ex = exById(exId);
  if (!ex) { location.hash = '#/space-requirements'; return ''; }
  const reqs = reqsOf(exId);
  const totalSqm = reqs.reduce((a, r) => a + (r.sqm || 0), 0);

  const blocks = reqs.map((r, i) => requirementBlock(r, i, reqs.length)).join('') ||
    '<div class="card"><div class="empty"><span class="material-symbols-outlined">design_services</span>' +
    '<h3>No space requirement submitted</h3></div></div>';

  const summaryLines = reqs.map((r) =>
    '<li><b>' + esc(r.setupType) + '</b>' + (r.sqm != null ? ' — ' + fmtSqm(r.sqm) : '') +
    (r.floors ? ' · ' + esc(r.floors) : '') +
    (r.openSides ? ' · ' + esc(r.openSides) : '') + '</li>').join('');

  return '<a class="back-link" href="#/space-requirements"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Space Requirements</a>' +
    '<h1 class="page-title">' + esc(ex.company) + '</h1>' +
    '<p class="page-sub">Exhibitor detailed view — Aero India 2027</p>' +

    '<div class="card"><h2 class="card-title">Company Information</h2>' +
      '<div class="form-grid" style="margin-top:10px">' +
        '<div><b>Registration No.:</b> ' + fmtReg(ex.regNo) + '</div>' +
        '<div><b>Email:</b> ' + esc(ex.email) + '</div>' +
        '<div><b>Mobile:</b> ' + esc(ex.phone || '—') + '</div>' +
        '<div><b>Requirements Submitted:</b> ' + reqs.length + (totalSqm ? ' (' + totalSqm.toLocaleString('en-IN') + ' sqm total)' : '') + '</div>' +
      '</div></div>' +

    '<div class="section-gap">' +
      '<div class="card-head-row" style="margin-bottom:10px">' +
        '<h2 class="card-title" style="font-size:1.15rem">Space Requirement' +
        ' <span class="pill blue">' + reqs.length + ' requirement' + (reqs.length === 1 ? '' : 's') + '</span></h2>' +
      '</div>' +
      (reqs.length > 1
        ? '<div class="note" style="margin-top:0"><b class="title">Multiple requirements</b>' +
          esc(ex.company) + ' has submitted ' + reqs.length + ' space requirements:<ul style="margin-top:6px">' + summaryLines + '</ul></div>'
        : '') +
      blocks +
    '</div>' +
    footerTools();
}

/* ============================================================
   VIEW · Aircraft Approvals (committee approval flow)
   Reads/writes the exhibitor portal's state directly (same-origin
   localStorage key) — in production this is the applications API.
   ============================================================ */
const EX_LS_KEY = 'evenuefy_coex_module_v1';
const EX_COMPANY = 'Hindustan Aeronautics Limited (HAL)';

function loadExState() {
  try { const raw = localStorage.getItem(EX_LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveExState(st) {
  try { localStorage.setItem(EX_LS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
}
const acFmtFee = (a) => a.price == null ? '—'
  : (a.feeCurrency === 'USD' ? '$' + Number(a.price).toLocaleString('en-US') : money(a.price));

/* Application status and payment status shown separately */
/* ---------------- Approvals filters (status · payment · date) ---------------- */
const AF = { status: null, pay: null, disp: null, dateMode: '', from: '', to: '' };
function afSetStatus(v) { AF.status = v || null; render(); }
function afSetPay(v) { AF.pay = v || null; render(); }
function afSetDisp(v) { AF.disp = v || null; render(); }
function afSetDateMode(v) { AF.dateMode = v; if (v !== 'custom') { AF.from = ''; AF.to = ''; } render(); }
function afSetFrom(v) { AF.from = v; render(); }
function afSetTo(v) { AF.to = v; render(); }
function afClear() { AF.status = null; AF.pay = null; AF.disp = null; AF.dateMode = ''; AF.from = ''; AF.to = ''; render(); }
const DISPLAY_OPTS = [['Static Display', 'Static Display'], ['Flying Display', 'Flying Display']];
const dispPill = (t) => t === 'Static Display'
  ? '<span class="pill blue">Static Display</span>'
  : '<span class="pill gray">Flying Display</span>';

const APP_STATUS_CHIPS = [['draft', 'Draft'], ['submitted', 'Pending Approval'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const PAY_CHIPS = [['success', 'Success'], ['pending', 'Pending'], ['failed', 'Failed']];
const appStatusKey = (a) => (a.status === 'registered' ? 'approved' : a.status);
const payKey = (a) => a.status === 'registered' ? 'success'
  : (a.status === 'approved' && a.price != null ? 'pending' : (a.paymentFailed ? 'failed' : '-'));

function filteredAircraftApps() {
  const ex = loadExState();
  let list = (ex && ex.aircraft) ? ex.aircraft : [];
  if (AF.status) list = list.filter((a) => appStatusKey(a) === AF.status);
  if (AF.pay) list = list.filter((a) => payKey(a) === AF.pay);
  if (AF.disp) list = list.filter((a) => a.displayType === AF.disp);
  const r = dateFilterRange(AF);
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

function viewAircraftApprovals() {
  const ex = loadExState();
  const all = (ex && ex.aircraft) ? ex.aircraft : [];
  const list = filteredAircraftApps();
  const counts = {
    total: all.length,
    submitted: all.filter((a) => a.status === 'submitted').length,
    approved: all.filter((a) => a.status === 'approved').length,
    registered: all.filter((a) => a.status === 'registered').length,
    rejected: all.filter((a) => a.status === 'rejected').length,
  };

  const hasFilter = AF.status || AF.pay || AF.disp || AF.dateMode;
  const toolbar =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
      '<span class="result-count">' + list.length + ' of ' + all.length + '</span>' +
      toolbarSel(DISPLAY_OPTS, AF.disp, 'afSetDisp', 'Display: All') +
      toolbarSel(APP_STATUS_CHIPS, AF.status, 'afSetStatus', 'Application Status: All') +
      toolbarSel(PAY_CHIPS, AF.pay, 'afSetPay', 'Payment: All') +
      toolbarDateSel(AF, 'afSetDateMode', 'afSetFrom', 'afSetTo') +
      (hasFilter ? '<button class="btn btn-outline btn-sm" onclick="afClear()" title="Clear filters"><span class="material-symbols-outlined" style="font-size:16px">filter_alt_off</span>Clear</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="exportAircraftApps()"' + (list.length ? '' : ' disabled') + '><span class="material-symbols-outlined" style="font-size:16px">download</span>Export to Excel</button>' +
      '<button class="btn btn-outline btn-sm" onclick="render()" title="Refresh"><span class="material-symbols-outlined" style="font-size:16px">refresh</span></button>' +
    '</div>';

  const formsDone = (a) =>
    '<span class="pill green">Form 1 ✓</span> ' +
    ['air7a', 'air4', 'air7b'].map((f) => {
      const labels = { air7a: 'Air-7A', air4: 'Air-4', air7b: '7B & 9' };
      return a[f] ? '<span class="pill green">' + labels[f] + ' ✓</span>' : '<span class="pill amber">' + labels[f] + ' —</span>';
    }).join(' ');

  const rows = list.map((a) =>
    '<tr>' +
    '<td><span class="regno">' + esc(a.appNo || '—') + '</span></td>' +
    '<td><div class="profile-cell"><span class="avatar">' + esc(EX_COMPANY.charAt(0)) + '</span>' +
      '<span><span class="td-strong">' + esc(a.model) + '</span>' +
      '<span class="td-sub">' + esc(EX_COMPANY) + '</span>' +
      '<span class="td-sub">' + esc(a.usage) + ' · ' + Number(a.weight).toLocaleString('en-IN') + ' kg · <span class="regno">' + esc(a.regNo) + '</span></span></span></div></td>' +
    '<td>' + dispPill(a.displayType) + '</td>' +
    '<td class="money">' + acFmtFee(a) + '</td>' +
    '<td style="min-width:170px">' + formsDone(a) + '</td>' +
    '<td>' + acStatusPill(a.status) + (a.status === 'rejected' && a.remark ? '<span class="td-sub" style="color:var(--red)">' + esc(a.remark) + '</span>' : '') + '</td>' +
    '<td>' + acPayPill(a) + '</td>' +
    '<td class="td-actions">' +
      '<a class="btn-link" href="#/aircraft-application/' + a.id + '">View</a>' +
      (a.status === 'submitted'
        ? '<button class="btn-link" style="color:var(--green)" onclick="approveAircraft(\'' + a.id + '\')">Approve</button>' +
          '<button class="btn-link danger" onclick="rejectAircraft(\'' + a.id + '\')">Reject</button>'
        : '') +
    '</td></tr>').join('') ||
    '<tr><td colspan="8" style="color:var(--muted)">' +
      (all.length ? 'No applications match the selected filters.' : 'No aircraft applications received yet.') +
    '</td></tr>';

  return '<h1 class="page-title">Aircraft Approvals</h1>' +
    '<p class="page-sub">Committee approval for aircraft registration applications. On approval, the registration fee is pushed to the exhibitor’s cart for payment.</p>' +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Applications</div><div class="t-value">' + counts.total + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending Approval</div><div class="t-value">' + counts.submitted + '</div></div>' +
      '<div class="tile"><div class="t-label">Approved · Unpaid</div><div class="t-value">' + counts.approved + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Registered (Paid)</div><div class="t-value">' + counts.registered + '</div></div>' +
      '<div class="tile"><div class="t-label">Rejected</div><div class="t-value">' + counts.rejected + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Applications</h2>' +
      toolbar + '</div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Application No.</th><th>Aircraft / Exhibitor</th><th>Type of Display</th><th>Fee</th><th>Forms</th><th>Application Status</th><th>Payment Status</th><th>Action</th></tr>' +
    rows + '</table></div></div>' +
    footerTools();
}

/* Shared row-builder + export for aircraft applications (used by admin;
   the committee portal exports the same columns for its category) */
function aircraftExportRows(list) {
  const statusLabel = { draft: 'Draft', submitted: 'Pending Approval', approved: 'Approved', registered: 'Approved', rejected: 'Rejected' };
  const payLabel = (a) => a.status === 'registered' ? 'Paid'
    : a.status === 'approved' ? (a.price != null ? 'Payment Pending' : 'No Fee') : '-';
  return list.map((a, i) => [
    i + 1, a.appNo || '-', EX_COMPANY, a.model, a.make, a.usage, a.displayType,
    a.weight, a.regNo, a.yearOfReg || '-', a.regWithOrg || '-', a.mfgYear || '-', a.imageName || '-',
    a.price != null ? a.price : '-', a.feeCurrency || '-',
    a.air7a ? 'Yes' : 'No', a.air4 ? 'Yes' : 'No', a.air7b ? 'Yes' : 'No',
    statusLabel[a.status] || a.status, payLabel(a),
    a.createdAt || '-', a.submittedForApprovalAt || '-', a.approvedBy || '-', a.remark || '-',
  ]);
}
const AIRCRAFT_EXPORT_HEADERS = ['Sr.', 'Application No', 'Exhibitor', 'Model', 'Make', 'Usage', 'Type of Display',
  'Weight (kg)', 'Aircraft Reg No', 'Year of Registration', 'Registered With Organisation', 'Manufacturing Year',
  'Aircraft Image', 'Fee', 'Currency', 'Air-7A Filled', 'Air-4 Filled', '7B & 9 Filled',
  'Application Status', 'Payment Status', 'Created At', 'Submitted At', 'Approved By', 'Remark'];

function exportAircraftApps() {
  const list = filteredAircraftApps(); // export respects the active filters
  if (!list.length) { toast('No applications to export.', 'error'); return; }
  exportWorkbook('Aircraft-Applications-' + exportStamp(), [
    { name: 'Applications', headers: AIRCRAFT_EXPORT_HEADERS, rows: aircraftExportRows(list) },
  ].concat(aircraftFormSheets(list)));
}

/* ============================================================
   VIEW · Orders — the full payment ledger of the exhibitor app.
   Paid records come from ex.orders (written by payCart); items
   still in the cart appear as Pending.
   ============================================================ */
const ORDER_TYPE_LABEL = { coex_reg: 'Co-Exhibitor Registration', vehicle: 'Vehicle Pass', aircraft_reg: 'Aircraft Registration', exh_form: 'Exhibition Form', booking: 'Hall / Table Booking', space: 'Space Booking' };
const ORDER_STATUS_CHIPS = [['success', 'Success'], ['pending', 'Pending'], ['failed', 'Failed']];
const OF = { type: null, status: null, dateMode: '', from: '', to: '' };
function ofSetType(v) { OF.type = v || null; render(); }
function ofSetStatus(v) { OF.status = v || null; render(); }
function ofSetDateMode(v) { OF.dateMode = v; if (v !== 'custom') { OF.from = ''; OF.to = ''; } render(); }
function ofSetFrom(v) { OF.from = v; render(); }
function ofSetTo(v) { OF.to = v; render(); }
function ofClear() { OF.type = null; OF.status = null; OF.dateMode = ''; OF.from = ''; OF.to = ''; render(); }

function ordersData() {
  const ex = loadExState();
  if (!ex) return [];
  const pending = (ex.cart || []).map((i) => ({
    id: 'pend-' + i.id, orderNo: '—', type: i.type, label: i.label, sub: i.sub || '',
    amount: i.amount, currency: i.currency || 'INR', status: 'pending', paidAt: '', payer: EX_COMPANY,
  }));
  const paid = (ex.orders || []).slice().reverse(); // newest first
  // Backfill: aircraft paid BEFORE the orders ledger existed have no order
  // record — synthesize one from the application so old payments still show.
  const seen = new Set(paid.map((o) => o.refId));
  (ex.aircraft || [])
    .filter((a) => a.status === 'registered' && a.price != null && !seen.has(a.id))
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
  if (OF.type) list = list.filter((o) => o.type === OF.type);
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

function viewOrders() {
  const all = ordersData();
  const list = filteredOrders();
  const succ = all.filter((o) => o.status === 'success');
  const collectedInr = succ.filter((o) => o.currency !== 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const collectedUsd = succ.filter((o) => o.currency === 'USD').reduce((a, o) => a + Number(o.amount || 0), 0);
  const nPending = all.filter((o) => o.status === 'pending').length;
  const nFailed = all.filter((o) => o.status === 'failed').length;

  const hasFilter = OF.type || OF.status || OF.dateMode;
  const typeOpts = Object.keys(ORDER_TYPE_LABEL).map((k) => [k, ORDER_TYPE_LABEL[k]]);
  const toolbar =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
      '<span class="result-count">' + list.length + ' of ' + all.length + '</span>' +
      toolbarSel(typeOpts, OF.type, 'ofSetType', 'Order Type: All') +
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

  return '<h1 class="page-title">Orders</h1>' +
    '<p class="page-sub">All payments across the exhibitor app — co-exhibitor registrations, vehicle passes and aircraft registration fees. Cart items awaiting payment show as Pending.</p>' +
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
    rows + '</table></div></div>' +
    footerTools();
}

function exportOrders() {
  const list = filteredOrders();
  if (!list.length) { toast('No orders to export.', 'error'); return; }
  exportWorkbook('Orders-' + exportStamp(), [{
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

/* ---------------- Application detail (what the exhibitor filled) ---------------- */
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

/* Clickable link for an exhibitor upload — opens the file (image/PDF)
   in a viewer modal. `path` addresses the data field, e.g. 'imageData'
   or 'air4.manoeuvresData'. */
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
    toast('No preview available for "' + name + '" — the file was larger than 2 MB or was uploaded before previews were enabled (ask the exhibitor to re-upload).', 'error');
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
function formCard(title, savedAt, inner) {
  return '<div class="card section-gap" style="border-left:3px solid var(--blue)">' +
    '<div class="card-head-row"><h2 class="card-title">' + title + '</h2>' +
    (savedAt ? '<span class="result-count">Saved: ' + esc(savedAt) + '</span>' : '') + '</div>' + inner + '</div>';
}
function pendingCard(title) {
  return '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">' + title + '</h2>' +
    '<span class="pill amber">Not filled yet</span></div></div>';
}

function viewAircraftApplication(id) {
  const ex = loadExState();
  const a = ex && ex.aircraft ? ex.aircraft.find((x) => x.id === id) : null;
  if (!a) { location.hash = '#/aircraft-approvals'; return ''; }

  const head =
    '<a class="back-link" href="#/aircraft-approvals"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Aircraft Approvals</a>' +
    '<div class="card-head-row"><div>' +
      '<h1 class="page-title">' + esc(a.model) + ' <span class="regno" style="font-size:1rem">' + esc(a.appNo || '') + '</span></h1>' +
      '<p class="page-sub" style="margin-bottom:0">' + esc(EX_COMPANY) + ' · ' + acStatusPill(a.status) + ' ' + acPayPill(a) +
      (a.submittedForApprovalAt ? ' · Submitted: ' + esc(a.submittedForApprovalAt) : '') +
      (a.approvedBy ? ' · Approved by: ' + esc(a.approvedBy) : '') +
      (a.status === 'rejected' && a.remark ? ' · <span style="color:var(--red)">' + esc(a.remark) + '</span>' : '') + '</p>' +
    '</div>' +
    (a.status === 'submitted'
      ? '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-primary" onclick="approveAircraft(\'' + a.id + '\')"><span class="material-symbols-outlined">check</span>Approve</button>' +
        '<button class="btn btn-danger-soft btn" onclick="rejectAircraft(\'' + a.id + '\')"><span class="material-symbols-outlined">close</span>Reject</button></div>'
      : '') +
    '</div>';

  /* Form 1 — Aircraft Detail */
  const f1 = formCard('Form 1 — Aircraft Detail', a.createdAt, kvGrid([
    ['Aircraft Usage', a.usage], ['Type of Display', a.displayType],
    ['Model of Aircraft', a.model], ['Make of Aircraft', a.make],
    ['Weight', Number(a.weight).toLocaleString('en-IN') + ' kg'],
    ['Registration Fee', a.price != null ? acFmtFee(a) : 'No fee (Flying Display)'],
    ['Year of Registration', a.yearOfReg], ['Registered With Organisation', a.regWithOrg],
    ['Registered No.', a.regNo], ['Manufacturing Year', a.mfgYear],
    ['Aircraft Image', uploadLink(a.id, 'imageData', a.imageName), 'html'],
  ]));

  /* Form 2 — Air-7A */
  const d7 = a.air7a;
  const f2 = d7 ? formCard('Form 2 — Aircraft Arrival Detail (Air-7A)', d7.savedAt, kvGrid([
    ['Aircraft Type', d7.aircraftType],
    ['Last Intermediate Landing Prior to Airbase', d7.lastLanding],
    ['Date & ETA at Airbase', d7.eta], ['Departure Date & Time', d7.departure],
    ['Airfield of Departure', d7.depAirfield], ['First Landing in India', d7.firstLanding],
  ])) : pendingCard('Form 2 — Aircraft Arrival Detail (Air-7A)');

  /* Form 3 — Air-4 */
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

  /* Form 4 — AIR 7B & 9 */
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

  return head + f1 + f2 + f3 + f4 + footerTools();
}

function approveAircraft(id) {
  const ex = loadExState(); if (!ex) return;
  const a = ex.aircraft.find((x) => x.id === id); if (!a) return;
  if (!confirm('Approve application ' + (a.appNo || '') + ' (' + a.model + ')?\nThe registration fee ' + acFmtFee(a) + ' will be enabled for payment in the exhibitor’s cart.')) return;
  a.status = 'approved';
  a.approvedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  a.approvedBy = 'Organiser Admin';
  a.remark = '';
  saveExState(ex);
  render();
  toast('Application ' + (a.appNo || '') + ' approved — fee enabled for payment.', 'success');
}

function rejectAircraft(id) {
  const ex = loadExState(); if (!ex) return;
  const a = ex.aircraft.find((x) => x.id === id); if (!a) return;
  const remark = prompt('Reason for rejection (shown to the exhibitor):', '');
  if (remark === null) return;
  a.status = 'rejected';
  a.remark = remark.trim() || 'Rejected by committee';
  saveExState(ex);
  render();
  toast('Application ' + (a.appNo || '') + ' rejected.', 'error');
}

/* ============================================================
   Shared footer + boot
   ============================================================ */
function footerTools() {
  return '<div class="footer-tools"><button onclick="resetAdminDemo()">Reset to report data</button></div>';
}

document.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#/dashboard';
  render();
});
