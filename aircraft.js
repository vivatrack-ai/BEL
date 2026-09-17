/* ============================================================
   Evenuefy — Exhibitor · Aircraft Registration Module
   Separate menu. Four forms:
     1. Aircraft Detail (registers the aircraft; weight-based fee
        goes to the cart)
     2. Aircraft Arrival Detail (Form Air-7A)
     3. Flying Display (Form Air-4) — flying-display aircraft only
     4. DGCA Non-Schedule Flights approval (AIR 7B & AIR 9)
   Forms 2-4 auto-populate Model / Registration No. from Form 1.
   Loaded after app.js — shares S, render(), ROUTES, cart, toasts.
   ============================================================ */

'use strict';

const TERMS_PDF_URL = 'https://ancubatenew.sharepoint.com/:b:/s/BELDEF-Expo/IQA_DT5GPVXsToWxiAYzF9_4AcI8IOzD0cQN5qF2qeDvQeM?e=4rjiPj';

/* Aircraft Static Display — rates per aircraft depending on tonnage.
   (Official rate chart; applies ONLY to Static Display aircraft.) */
const STATIC_RATE_CHART = [
  { uptoTons: 1,        label: 'Upto 1 ton',    inr: 116000, usd: 2200 },
  { uptoTons: 3,        label: 'Upto 3 tons',   inr: 241000, usd: 4700 },
  { uptoTons: 10,       label: 'Upto 10 tons',  inr: 320000, usd: 6200 },
  { uptoTons: 25,       label: 'Upto 25 tons',  inr: 478000, usd: 9200 },
  { uptoTons: 40,       label: 'Upto 40 tons',  inr: 638000, usd: 12300 },
  { uptoTons: 60,       label: 'Upto 60 tons',  inr: 798000, usd: 15400 },
  { uptoTons: Infinity, label: 'Above 60 tons', inr: 814000, usd: 15700 },
];
const fmtUsd = (n) => '$' + Number(n).toLocaleString('en-US');
const fmtFee = (amount, currency) => currency === 'USD' ? fmtUsd(amount) : money(amount);

/* Participant type is identified automatically from the exhibitor's
   registered country — Indian companies are charged in INR, others in USD. */
function acftParticipant() { return EVENT.exhibitorCountry === 'India' ? 'Indian' : 'Foreign'; }

/* On validation failure, bring the first error into view so the
   user always sees why the form did not submit. */
function scrollToFirstError() {
  const f = document.querySelector('.field.invalid');
  if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Returns {amount, currency, slabLabel} for Static Display aircraft;
   null for Flying Display (this rate chart is static-display only). */
function aircraftPrice(weightKg, displayType, participant) {
  if (displayType !== 'Static Display') return null;
  const w = Number(weightKg);
  if (isNaN(w) || w <= 0) return null;
  const tons = w / 1000;
  const slab = STATIC_RATE_CHART.find((s) => tons <= s.uptoTons);
  return {
    amount: participant === 'Foreign' ? slab.usd : slab.inr,
    currency: participant === 'Foreign' ? 'USD' : 'INR',
    slabLabel: slab.label,
  };
}

const ROLL_TYPES = ['Barrel', 'Aileron', 'Slow', 'Flick'];
const MANOEUVRES = ['Gentle Manoeuvres', 'Loop', 'Steep Turns & Wing-Overs', 'Inverted Flight',
  'Barrel/Aileron/Slow/Roll(s)', 'Flick Roll(s)', 'Stall', 'Spin'];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'France', 'Germany', 'Russia',
  'Israel', 'Brazil', 'Japan', 'Australia', 'UAE', 'Singapore', 'Other'];

/* ---------------- State (migration for older saved data) ---------------- */
if (!S.aircraft) S.aircraft = [];
if (!S.seq.acft) S.seq.acft = 0;
if (!S.acftDrafts) S.acftDrafts = {};
// Older records predate the approval flow
S.aircraft.forEach((a) => { if (!a.status || a.status === 'payment_pending') a.status = 'draft'; });

function acftById(id) { return S.aircraft.find((a) => a.id === id); }

/* Step wizard: after saving any step, continue to the next form that
   is still pending for this aircraft (1 → 2 → 3 → 4 → My Aircraft). */
function gotoNextStep(a) {
  if (!a.air7a) { FORM_SEL.a7a = a.id; location.hash = '#/aircraft/air7a'; }
  else if (!a.air4) { FORM_SEL.a4 = a.id; location.hash = '#/aircraft/air4'; }
  else if (!a.air7b) { FORM_SEL.a7b = a.id; location.hash = '#/aircraft/air7b'; }
  else {
    // All 4 steps done -> application goes for committee approval
    // automatically (no manual submit needed from the exhibitor).
    if (a.status === 'draft' || a.status === 'rejected') {
      a.status = 'submitted';
      a.submittedForApprovalAt = nowStr();
      a.remark = '';
      save();
      toast('All steps completed — application ' + (a.appNo || '') + ' submitted for committee approval. Payment will open after approval.', 'success');
    }
    location.hash = '#/aircraft';
  }
  render();
}
function backToStep1(acftId) { ACFT_EDIT_ID = acftId; location.hash = '#/aircraft/add'; render(); }

/* ---------------- Invoice (after payment) ----------------
   Opens a print-ready invoice in a new window — use the browser's
   Print > Save as PDF to download it. */
function downloadInvoice(id) {
  const a = acftById(id);
  if (!a || a.status !== 'registered' || a.price == null) { toast('Invoice is available after payment.', 'error'); return; }
  const invNo = 'INV-' + (a.appNo || '').replace('ACR-', '');
  const fee = fmtFee(a.price, a.feeCurrency);
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + invNo + '</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#212B36;margin:0;padding:40px;font-size:14px}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2F62D8;padding-bottom:16px}' +
    '.logo{font-size:26px;font-weight:800;color:#2F62D8}' +
    'h1{font-size:20px;margin:0;text-align:right}' +
    '.muted{color:#6B7686;font-size:12px}' +
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
    '<div><h1>TAX INVOICE</h1><div class="muted right">Invoice No: <b>' + esc(invNo) + '</b><br>Date: ' + esc(a.paidAt || '') + '</div></div></div>' +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(EVENT.exhibitor) + '</b><br>' + esc(EVENT.exhibitorCountry) + '</div>' +
    '<div class="right"><div class="muted">APPLICATION</div><b>' + esc(a.appNo || '') + '</b><br><span class="stamp">PAID</span></div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount</th></tr>' +
    '<tr><td>Aircraft Registration — ' + esc(a.model) + ' (' + esc(a.make) + ')<br>' +
      '<span class="muted">Reg. No. ' + esc(a.regNo) + ' · ' + esc(a.displayType) + ' · ' + Number(a.weight).toLocaleString('en-IN') + ' kg · Static Display rate chart</span></td>' +
      '<td class="right">' + esc(fee) + '</td></tr>' +
    '<tr class="total"><td>Total (' + (a.feeCurrency === 'USD' ? 'USD' : 'INR, incl. GST') + ')</td><td class="right">' + esc(fee) + '</td></tr></table>' +
    '<div class="foot">This is a computer-generated invoice for the aircraft registration fee collected on behalf of the organiser. ' + esc(EVENT.name) + '.</div>' +
    '<div class="noprint"><button onclick="window.print()" style="background:#2F62D8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>' +
    '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the invoice.', 'error'); return; }
  w.document.write(html);
  w.document.close();
}
function backToStep(formKey, acftId, route) { FORM_SEL[formKey] = acftId; location.hash = route; render(); }

/* Live-refresh when the admin (another tab) approves/rejects */
window.addEventListener('storage', (e) => {
  if (e.key === LS_KEY) { S = load(); if (!S.acftDrafts) S.acftDrafts = {}; render(); }
});

/* Approval-based flow: the committee approves the application first,
   only then the registration fee goes to the cart for payment. */
/* Application status and payment status are shown SEPARATELY. */
function acftAppStatusPill(a) {
  if (a.status === 'draft') return '<span class="pill gray">Draft</span>';
  if (a.status === 'submitted') return '<span class="pill amber">Pending Approval</span>';
  if (a.status === 'approved' || a.status === 'registered') return '<span class="pill green">Approved</span>';
  if (a.status === 'rejected') return '<span class="pill red" title="' + esc(a.remark || '') + '">Rejected</span>';
  return '<span class="pill gray">' + esc(a.status) + '</span>';
}
function acftPayStatusPill(a) {
  if (a.status === 'registered') return '<span class="pill green">Paid</span>';
  if (a.status === 'approved') {
    return a.price != null
      ? '<span class="pill amber">Payment Pending</span>'
      : '<span class="pill gray">No Fee</span>';
  }
  return '<span style="color:var(--muted)">—</span>';
}

function syncApprovedFees() {
  let changed = false;
  S.aircraft.forEach((a) => {
    if (a.status === 'approved') {
      if (a.price == null) { a.status = 'registered'; changed = true; } // no fee (Flying Display)
      else if (!S.cart.some((i) => i.type === 'aircraft_reg' && i.refId === a.id)) {
        S.cart.push({
          id: uid('cart'), type: 'aircraft_reg', refId: a.id,
          label: 'Aircraft Registration — ' + a.model,
          sub: a.regNo + ' · approved by committee', amount: a.price, currency: a.feeCurrency,
        });
        changed = true;
      }
    }
  });
  if (changed) save();
}

/* ---------------- Draft auto-save (every step) ----------------
   Any change in a form is snapshotted to S.acftDrafts after 300ms,
   so a user who drops off mid-step never loses the data. The draft
   is restored on return and cleared on successful save. */
const ACFT_FORM_IDS = { af1: true, a7a: true, a4: true, a7b: true };
let __draftTimer = null;
document.addEventListener('input', acftDraftListener, true);
document.addEventListener('change', acftDraftListener, true);
function acftDraftListener(e) {
  const form = e.target && e.target.closest ? e.target.closest('form') : null;
  if (!form || !ACFT_FORM_IDS[form.id]) return;
  clearTimeout(__draftTimer);
  __draftTimer = setTimeout(() => snapshotDraft(form), 300);
}
function draftKeyFor(formId) {
  if (formId === 'af1') return 'af1:' + (ACFT_EDIT_ID || 'new');
  const selEl = $({ a7a: 'a7aAcft', a4: 'a4Acft', a7b: 'a7bAcft' }[formId]);
  return formId + ':' + (selEl ? selEl.value : 'x');
}
function snapshotDraft(form) {
  if (!form.isConnected) return; // view re-rendered meanwhile
  const key = draftKeyFor(form.id);
  const d = { __at: nowStr() };
  form.querySelectorAll('input[id], select[id], textarea[id]').forEach((el) => {
    if (el.type === 'file' || el.readOnly) return;
    d[el.id] = el.value;
  });
  form.querySelectorAll('input[type=radio]:checked').forEach((el) => { d['@' + el.name] = el.value; });
  form.querySelectorAll('input[type=checkbox][name]').forEach((el) => {
    d['#' + el.name] = d['#' + el.name] || [];
    if (el.checked) d['#' + el.name].push(el.value);
  });
  S.acftDrafts[key] = d;
  save();
  const h = $('draftHint'); if (h) h.textContent = 'Draft auto-saved · ' + d.__at;
}
function restoreDraft(formId) {
  const form = $(formId); if (!form) return;
  const d = S.acftDrafts[draftKeyFor(formId)];
  const h = $('draftHint');
  if (!d) { if (h) h.textContent = ''; return; }
  Object.keys(d).forEach((k) => {
    if (k === '__at') return;
    if (k[0] === '@') {
      const name = k.slice(1);
      const el = form.querySelector('input[name="' + name + '"][value="' + d[k] + '"]');
      if (el) {
        el.checked = true;
        form.querySelectorAll('input[name="' + name + '"]').forEach((r) => {
          const card = r.closest('.radio-card'); if (card) card.classList.toggle('selected', r.checked);
        });
      }
    } else if (k[0] === '#') {
      form.querySelectorAll('input[name="' + k.slice(1) + '"]').forEach((el) => {
        el.checked = d[k].indexOf(el.value) >= 0;
        const c = el.closest('.check-item'); if (c) c.classList.toggle('selected', el.checked);
      });
    } else if (k !== 'a7aAcft' && k !== 'a4Acft' && k !== 'a7bAcft') {
      const el = $(k); if (el && el.type !== 'file' && !el.readOnly) el.value = d[k];
    }
  });
  if (h) h.textContent = 'Draft restored (auto-saved ' + d.__at + ')';
  if (formId === 'af1' && typeof updateAf1Price === 'function') updateAf1Price();
  if (formId === 'a4') {
    const r = form.querySelector('input[name="a4Rolls"]:checked');
    if (r && $('a4RollTypes')) $('a4RollTypes').hidden = r.value !== 'Yes';
  }
}
function clearDraft(formId) { delete S.acftDrafts[draftKeyFor(formId)]; save(); }

/* ---------------- Routes & sidebar wiring ---------------- */
ROUTES['aircraft'] = viewAircraftList;
ROUTES['aircraft/add'] = viewAircraftForm1;
ROUTES['aircraft/air7a'] = viewAir7A;
ROUTES['aircraft/air4'] = viewAir4;
ROUTES['aircraft/air7b'] = viewAir7B;

function acftTabs(active) {
  const tabs = [
    ['aircraft', 'My Aircraft'],
    ['aircraft/add', 'Aircraft Detail (Form 1)'],
    ['aircraft/air7a', 'Arrival — Air-7A'],
    ['aircraft/air4', 'Flying Display — Air-4'],
    ['aircraft/air7b', 'DGCA — AIR 7B & 9'],
  ];
  return '<div class="filter-chips" style="margin-bottom:20px">' +
    tabs.map(([r, l]) =>
      '<a class="fchip' + (active === r ? ' on' : '') + '" style="text-decoration:none" href="#/' + r + '">' + l + '</a>').join('') +
    '</div>';
}

function acftHeader(active) {
  return '<h1 class="page-title">Aircraft Registration</h1>' +
    '<p class="page-sub">Register your aircraft for ' + EVENT.name + ', complete the arrival (Air-7A), flying display (Air-4) and DGCA (AIR 7B &amp; 9) forms, then submit for committee approval — payment opens after approval. ' +
    '<a href="' + TERMS_PDF_URL + '" target="_blank" rel="noopener">Terms &amp; Conditions (PDF)</a></p>' +
    acftTabs(active) +
    '<div id="draftHint" style="font-size:0.75rem;color:var(--muted);margin:-10px 0 12px;min-height:1em"></div>';
}

/* Options for "Select Aircraft" dropdowns (Form 1 models) */
function acftOptions(selectedId, flyingOnly) {
  const list = S.aircraft.filter((a) => !flyingOnly || a.displayType === 'Flying Display');
  return list.map((a) =>
    '<option value="' + a.id + '"' + (a.id === selectedId ? ' selected' : '') + '>' +
    esc(a.model) + ' (' + esc(a.make) + ')</option>').join('');
}

/* ============================================================
   VIEW · My Aircraft (list)
   ============================================================ */
function viewAircraftList() {
  syncApprovedFees(); // approved applications push their fee to the cart
  if (S.aircraft.length === 0) {
    return acftHeader('aircraft') +
      '<div class="card"><div class="empty"><span class="material-symbols-outlined">flight</span>' +
      '<h3>No aircraft registered yet</h3><p>Start with the Aircraft Detail form. The registration fee (based on aircraft weight) is added to your cart.</p>' +
      '<a class="btn btn-primary" href="#/aircraft/add"><span class="material-symbols-outlined">add</span>Register Aircraft</a>' +
      '</div></div>' + footerTools();
  }

  const formsDone = (a) =>
    // Form 1 is what created the application, so it is always complete
    '<span class="pill green">Form 1 ✓</span> ' +
    ['air7a', 'air4', 'air7b'].map((f) => {
      const labels = { air7a: 'Air-7A', air4: 'Air-4', air7b: '7B & 9' };
      return a[f]
        ? '<span class="pill green">' + labels[f] + ' ✓</span>'
        : '<span class="pill amber">' + labels[f] + ' pending</span>';
    }).join(' ');

  const actionsFor = (a) => {
    if (a.status === 'draft') return (
      '<button class="btn-link" style="color:var(--green)" onclick="gotoNextStep(acftById(\'' + a.id + '\'))">Continue</button>' +
      '<button class="btn-link" onclick="editAircraft(\'' + a.id + '\')">Edit</button>' +
      '<button class="btn-link danger" onclick="deleteAircraft(\'' + a.id + '\')">Delete</button>');
    if (a.status === 'rejected') return (
      '<button class="btn-link" onclick="editAircraft(\'' + a.id + '\')">Edit &amp; Resubmit</button>' +
      '<button class="btn-link danger" onclick="deleteAircraft(\'' + a.id + '\')">Delete</button>');
    if (a.status === 'approved' && a.price != null) return '<button class="btn-link" onclick="openCart()">Pay Now</button>';
    if (a.status === 'submitted') return '<span style="color:var(--muted);font-size:0.8rem">Awaiting committee</span>';
    if (a.status === 'registered' && a.price != null)
      return '<button class="btn-link" onclick="downloadInvoice(\'' + a.id + '\')"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">receipt_long</span> Invoice</button>';
    return '—';
  };

  const rows = S.aircraft.map((a, i) =>
    '<tr><td class="num">' + (i + 1) + '</td>' +
    '<td><span class="regno">' + esc(a.appNo || '—') + '</span></td>' +
    '<td><span class="td-strong">' + esc(a.model) + '</span>' +
      '<span class="td-sub">' + esc(a.make) + ' · ' + esc(a.usage) + ' · ' + esc(a.displayType) + '</span>' +
      '<span class="td-sub">' + Number(a.weight).toLocaleString('en-IN') + ' kg · <span class="regno">' + esc(a.regNo) + '</span></span></td>' +
    '<td class="money">' + (a.price != null ? fmtFee(a.price, a.feeCurrency) : '—') + '</td>' +
    '<td>' + acftAppStatusPill(a) + (a.status === 'rejected' && a.remark ? '<span class="td-sub" style="color:var(--red)">' + esc(a.remark) + '</span>' : '') + '</td>' +
    '<td>' + acftPayStatusPill(a) + '</td>' +
    '<td style="min-width:170px">' + formsDone(a) + '</td>' +
    '<td class="td-actions">' + actionsFor(a) + '</td></tr>').join('');

  const payPending = S.aircraft.filter((a) => a.status === 'approved' && a.price != null).length;
  const awaiting = S.aircraft.filter((a) => a.status === 'submitted').length;
  const banners =
    (payPending
      ? '<div class="note green"><b class="title">' + payPending + ' application(s) approved by the committee</b>' +
        'The registration fee is now in your cart — complete the payment to finish the registration.' +
        '<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCart()"><span class="material-symbols-outlined" style="font-size:16px">shopping_cart</span>Complete Payment</button></div>'
      : '') +
    (awaiting
      ? '<div class="note amber"><b class="title">' + awaiting + ' application(s) awaiting committee approval</b>' +
        'Payment will be enabled once the committee approves the application.</div>'
      : '');

  return acftHeader('aircraft') + banners +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">My Aircraft Applications</h2>' +
      '<a class="btn btn-primary" href="#/aircraft/add"><span class="material-symbols-outlined">add</span>New Application</a></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>Sr.</th><th>Application No.</th><th>Aircraft</th><th>Reg. Fee</th><th>Application Status</th><th>Payment Status</th><th>Forms</th><th>Action</th></tr>' +
    rows + '</table></div></div>' + footerTools();
}


let ACFT_EDIT_ID = null;
function editAircraft(id) { ACFT_EDIT_ID = id; location.hash = '#/aircraft/add'; render(); }
function deleteAircraft(id) {
  if (!confirm('Delete this aircraft and its forms?')) return;
  S.aircraft = S.aircraft.filter((a) => a.id !== id);
  S.cart = S.cart.filter((i) => !(i.type === 'aircraft_reg' && i.refId === id));
  save(); render();
  toast('Aircraft deleted', 'success');
}

/* ============================================================
   FORM 1 · Aircraft Detail
   ============================================================ */
function viewAircraftForm1() {
  const a = ACFT_EDIT_ID ? acftById(ACFT_EDIT_ID) : null;
  const v = (k) => a ? esc(a[k] != null ? a[k] : '') : '';

  const priceStrip = '<div class="quota-strip" id="af1PriceStrip"></div>';
  setTimeout(function () { restoreDraft('af1'); updateAf1Price(); }, 0);

  return acftHeader('aircraft/add') +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">' + (a ? 'Edit Aircraft Detail' : 'Aircraft Detail Form') + '</h2>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-outline btn-sm" onclick="openRateChart()"><span class="material-symbols-outlined" style="font-size:16px">receipt_long</span>View Rate Chart</button>' +
        (a ? '<button class="btn btn-outline btn-sm" onclick="ACFT_EDIT_ID=null;render()">Cancel Edit</button>' : '') +
      '</div></div>' +
    '<form id="af1" onsubmit="return submitAircraft(event)" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Aircraft Usage <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
        '<label class="radio-card' + (!a || a.usage === 'Civil' ? ' selected' : '') + '" onclick="pickRadio(this,\'af1Usage\')"><input type="radio" name="af1Usage" value="Civil"' + (!a || a.usage === 'Civil' ? ' checked' : '') + '><b>Civil</b></label>' +
        '<label class="radio-card' + (a && a.usage === 'Defence' ? ' selected' : '') + '" onclick="pickRadio(this,\'af1Usage\')"><input type="radio" name="af1Usage" value="Defence"' + (a && a.usage === 'Defence' ? ' checked' : '') + '><b>Defence</b></label>' +
        '</div></div>' +
      '<div class="field"><label>Type of Display <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
        '<label class="radio-card' + (!a || a.displayType === 'Static Display' ? ' selected' : '') + '" onclick="pickRadio(this,\'af1Disp\');setTimeout(updateAf1Price,0)"><input type="radio" name="af1Disp" value="Static Display"' + (!a || a.displayType === 'Static Display' ? ' checked' : '') + '><b>Static Display</b><small>Fee as per tonnage rate chart</small></label>' +
        '<label class="radio-card' + (a && a.displayType === 'Flying Display' ? ' selected' : '') + '" onclick="pickRadio(this,\'af1Disp\');setTimeout(updateAf1Price,0)"><input type="radio" name="af1Disp" value="Flying Display"' + (a && a.displayType === 'Flying Display' ? ' checked' : '') + '><b>Flying Display</b><small>No registration fee</small></label>' +
        '</div></div>' +
      '<div class="field"><label>Model of Aircraft <span class="req">*</span></label><input type="text" id="af1Model" value="' + v('model') + '" placeholder="e.g. Tejas Mk1A"><div class="error"></div></div>' +
      '<div class="field"><label>Make of Aircraft <span class="req">*</span></label><input type="text" id="af1Make" value="' + v('make') + '" placeholder="e.g. HAL"><div class="error"></div></div>' +
      '<div class="field"><label>Weight of Aircraft (kg) <span class="req">*</span></label><input type="number" id="af1Weight" min="1" value="' + v('weight') + '" oninput="updateAf1Price()"><div class="hint">Registration fee is calculated from the weight.</div><div class="error"></div></div>' +
      '<div class="field"><label>Year of Registration <span class="req">*</span></label><input type="text" id="af1YearReg" value="' + v('yearOfReg') + '" placeholder="e.g. 2024" maxlength="4" inputmode="numeric"><div class="error"></div></div>' +
      '<div class="field"><label>Registered With Organisation <span class="req">*</span></label><input type="text" id="af1Org" value="' + v('regWithOrg') + '" placeholder="e.g. DGCA / IAF"><div class="error"></div></div>' +
      '<div class="field"><label>Registered No. <span class="req">*</span></label><input type="text" id="af1RegNo" value="' + v('regNo') + '" placeholder="e.g. VT-XAB"><div class="error"></div></div>' +
      '<div class="field"><label>Manufacturing Year <span class="req">*</span></label><input type="text" id="af1MfgYear" value="' + v('mfgYear') + '" placeholder="e.g. 2023" maxlength="4" inputmode="numeric"><div class="error"></div></div>' +
      '<div class="field"><label>Aircraft Image <span class="req">*</span></label><input type="file" id="af1Image" accept="image/*">' +
        (a && a.imageName ? '<div class="hint">Uploaded: ' + esc(a.imageName) + ' (choose a file to replace)</div>' : '') + '<div class="error"></div></div>' +
    '</div>' +
    priceStrip +
    '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">' +
      '<a class="btn btn-outline" href="#/aircraft"><span class="material-symbols-outlined">arrow_back</span>Back — My Aircraft</a>' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">arrow_forward</span>' + (a ? 'Update & Continue' : 'Save & Continue') + '</button>' +
    '</div></form></div>' + footerTools();
}

/* Rate chart shown in a modal — keeps the form compact */
function openRateChart() {
  openModal('Aircraft Static Display — Rate Chart',
    '<p style="margin-top:0;color:var(--muted);font-size:0.86rem">Rates per aircraft depending on tonnage.</p>' +
    '<div class="tablewrap"><table class="grid">' +
      '<tr><th>Aircraft Weight</th><th>Indian Participants (in INR)</th><th>Foreign Participants (in USD)</th></tr>' +
      STATIC_RATE_CHART.map((s) =>
        '<tr><td>' + s.label + '</td><td class="num">' + Number(s.inr).toLocaleString('en-IN') + '</td><td class="num">' + Number(s.usd).toLocaleString('en-US') + '</td></tr>').join('') +
    '</table></div>' +
    '<div class="note" style="margin-bottom:0"><b class="title">Note</b>This rate chart applies only to <b>Static Display</b> aircraft. No registration fee is charged for Flying Display aircraft.</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Close</button>');
}

function pickRadio(card, groupName) {
  setTimeout(() => {
    document.querySelectorAll('input[name="' + groupName + '"]').forEach((inp) => {
      inp.closest('.radio-card').classList.toggle('selected', inp.checked);
    });
  }, 0);
}

function updateAf1Price() {
  const strip = $('af1PriceStrip'); if (!strip) return;
  const disp = document.querySelector('input[name="af1Disp"]:checked').value;
  const part = acftParticipant();
  if (disp === 'Flying Display') {
    strip.innerHTML = '<div>Flying Display aircraft — <b>no registration fee</b> (the rate chart applies to Static Display only).</div>';
    return;
  }
  const p = aircraftPrice($('af1Weight').value, disp, part);
  strip.innerHTML = p
    ? '<div>Slab: <b>' + p.slabLabel + '</b> · Registration Fee: <b>' + fmtFee(p.amount, p.currency) + '</b> — added to cart on submission. ' +
      '<span style="color:var(--muted)">(' + (part === 'Foreign' ? 'USD rate' : 'INR rate') + ' applied automatically — registered country: ' + esc(EVENT.exhibitorCountry) + ')</span></div>'
    : '<div>Enter the aircraft weight to see the registration fee (Static Display rate chart).</div>';
}

async function submitAircraft(e) {
  e.preventDefault();
  clearErrs();
  const editing = ACFT_EDIT_ID ? acftById(ACFT_EDIT_ID) : null;
  const model = $('af1Model').value.trim();
  const make = $('af1Make').value.trim();
  const weight = parseFloat($('af1Weight').value);
  const yearReg = $('af1YearReg').value.trim();
  const org = $('af1Org').value.trim();
  const regNo = $('af1RegNo').value.trim();
  const mfgYear = $('af1MfgYear').value.trim();
  const imgFile = $('af1Image').files[0];
  const YEAR_RE = /^(19|20)\d{2}$/;
  let ok = true;
  if (!model) { setErr('af1Model', 'Required'); ok = false; }
  if (!make) { setErr('af1Make', 'Required'); ok = false; }
  if (isNaN(weight) || weight <= 0) { setErr('af1Weight', 'Enter a valid weight in kg'); ok = false; }
  if (!yearReg) { setErr('af1YearReg', 'Required'); ok = false; }
  else if (!YEAR_RE.test(yearReg)) { setErr('af1YearReg', 'Enter a valid 4-digit year (e.g. 2024)'); ok = false; }
  if (!org) { setErr('af1Org', 'Required'); ok = false; }
  if (!regNo) { setErr('af1RegNo', 'Required'); ok = false; }
  if (!mfgYear) { setErr('af1MfgYear', 'Required'); ok = false; }
  else if (!YEAR_RE.test(mfgYear)) { setErr('af1MfgYear', 'Enter a valid 4-digit year (e.g. 2023)'); ok = false; }
  if (!editing && !imgFile) { setErr('af1Image', 'Upload the aircraft image'); ok = false; }
  if (!ok) { scrollToFirstError(); return false; }

  const usage = document.querySelector('input[name="af1Usage"]:checked').value;
  const displayType = document.querySelector('input[name="af1Disp"]:checked').value;
  const participant = acftParticipant(); // auto-identified from registered country
  const fee = aircraftPrice(weight, displayType, participant); // null for Flying Display

  clearDraft('af1'); // this step is now properly saved
  const imgData = imgFile ? await readUpload(imgFile) : null;

  if (editing) {
    Object.assign(editing, {
      usage: usage, model: model, make: make, displayType: displayType, weight: weight,
      participant: participant, yearOfReg: yearReg, regWithOrg: org, regNo: regNo, mfgYear: mfgYear,
      imageName: imgFile ? imgFile.name : editing.imageName,
      imageData: imgFile ? imgData : editing.imageData,
      price: fee ? fee.amount : null, feeCurrency: fee ? fee.currency : null,
    });
    // Editing is allowed only in Draft / Rejected — either way it goes
    // back to Draft and must be resubmitted for committee approval.
    editing.status = 'draft';
    editing.remark = '';
    ACFT_EDIT_ID = null;
    save();
    toast('Application ' + (editing.appNo || '') + ' updated.', 'success');
    gotoNextStep(editing); // continue with whichever step is still pending
  } else {
    const id = uid('acft');
    const appNo = 'ACR-2027-' + String(S.seq.acft).padStart(4, '0'); // unique per application
    S.aircraft.push({
      id: id, appNo: appNo, usage: usage, model: model, make: make, displayType: displayType, weight: weight,
      participant: participant, yearOfReg: yearReg, regWithOrg: org, regNo: regNo, mfgYear: mfgYear,
      imageName: imgFile.name, imageData: imgData,
      price: fee ? fee.amount : null, feeCurrency: fee ? fee.currency : null,
      status: 'draft',
      air7a: null, air4: null, air7b: null, createdAt: nowStr(),
    });
    save();
    toast('Application ' + appNo + ' created for "' + model + '"' +
      (fee ? ' (fee ' + fmtFee(fee.amount, fee.currency) + ' — payable after committee approval)' : '') +
      '. Next: Aircraft Arrival Detail (Air-7A).', 'success');
    // Step 1 done -> straight to step 2 (Air-7A) with this aircraft selected
    gotoNextStep(acftById(id));
  }
  return false;
}

/* ============================================================
   Shared helpers for forms 2-4
   ============================================================ */
/* Per-form aircraft selection. Changing the dropdown re-renders the
   form with that aircraft's saved data + auto-populated Reg No. */
const FORM_SEL = { a7a: null, a4: null, a7b: null };
function selAcft(key, val) { FORM_SEL[key] = val; render(); }

function acftSelectField(id, selectedId, flyingOnly, formKey) {
  const opts = acftOptions(selectedId, flyingOnly);
  if (!opts) return null;
  return '<div class="field"><label>Select Aircraft <span class="req">*</span></label>' +
    '<select id="' + id + '" onchange="selAcft(\'' + formKey + '\', this.value)">' + opts + '</select>' +
    '<div class="hint">Model auto-populated from the Aircraft Detail form.</div><div class="error"></div></div>';
}
function resolveSel(key, list) {
  const cur = FORM_SEL[key];
  if (cur && list.some((a) => a.id === cur)) return cur;
  // Default to the aircraft the exhibitor is currently working on:
  // the most recent application whose THIS form is still pending —
  // never blindly the first application.
  const formKey = { a7a: 'air7a', a4: 'air4', a7b: 'air7b' }[key];
  const pending = [...list].reverse().find((a) => !a[formKey] && (a.status === 'draft' || a.status === 'rejected'));
  return (pending || list[list.length - 1]).id;
}

/* Read an uploaded file as a data URL so the admin can open it in the
   application detail view. Files above 2 MB keep only their name. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
function readUpload(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      toast('"' + file.name + '" is larger than 2 MB — name saved, preview will not be available.', 'error');
      return resolve(null);
    }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}
function noAircraftCard(tab) {
  return acftHeader(tab) +
    '<div class="card"><div class="empty"><span class="material-symbols-outlined">flight</span>' +
    '<h3>Register an aircraft first</h3><p>This form auto-populates from the Aircraft Detail form.</p>' +
    '<a class="btn btn-primary" href="#/aircraft/add"><span class="material-symbols-outlined">add</span>Register Aircraft</a></div></div>' + footerTools();
}

/* ============================================================
   FORM 2 · Aircraft Arrival Detail (Form Air-7A)
   ============================================================ */
function viewAir7A() {
  if (S.aircraft.length === 0) return noAircraftCard('aircraft/air7a');
  const selId = resolveSel('a7a', S.aircraft);
  const first = acftById(selId);
  const d = first.air7a || {};
  const dv = (k) => esc(d[k] || '');
  // Stored as "YYYY-MM-DD HH:MM" — split for the date + time inputs
  const dtSplit = (val) => { const p = String(val || '').split(/[T ]/); return [p[0] || '', p[1] || '']; };
  const [etaD, etaT] = dtSplit(d.eta);
  const [depD, depT] = dtSplit(d.departure);
  const dtPair = (label, dId, tId, dVal, tVal) =>
    '<div class="field"><label>' + label + ' <span class="req">*</span></label>' +
    '<div style="display:flex;gap:10px">' +
      '<input type="date" id="' + dId + '" value="' + dVal + '" style="flex:1.3">' +
      '<input type="time" id="' + tId + '" value="' + tVal + '" style="flex:1">' +
    '</div><div class="error"></div></div>';
  setTimeout(function () { restoreDraft('a7a'); }, 0);

  return acftHeader('aircraft/air7a') +
    '<div class="card"><h2 class="card-title">Aircraft Arrival Detail (Form Air-7A)</h2>' +
    '<form id="a7a" onsubmit="return submitAir7A(event)" novalidate>' +
    '<div class="form-grid">' +
      acftSelectField('a7aAcft', selId, false, 'a7a') +
      '<div class="field"><label>Aircraft Registration No.</label><input type="text" data-auto="regno" value="' + esc(first.regNo) + '" readonly><div class="hint">Auto-populated from the Aircraft Detail form.</div></div>' +
      '<div class="field"><label>Aircraft Type <span class="req">*</span></label><input type="text" id="a7aType" data-auto="type" value="' + dv('aircraftType') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Last Intermediate Landing Prior to Airbase <span class="req">*</span></label><input type="text" id="a7aLastLanding" value="' + dv('lastLanding') + '" placeholder="e.g. Jaipur (VIJP)"><div class="error"></div></div>' +
      dtPair('Date &amp; ETA at Airbase', 'a7aEtaDate', 'a7aEtaTime', etaD, etaT) +
      dtPair('Departure Date &amp; Time', 'a7aDepDate', 'a7aDepTime', depD, depT) +
      '<div class="field"><label>Airfield of Departure <span class="req">*</span></label><input type="text" id="a7aDepField" value="' + dv('depAirfield') + '"><div class="error"></div></div>' +
      '<div class="field"><label>First Landing in India <span class="req">*</span></label><input type="text" id="a7aFirstLanding" value="' + dv('firstLanding') + '"><div class="error"></div></div>' +
    '</div>' +
    '<p style="color:var(--red);font-size:0.88rem;margin:18px 0 0;max-width:none"><b>Declaration:</b> We hereby agree to pay the landing &amp; parking fee for the above mentioned aircraft directly to organisers who collect these fees on behalf of the Official Ground Handling Agency.</p>' +
    '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="btn btn-outline" type="button" onclick="backToStep1(\'' + selId + '\')"><span class="material-symbols-outlined">arrow_back</span>Back — Aircraft Detail</button>' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">save</span>' + (d.aircraftId ? 'Update & Continue' : 'Save & Continue') + '</button>' +
    '</div></form></div>' + footerTools();
}

function submitAir7A(e) {
  e.preventDefault();
  clearErrs();
  const acftId = $('a7aAcft').value;
  const fields = { aircraftType: 'a7aType', lastLanding: 'a7aLastLanding', depAirfield: 'a7aDepField', firstLanding: 'a7aFirstLanding' };
  const data = { aircraftId: acftId };
  let ok = true;
  Object.keys(fields).forEach((k) => {
    const val = $(fields[k]).value.trim();
    if (!val) { setErr(fields[k], 'Required'); ok = false; }
    data[k] = val;
  });
  // Date + time pairs
  const etaD = $('a7aEtaDate').value, etaT = $('a7aEtaTime').value;
  const depD = $('a7aDepDate').value, depT = $('a7aDepTime').value;
  if (!etaD || !etaT) { setErr('a7aEtaDate', 'Select both date and time'); ok = false; }
  if (!depD || !depT) { setErr('a7aDepDate', 'Select both date and time'); ok = false; }
  if (!ok) { scrollToFirstError(); return false; }
  data.eta = etaD + ' ' + etaT;
  data.departure = depD + ' ' + depT;
  data.savedAt = nowStr();
  clearDraft('a7a');
  const a = acftById(acftId);
  a.air7a = data;
  save();
  toast('Form Air-7A saved for ' + a.model + ' — next step.', 'success');
  gotoNextStep(a);
  return false;
}

/* ============================================================
   FORM 3 · Flying Display (Form Air-4)
   ============================================================ */
function viewAir4() {
  if (S.aircraft.length === 0) return noAircraftCard('aircraft/air4');
  const selId = resolveSel('a4', S.aircraft);
  const first = acftById(selId);
  const d = first.air4 || {};
  const dv = (k) => esc(d[k] || '');
  setTimeout(function () { restoreDraft('a4'); }, 0);
  const hrsOpts = Array.from({ length: 13 }, (_, i) => '<option' + (d.endHrs == i ? ' selected' : '') + '>' + i + '</option>').join('');
  const minOpts = [0, 15, 30, 45].map((m) => '<option' + (d.endMin == m ? ' selected' : '') + '>' + m + '</option>').join('');
  const rollsYes = d.rollsAllowed === 'Yes';

  return acftHeader('aircraft/air4') +
    '<div class="card"><h2 class="card-title">Flying Display (Form Air-4)</h2>' +
    '<form id="a4" onsubmit="return submitAir4(event)" novalidate>' +
    '<div class="form-grid">' +
      acftSelectField('a4Acft', selId, false, 'a4') +
      '<div class="field"><label>Reg No. <span class="req">*</span></label><input type="text" data-auto="regno" value="' + esc(first.regNo) + '" readonly><div class="hint">Auto-populated from the Aircraft Detail form.</div></div>' +
      '<div class="field full"><label>Are consecutive rolls allowed? <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
        '<label class="radio-card' + (rollsYes ? ' selected' : '') + '" onclick="pickRadio(this,\'a4Rolls\');toggleRollTypes()"><input type="radio" name="a4Rolls" value="Yes"' + (rollsYes ? ' checked' : '') + '><b>Yes</b></label>' +
        '<label class="radio-card' + (!rollsYes ? ' selected' : '') + '" onclick="pickRadio(this,\'a4Rolls\');toggleRollTypes()"><input type="radio" name="a4Rolls" value="No"' + (!rollsYes ? ' checked' : '') + '><b>No</b></label>' +
        '</div></div>' +
      '<div class="field full" id="a4RollTypes"' + (rollsYes ? '' : ' hidden') + '><label>If yes, please select which one(s)</label>' +
        '<div class="checks">' + ROLL_TYPES.map((rt, i) =>
          '<label class="check-item' + (d.rollTypes && d.rollTypes.includes(rt) ? ' selected' : '') + '" onclick="tickCheck(this)"><input type="checkbox" name="a4RollType" value="' + rt + '"' + (d.rollTypes && d.rollTypes.includes(rt) ? ' checked' : '') + '>' + rt + '</label>').join('') +
        '</div></div>' +
      '<div class="field"><label>Upload Manoeuvres <span class="req">*</span></label><input type="file" id="a4Manoeuvres" accept=".pdf,image/*">' +
        (d.manoeuvresFile ? '<div class="hint">Uploaded: ' + esc(d.manoeuvresFile) + '</div>' : '') + '<div class="error"></div></div>' +
      '<div class="field"><label>Certificate Type <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
        '<label class="radio-card' + (d.certType !== 'Restricted' ? ' selected' : '') + '" onclick="pickRadio(this,\'a4Cert\')"><input type="radio" name="a4Cert" value="Normal"' + (d.certType !== 'Restricted' ? ' checked' : '') + '><b>Normal</b></label>' +
        '<label class="radio-card' + (d.certType === 'Restricted' ? ' selected' : '') + '" onclick="pickRadio(this,\'a4Cert\')"><input type="radio" name="a4Cert" value="Restricted"' + (d.certType === 'Restricted' ? ' checked' : '') + '><b>Restricted</b></label>' +
        '</div></div>' +
      '<div class="field"><label>Issued By <span class="req">*</span></label><input type="text" id="a4IssuedBy" value="' + dv('issuedBy') + '"><div class="error"></div></div>' +
      '<div class="field full"><label>Stated Restrictions <span class="req">*</span></label><textarea id="a4Restrictions" rows="3" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.9rem">' + dv('restrictions') + '</textarea><div class="error"></div></div>' +
      '<div class="field"><label>Certificate No. <span class="req">*</span></label><input type="text" id="a4CertNo" value="' + dv('certNo') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Valid Upto <span class="req">*</span></label><input type="date" id="a4ValidUpto" value="' + dv('validUpto') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Call Sign <span class="req">*</span></label><input type="text" id="a4CallSign" value="' + dv('callSign') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Estimated Safe Endurance at Take Off Display <span class="req">*</span></label>' +
        '<div style="display:flex;gap:10px"><select id="a4EndHrs" style="flex:1;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit">' + hrsOpts + '</select><span style="align-self:center;font-size:0.8rem;color:var(--muted)">Hrs</span>' +
        '<select id="a4EndMin" style="flex:1;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit">' + minOpts + '</select><span style="align-self:center;font-size:0.8rem;color:var(--muted)">Min</span></div></div>' +
      '<div class="field full"><label>Air Display Manoeuvres <span class="req">*</span></label>' +
        '<div class="checks">' + MANOEUVRES.map((m) =>
          '<label class="check-item' + (d.manoeuvres && d.manoeuvres.includes(m) ? ' selected' : '') + '" onclick="tickCheck(this)"><input type="checkbox" name="a4Man" value="' + esc(m) + '"' + (d.manoeuvres && d.manoeuvres.includes(m) ? ' checked' : '') + '>' + esc(m) + '</label>').join('') +
        '</div><div class="error" id="a4ManErr" style="display:none;color:var(--red);font-size:0.75rem;font-weight:600;margin-top:4px">Select at least one manoeuvre</div></div>' +
    '</div>' +
    '<h3 style="margin:22px 0 8px">Fine Weather</h3>' +
    '<div class="form-grid">' +
      '<div class="field full"><label>Description</label><textarea id="a4FineDesc" rows="2" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.9rem">' + dv('fineDesc') + '</textarea></div>' +
      '<div class="field"><label>Minimum Required Cloud Base</label><input type="text" id="a4FineBase" value="' + dv('fineBase') + '" placeholder="e.g. 1500 ft"></div>' +
      '<div class="field"><label>Minimum Required Cloud Visibility</label><input type="text" id="a4FineVis" value="' + dv('fineVis') + '" placeholder="e.g. 5 km"></div>' +
    '</div>' +
    '<h3 style="margin:22px 0 8px">Bad Weather</h3>' +
    '<div class="form-grid">' +
      '<div class="field full"><label>Description</label><textarea id="a4BadDesc" rows="2" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.9rem">' + dv('badDesc') + '</textarea></div>' +
      '<div class="field"><label>Minimum Required Cloud Base</label><input type="text" id="a4BadBase" value="' + dv('badBase') + '"></div>' +
      '<div class="field"><label>Minimum Required Cloud Visibility</label><input type="text" id="a4BadVis" value="' + dv('badVis') + '"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="btn btn-outline" type="button" onclick="backToStep(\'a7a\',\'' + selId + '\',\'#/aircraft/air7a\')"><span class="material-symbols-outlined">arrow_back</span>Back — Air-7A</button>' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">save</span>' + (d.aircraftId ? 'Update & Continue' : 'Save & Continue') + '</button>' +
    '</div></form></div>' + footerTools();
}

function toggleRollTypes() {
  setTimeout(() => {
    const yes = document.querySelector('input[name="a4Rolls"]:checked').value === 'Yes';
    $('a4RollTypes').hidden = !yes;
  }, 0);
}
function tickCheck(label) {
  setTimeout(() => { label.classList.toggle('selected', label.querySelector('input').checked); }, 0);
}

async function submitAir4(e) {
  e.preventDefault();
  clearErrs();
  $('a4ManErr').style.display = 'none';
  const acftId = $('a4Acft').value;
  const a = acftById(acftId);
  const existing = a.air4 || {};
  const req = { issuedBy: 'a4IssuedBy', restrictions: 'a4Restrictions', certNo: 'a4CertNo', validUpto: 'a4ValidUpto', callSign: 'a4CallSign' };
  const data = { aircraftId: acftId };
  let ok = true;
  Object.keys(req).forEach((k) => {
    const val = $(req[k]).value.trim();
    if (!val) { setErr(req[k], 'Required'); ok = false; }
    data[k] = val;
  });
  const manFile = $('a4Manoeuvres').files[0];
  if (!manFile && !existing.manoeuvresFile) { setErr('a4Manoeuvres', 'Upload the manoeuvres document'); ok = false; }
  const mans = [...document.querySelectorAll('input[name="a4Man"]:checked')].map((c) => c.value);
  if (mans.length === 0) { $('a4ManErr').style.display = 'block'; ok = false; }
  if (!ok) { scrollToFirstError(); return false; }

  data.rollsAllowed = document.querySelector('input[name="a4Rolls"]:checked').value;
  data.rollTypes = data.rollsAllowed === 'Yes' ? [...document.querySelectorAll('input[name="a4RollType"]:checked')].map((c) => c.value) : [];
  data.manoeuvresFile = manFile ? manFile.name : existing.manoeuvresFile;
  data.manoeuvresData = manFile ? await readUpload(manFile) : existing.manoeuvresData;
  data.certType = document.querySelector('input[name="a4Cert"]:checked').value;
  data.endHrs = $('a4EndHrs').value; data.endMin = $('a4EndMin').value;
  data.manoeuvres = mans;
  data.fineDesc = $('a4FineDesc').value.trim(); data.fineBase = $('a4FineBase').value.trim(); data.fineVis = $('a4FineVis').value.trim();
  data.badDesc = $('a4BadDesc').value.trim(); data.badBase = $('a4BadBase').value.trim(); data.badVis = $('a4BadVis').value.trim();
  data.savedAt = nowStr();
  clearDraft('a4');
  a.air4 = data;
  save();
  toast('Form Air-4 saved for ' + a.model + ' — next step.', 'success');
  gotoNextStep(a);
  return false;
}

/* ============================================================
   FORM 4 · DGCA Non-Schedule Flights (AIR 7B & AIR 9)
   ============================================================ */
function viewAir7B() {
  if (S.aircraft.length === 0) return noAircraftCard('aircraft/air7b');
  const selId = resolveSel('a7b', S.aircraft);
  const first = acftById(selId);
  const d = first.air7b || {};
  setTimeout(function () { restoreDraft('a7b'); }, 0);
  const dv = (k) => esc(d[k] || '');
  const ta = (id, val, rows) => '<textarea id="' + id + '" rows="' + (rows || 2) + '" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.9rem">' + val + '</textarea>';
  const yesNo = (name, val) =>
    '<div class="radio-cards">' +
    '<label class="radio-card' + (val === 'Yes' ? ' selected' : '') + '" onclick="pickRadio(this,\'' + name + '\')"><input type="radio" name="' + name + '" value="Yes"' + (val === 'Yes' ? ' checked' : '') + '><b>Yes</b></label>' +
    '<label class="radio-card' + (val !== 'Yes' ? ' selected' : '') + '" onclick="pickRadio(this,\'' + name + '\')"><input type="radio" name="' + name + '" value="No"' + (val !== 'Yes' ? ' checked' : '') + '><b>No</b></label>' +
    '</div>';
  const countryOpts = (sel) => COUNTRIES.map((c) => '<option' + (sel === c ? ' selected' : '') + '>' + c + '</option>').join('');

  return acftHeader('aircraft/air7b') +
    '<div class="card"><h2 class="card-title">Application for DGCA Approval of Non-Schedule Flights (AIR 7B &amp; AIR 9)</h2>' +
    '<form id="a7b" onsubmit="return submitAir7B(event)" novalidate>' +
    '<div class="form-grid">' +
      '<div class="field full"><label>Purpose of Flights (VIP / Tourist / Cargo / Ambulance / Relief etc.) <span class="req">*</span></label><input type="text" id="bPurpose" data-fid="purpose" value="' + dv('purpose') + '"><div class="error"></div></div>' +
      '<div class="field full"><label>Whether over-flying / technical landing or landing in India for traffic purpose</label><input type="text" id="bOverfly" value="' + dv('overfly') + '"></div>' +
      '<div class="field full"><label>ATS Route(s) to be flown (incl. entry and exit points in India with time entering/exiting Indian airspace)</label>' + ta('bAts', dv('atsRoutes')) + '</div>' +
      '<div class="field full"><label>Complete route itinerary of the flights with dates and timings (incl. true origin and true destination)</label>' + ta('bItinerary', dv('itinerary')) + '</div>' +
      '<div class="field"><label>Arrival and departure timings at airports in India, if any</label><input type="text" id="bTimings" value="' + dv('timings') + '"></div>' +
      '<div class="field"><label>Airport of last departure before entering Indian airspace / first landing after leaving</label><input type="text" id="bLastAirport" value="' + dv('lastAirport') + '"></div>' +
      acftSelectField('a7bAcft', selId, false, 'a7b') +
      '<div class="field"><label>Registration</label><input type="text" data-auto="regno" value="' + esc(first.regNo) + '" readonly><div class="hint">Auto-populated from the Aircraft Detail form.</div></div>' +
      '<div class="field"><label>Type <span class="req">*</span></label><input type="text" id="bType" data-auto="type" value="' + dv('type') + '"><div class="error"></div></div>' +
      '<div class="field"><label>State of Registry / Nationality <span class="req">*</span></label><select id="bStateReg">' + countryOpts(d.stateOfRegistry || 'India') + '</select><div class="error"></div></div>' +
      '<div class="field"><label>Telephony Designator (Flight Number or Call Sign)</label><input type="text" id="bTelephony" value="' + dv('telephony') + '"></div>' +
      '<div class="field"><label>Whether the aircraft is capable of air-dropping</label>' + yesNo('bAirdrop', d.airdrop) + '</div>' +
      '<div class="field"><label>Whether the max certified passenger seating capacity is more than 30 seats</label>' + yesNo('bSeats', d.seats30) + '</div>' +
      '<div class="field"><label>Whether the maximum pay-load capacity is more than 3 tons</label>' + yesNo('bPayload', d.payload3t) + '</div>' +
      '<div class="field"><label>Whether the aircraft is fitted with ACAS-II / TCAS-II</label>' + yesNo('bAcas', d.acas) + '</div>' +
      '<div class="field"><label>Whether noise certificate available</label>' + yesNo('bNoise', d.noiseCert) + '</div>' +
      '<div class="field"><label>Pilot Name <span class="req">*</span></label><input type="text" id="bPilot" value="' + dv('pilotName') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Pilot Nationality</label><select id="bPilotNat">' + countryOpts(d.pilotNat || 'India') + '</select></div>' +
      '<div class="field"><label>Aircraft Operator Name <span class="req">*</span></label><input type="text" id="bOperator" value="' + dv('operatorName') + '"><div class="error"></div></div>' +
      '<div class="field"><label>Operator Nationality</label><select id="bOperatorNat">' + countryOpts(d.operatorNat || 'India') + '</select></div>' +
      '<div class="field full"><label>Address (with Telephone / Fax No.)</label>' + ta('bAddress', dv('address')) + '</div>' +
    '</div>' +

    '<h3 style="margin:22px 0 8px">Onboard Details</h3>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Aircraft operator\'s certificate / permit number, if any</label><input type="text" id="bPermitNo" value="' + dv('permitNo') + '"></div>' +
      '<div class="field"><label>Number of Crew</label><input type="number" id="bCrew" min="0" value="' + dv('crew') + '"></div>' +
      '<div class="field"><label>Number of passengers, if any</label><input type="number" id="bPax" min="0" value="' + dv('passengers') + '"></div>' +
      '<div class="field"><label>General description of goods carried, if any</label><input type="text" id="bGoods" value="' + dv('goods') + '"></div>' +
      '<div class="field full"><label>Any arms, ammunition, explosives, radioactive material, war equipment or dangerous goods? If so, attach a copy of DGCA permit.</label><input type="file" id="bDangerPermit" accept=".pdf,image/*">' + (d.dangerPermitFile ? '<div class="hint">Uploaded: ' + esc(d.dangerPermitFile) + '</div>' : '') + '</div>' +
      '<div class="field full"><label>Any special equipment like aerial photography, remote sensing cameras, night vision cameras on board? If so, attach a copy of DGCA permit.</label><input type="file" id="bSpecialPermit" accept=".pdf,image/*">' + (d.specialPermitFile ? '<div class="hint">Uploaded: ' + esc(d.specialPermitFile) + '</div>' : '') + '</div>' +
      '<div class="field"><label>Number of passengers or tonnage of cargo to be uplifted from and set down in India</label><input type="text" id="bUplift" value="' + dv('uplift') + '"></div>' +
      '<div class="field"><label>Number of Crew (uplift)</label><input type="number" id="bCrew2" min="0" value="' + dv('crew2') + '"></div>' +
      '<div class="field full"><label>Address (with Telephone / Fax No.)</label>' + ta('bAddress2', dv('address2')) + '</div>' +
    '</div>' +

    '<h3 style="margin:22px 0 8px">Travel / Cargo Agent in India</h3>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Name</label><input type="text" id="bAgentName" value="' + dv('agentName') + '"></div>' +
      '<div class="field full"><label>Address (with Telephone / Fax No.)</label>' + ta('bAgentAddr', dv('agentAddr')) + '</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="btn btn-outline" type="button" onclick="backToStep(\'a4\',\'' + selId + '\',\'#/aircraft/air4\')"><span class="material-symbols-outlined">arrow_back</span>Back — Air-4</button>' +
      '<button class="btn btn-primary" type="submit"><span class="material-symbols-outlined">check_circle</span>' + (d.aircraftId ? 'Update & Finish' : 'Save & Submit Application') + '</button>' +
    '</div></form></div>' + footerTools();
}

async function submitAir7B(e) {
  e.preventDefault();
  clearErrs();
  const acftId = $('a7bAcft').value;
  const a = acftById(acftId);
  const existing = a.air7b || {};
  const purposeEl = document.querySelector('[data-fid="purpose"]');
  let ok = true;
  const reqVals = { type: 'bType', pilotName: 'bPilot', operatorName: 'bOperator' };
  const data = { aircraftId: acftId };
  if (!purposeEl.value.trim()) { purposeEl.closest('.field').classList.add('invalid'); purposeEl.closest('.field').querySelector('.error').textContent = 'Required'; ok = false; }
  data.purpose = purposeEl.value.trim();
  Object.keys(reqVals).forEach((k) => {
    const val = $(reqVals[k]).value.trim();
    if (!val) { setErr(reqVals[k], 'Required'); ok = false; }
    data[k] = val;
  });
  if (!ok) { scrollToFirstError(); return false; }

  ['overfly:bOverfly', 'atsRoutes:bAts', 'itinerary:bItinerary', 'timings:bTimings', 'lastAirport:bLastAirport',
   'telephony:bTelephony', 'address:bAddress', 'permitNo:bPermitNo', 'crew:bCrew', 'passengers:bPax',
   'goods:bGoods', 'uplift:bUplift', 'crew2:bCrew2', 'address2:bAddress2', 'agentName:bAgentName', 'agentAddr:bAgentAddr']
    .forEach((pair) => { const [k, id] = pair.split(':'); data[k] = $(id).value.trim(); });
  data.stateOfRegistry = $('bStateReg').value;
  data.pilotNat = $('bPilotNat').value;
  data.operatorNat = $('bOperatorNat').value;
  ['airdrop:bAirdrop', 'seats30:bSeats', 'payload3t:bPayload', 'acas:bAcas', 'noiseCert:bNoise']
    .forEach((pair) => { const [k, name] = pair.split(':'); data[k] = document.querySelector('input[name="' + name + '"]:checked').value; });
  const dFile = $('bDangerPermit').files[0];
  const sFile = $('bSpecialPermit').files[0];
  data.dangerPermitFile = dFile ? dFile.name : existing.dangerPermitFile || '';
  data.dangerPermitData = dFile ? await readUpload(dFile) : existing.dangerPermitData;
  data.specialPermitFile = sFile ? sFile.name : existing.specialPermitFile || '';
  data.specialPermitData = sFile ? await readUpload(sFile) : existing.specialPermitData;
  data.savedAt = nowStr();
  clearDraft('a7b');
  a.air7b = data;
  save();
  toast('AIR 7B & 9 saved for ' + a.model + '.', 'success');
  gotoNextStep(a); // all steps done -> auto-submits for committee approval
  return false;
}
