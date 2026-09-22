/* ============================================================
   Evenuefy — Exhibitor Profile module
   Tabs: Company Info · Authorized Contacts · Billing & Bank Info ·
         Documents · Business Profile   (+ Setup Progress rail)
   Persists inside the shared exhibitor state (S.profile).
   ============================================================ */

'use strict';

/* ---------------- state seed / migration ---------------- */
(function migrateProfile() {
  if (!S.profile) {
    S.profile = {
      tagline: 'Aerospace & defence manufacturing — fighter aircraft, helicopters, engines & avionics.',
      company: {
        businessType: 'Aerospace & Defence Manufacturing',
        email: 'exhibitions@hal-india.co.in',
        phone: '+91 80 2232 0001',
        website: 'www.hal-india.co.in',
      },
      compliance: { msme: 'No', udyam: '', selfCert: 'No', pan: 'AAACH3178Q', gst: '29AAACH3178Q1ZG' },
      regAddress: {
        building: '15/1, Cubbon Road', landmark: 'Near Minsk Square',
        city: 'Bengaluru', state: 'Karnataka', postal: '560001', country: 'India',
      },
      contacts: {
        director: { fullName: 'D K Sunil', email: 'cmd@hal-india.co.in', phone: '+91 80 2232 0114', designation: 'Chairman & Managing Director' },
        primary: { first: 'Nikhil', last: 'Sharma', designation: 'GM — Exhibitions', email: 'nikhil.sharma@hal-india.co.in', phone: '+91 98450 11223', alt: '' },
        show: { first: '', last: '', designation: '', email: '', phone: '', alt: '' },
        account: { first: '', last: '', designation: '', email: '', phone: '', alt: '' },
      },
      billing: {
        building: '15/1, Cubbon Road', landmark: 'Near Minsk Square',
        city: 'Bengaluru', state: 'Karnataka', postal: '560001', country: 'India',
      },
      bank: { acNo: '', bankName: '', branch: '', ifsc: '', beneficiary: '', address: '', chequeFile: '', chequeAt: '' },
      documents: [
        { id: 'doc_pan', name: 'PAN Card', file: 'HAL-PAN.pdf', at: '18 Sept 2026' },
        { id: 'doc_gst', name: 'GST Certificate', file: 'HAL-GST-Certificate.pdf', at: '18 Sept 2026' },
        { id: 'doc_cheque', name: 'Cancelled Cheque', file: '', at: '' },
        { id: 'doc_reg', name: 'Company Registration Certificate', file: '', at: '' },
        { id: 'doc_msme', name: 'MSME / Udyam Certificate (if applicable)', file: '', at: '' },
      ],
      business: {
        primary: 'Aerospace & Defence',
        secondary: ['Avionics', 'MRO Services'],
        types: ['Manufacturer'],
        targets: ['Global', 'South Asia'],
        overview: 'Hindustan Aeronautics Limited (HAL) is an Indian public-sector aerospace and defence company headquartered in Bengaluru. HAL designs, manufactures and services fighter aircraft, helicopters, aero-engines and avionics for the Indian armed forces and export customers.',
        capabilities: ['Fighter Aircraft', 'Helicopters', 'Aero Engines'],
        products: [
          { id: 'prod_1', name: 'LCA Tejas Mk1A', category: 'Fighter Aircraft', desc: '4.5-generation multirole light fighter with AESA radar and advanced EW suite.', areas: ['Defence'], images: [], brochure: '' },
        ],
      },
    };
    save();
  }
  // Migration: bank detail form fields added later (per revised design)
  const bk = S.profile.bank;
  ['beneficiary', 'address', 'chequeFile', 'chequeAt'].forEach((k) => { if (bk[k] === undefined) bk[k] = ''; });
  // Migration: organiser approval of the company profile. Once approved,
  // documents uploaded at registration time are LOCKED (no replace) —
  // only still-pending documents may be uploaded.
  if (S.profile.approved === undefined) { S.profile.approved = true; S.profile.approvedAt = '19 Sept 2026'; }
})();

/* ---------------- progress math ---------------- */
function pctOf(filled, total) { return total ? Math.round((filled / total) * 100) : 0; }
function countFilled(obj, keys) { return keys.filter((k) => String(obj[k] || '').trim() !== '').length; }

function profileSectionPct(section) {
  const P = S.profile;
  if (section === 'company') {
    const a = countFilled(P.company, ['businessType', 'email', 'phone', 'website']);
    const b = countFilled(P.compliance, ['msme', 'udyam', 'selfCert', 'pan', 'gst']);
    const c = countFilled(P.regAddress, ['building', 'landmark', 'city', 'state', 'postal', 'country']);
    return pctOf(a + b + c, 15);
  }
  if (section === 'contacts') {
    const d = countFilled(P.contacts.director, ['fullName', 'email', 'phone', 'designation']);
    const p = countFilled(P.contacts.primary, ['first', 'last', 'designation', 'email', 'phone']);
    const s = countFilled(P.contacts.show, ['first', 'last', 'designation', 'email', 'phone']);
    const a = countFilled(P.contacts.account, ['first', 'last', 'designation', 'email', 'phone']);
    return pctOf(d + p + s + a, 19);
  }
  if (section === 'billing') {
    const b = countFilled(P.billing, ['building', 'landmark', 'city', 'state', 'postal', 'country']);
    const k = countFilled(P.bank, ['acNo', 'bankName', 'branch', 'ifsc', 'beneficiary', 'address', 'chequeFile']);
    return pctOf(b + k, 13);
  }
  if (section === 'documents') {
    return pctOf(P.documents.filter((d) => d.file).length, P.documents.length);
  }
  if (section === 'business') {
    const B = P.business;
    const checks = [B.primary, B.secondary.length, B.types.length, B.targets.length,
      B.overview, B.capabilities.length, B.products.length];
    return pctOf(checks.filter(Boolean).length, checks.length);
  }
  return 0;
}
function profileOverallPct() {
  const secs = ['company', 'contacts', 'billing', 'documents', 'business'];
  return Math.round(secs.reduce((a, s) => a + profileSectionPct(s), 0) / secs.length);
}

/* ---------------- shared pieces ---------------- */
const PROFILE_TABS = [
  ['company', 'Company Info'], ['contacts', 'Authorized Contacts'],
  ['billing', 'Billing & Bank Info'], ['documents', 'Documents'], ['business', 'Business Profile'],
];
const PROG_LABELS = { company: 'Company Info', contacts: 'Authorized Contacts', billing: 'Billing & Bank Info', documents: 'Documents', business: 'Business Profile' };

function profileProgressRail() {
  return '<div class="card"><h2 class="card-title" style="margin-bottom:16px">Setup Progress</h2>' +
    Object.keys(PROG_LABELS).map((s) => {
      const p = profileSectionPct(s);
      return '<div class="prog-row"><div class="pr-head"><span>' + PROG_LABELS[s] + '</span><span>' +
        (p < 10 ? '0' : '') + p + '%</span></div>' +
        '<div class="prog-bar"><i style="width:' + p + '%"></i></div></div>';
    }).join('') + '</div>';
}

function pcard(icon, iconBg, iconColor, title, editFn, inner) {
  return '<div class="card section-gap" style="margin-top:0;margin-bottom:18px">' +
    '<div class="pcard-head">' +
      '<span class="icon-sq" style="background:' + iconBg + ';color:' + iconColor + '"><span class="material-symbols-outlined">' + icon + '</span></span>' +
      '<h2 class="card-title">' + title + '</h2>' +
      (editFn ? '<button class="btn-link" onclick="' + editFn + '" title="Edit"><span class="material-symbols-outlined" style="font-size:18px">edit</span></button>' : '') +
    '</div>' + inner + '</div>';
}

function kvCells(pairs) {
  return '<div class="pkv">' + pairs.map((p) =>
    '<div class="cell' + (p[2] === 'full' ? ' full' : '') + '"><div class="k">' + p[0] + '</div>' +
    '<div class="v">' + (String(p[1] || '').trim() ? esc(p[1]) : '<span style="color:var(--muted);font-weight:500">—</span>') + '</div></div>').join('') +
    '</div>';
}

/* ---------------- main view ---------------- */
function viewProfile(tab) {
  tab = tab || 'company';
  const tabs = '<div class="ptabs">' + PROFILE_TABS.map(([id, label]) =>
    '<button class="ptab' + (tab === id ? ' on' : '') + '" onclick="location.hash=\'#/profile/' + id + '\'">' + label + '</button>').join('') + '</div>';

  let body = '';
  if (tab === 'contacts') body = profTabContacts();
  else if (tab === 'billing') body = profTabBilling();
  else if (tab === 'documents') body = profTabDocuments();
  else if (tab === 'business') body = profTabBusiness();
  else body = profTabCompany();

  return '<h1 class="page-title">' + esc(EVENT.exhibitor) +
      (S.profile.approved ? ' <span class="pill green" style="vertical-align:middle">Profile Approved</span>' : '') + '</h1>' +
    '<p class="page-sub">' + esc(S.profile.tagline) + '</p>' +
    tabs +
    '<div class="prof-layout"><div>' + body + '</div>' + profileProgressRail() + '</div>';
}

/* ---------------- tab: Company Info ---------------- */
function profTabCompany() {
  const P = S.profile;
  return pcard('apartment', 'var(--blue-soft)', 'var(--blue)', 'Company Information', 'editCompanyInfo()',
      kvCells([
        ['Company Name', EVENT.exhibitor], ['Business Type', P.company.businessType],
        ['Email', P.company.email], ['Phone Number', P.company.phone],
        ['Website', P.company.website],
      ])) +
    pcard('workspace_premium', '#FFF4E0', 'var(--amber)', 'Compliance Details', 'editCompliance()',
      kvCells([
        ['MSME Registered?', P.compliance.msme], ['UAM / Udyam Registration Number', P.compliance.udyam],
        ['MSME Certificate Self-Certified?', P.compliance.selfCert],
        ['PAN Number', P.compliance.pan], ['GST Number', P.compliance.gst],
      ])) +
    pcard('location_on', '#E6F7F9', '#1592A8', 'Registered Address', 'editRegAddress()',
      kvCells([
        ['Office No/Floor/Building', P.regAddress.building], ['Near By/Area/Landmark', P.regAddress.landmark],
        ['City', P.regAddress.city], ['State', P.regAddress.state],
        ['Postal Code', P.regAddress.postal], ['Country', P.regAddress.country],
      ]));
}

/* ---------------- tab: Authorized Contacts ---------------- */
function personCells(p) {
  return kvCells([
    ['First Name', p.first], ['Last Name', p.last], ['Designation', p.designation],
    ['Email', p.email], ['Phone Number', p.phone], ['Alternate Phone Number', p.alt],
  ]);
}
function profTabContacts() {
  const C = S.profile.contacts;
  return pcard('person', '#FBEAE6', 'var(--red)', 'Director/Partner Detail', 'editPerson(\'director\')',
      kvCells([
        ['Full Name', C.director.fullName], ['Email', C.director.email],
        ['Contact Number', C.director.phone], ['Designation', C.director.designation],
      ])) +
    pcard('person', 'var(--blue-soft)', 'var(--blue)', 'Primary Contact Person', 'editPerson(\'primary\')', personCells(C.primary)) +
    pcard('person', '#F3ECFB', '#6C47C9', 'Show Coordination Person', 'editPerson(\'show\')', personCells(C.show)) +
    pcard('person', '#FFF4E0', 'var(--amber)', 'Account Coordination Person', 'editPerson(\'account\')', personCells(C.account));
}

/* ---------------- tab: Billing & Bank ---------------- */
function profTabBilling() {
  const P = S.profile;
  const B = P.bank;
  const bf = (id, label, value, placeholder) =>
    '<div class="field"><label>' + label + ' <span class="req">*</span></label>' +
    '<input type="text" id="' + id + '" value="' + esc(value) + '" placeholder="' + placeholder + '"><div class="error"></div></div>';

  const bankForm =
    '<div style="margin-bottom:18px"><h2 class="card-title" style="margin:0">Bank Detail</h2>' +
      '<p style="font-size:0.82rem;color:var(--muted);margin:2px 0 0;max-width:640px">Share the bank account where your refunds and settlements should be credited. Please make sure the details match your cancelled cheque.</p></div>' +

    '<div class="pcard-head" style="margin-bottom:4px">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">account_balance</span></span>' +
      '<h2 class="card-title">Account Information</h2></div>' +
    '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 14px">All fields are mandatory and must exactly match your bank records.</p>' +
    '<div class="bank-grid">' +
      bf('bkName', 'Bank Name', B.bankName, 'e.g. State Bank of India') +
      bf('bkBranch', 'Branch Name', B.branch, 'e.g. Bandra Kurla Complex') +
      bf('bkBenef', 'Beneficiary Name', B.beneficiary, 'Name as per bank account') +
      bf('bkAcNo', 'Account Number', B.acNo, '9 to 18 digits') +
      bf('bkIfsc', 'IFSC Code', B.ifsc, 'e.g. SBIN0001234') +
    '</div>' +
    '<div class="field" style="margin-top:14px"><label>Bank Address <span class="req">*</span></label>' +
      '<textarea id="bkAddr" rows="3" maxlength="250" placeholder="Branch address as printed on the cheque" ' +
        'oninput="document.getElementById(\'bkAddrCount\').textContent=this.value.length+\'/250\'" ' +
        'style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem">' + esc(B.address) + '</textarea>' +
      '<div style="text-align:right;font-size:0.72rem;color:var(--muted)" id="bkAddrCount">' + B.address.length + '/250</div>' +
      '<div class="error"></div></div>' +

    '<div class="pcard-head" style="margin:18px 0 4px">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">receipt</span></span>' +
      '<h2 class="card-title">Cancelled Cheque <span class="req">*</span></h2></div>' +
    '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 14px">Upload a clear photo or scan of a cancelled cheque of the same account.</p>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">' +
      '<label class="dropzone">' +
        '<span class="material-symbols-outlined">upload</span>' +
        (B.chequeFile
          ? '<span>' + esc(B.chequeFile) + '</span><span style="font-weight:500;font-size:0.75rem;color:var(--muted)">Uploaded ' + esc(B.chequeAt) + ' · click to replace</span>'
          : '<span>Upload Cancelled Cheque</span>') +
        '<input type="file" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="uploadCheque(this)">' +
      '</label>' +
      '<div class="info-panel">' +
        '<div class="ip-title"><span class="material-symbols-outlined" style="color:var(--blue)">info</span>Before you save</div>' +
        ['Ensure account details are correct and active.',
         'Cancelled cheque must be clear and legible.',
         'Name on cheque should match beneficiary name.',
         'Upload in PDF, JPG or PNG format (Max 2MB).'].map((t) =>
          '<div class="ip-row"><span class="material-symbols-outlined">check_circle</span>' + t + '</div>').join('') +
        '<div class="ip-note">Incorrect bank details can delay your refund. The organiser verifies these details against the cancelled cheque before processing any payout.</div>' +
      '</div>' +
    '</div>' +

    '<div class="bank-savebar">' +
      '<b>Save Your Bank Details</b>' +
      '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-outline" onclick="resetBankForm()"><span class="material-symbols-outlined">restart_alt</span>Reset</button>' +
        '<button class="btn btn-primary" onclick="saveBankDetail()"><span class="material-symbols-outlined">save</span>Save</button>' +
      '</div></div>';

  return pcard('receipt_long', '#FBEAE6', 'var(--red)', 'Billing Address', 'editBilling()',
      '<b style="font-size:0.92rem;display:block;margin-bottom:12px">Billing Address 1</b>' +
      kvCells([
        ['Office No/Floor/Building', P.billing.building], ['Near By/Area/Landmark', P.billing.landmark],
        ['City', P.billing.city], ['State', P.billing.state],
        ['Postal Code', P.billing.postal], ['Country', P.billing.country],
      ])) +
    '<div class="card section-gap" style="margin-top:0;margin-bottom:18px">' + bankForm + '</div>';
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function uploadCheque(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { toast('File is larger than 2 MB — upload a smaller scan.', 'error'); return; }
  S.profile.bank.chequeFile = f.name;
  S.profile.bank.chequeAt = nowStr();
  save(); render();
  toast('Cancelled cheque uploaded', 'success');
}

function saveBankDetail() {
  clearErrs();
  const B = S.profile.bank;
  const val = (id) => $(id).value.trim();
  let ok = true;
  if (!val('bkName')) { setErr('bkName', 'Bank name is required'); ok = false; }
  if (!val('bkBranch')) { setErr('bkBranch', 'Branch name is required'); ok = false; }
  if (!val('bkBenef')) { setErr('bkBenef', 'Beneficiary name is required'); ok = false; }
  const ac = val('bkAcNo');
  if (!/^\d{9,18}$/.test(ac)) { setErr('bkAcNo', 'Account number must be 9 to 18 digits'); ok = false; }
  const ifsc = val('bkIfsc').toUpperCase();
  if (!IFSC_RE.test(ifsc)) { setErr('bkIfsc', 'Enter a valid IFSC code (e.g. SBIN0001234)'); ok = false; }
  if (!val('bkAddr')) { setErr('bkAddr', 'Bank address is required'); ok = false; }
  if (!ok) { scrollToFirstErrField(); return; }
  if (!B.chequeFile) { toast('Upload the cancelled cheque before saving.', 'error'); return; }
  B.bankName = val('bkName'); B.branch = val('bkBranch'); B.beneficiary = val('bkBenef');
  B.acNo = ac; B.ifsc = ifsc; B.address = val('bkAddr');
  save(); render();
  toast('Bank details saved', 'success');
}

function resetBankForm() {
  if (!confirm('Clear the saved bank details?')) return;
  S.profile.bank = { acNo: '', bankName: '', branch: '', ifsc: '', beneficiary: '', address: '', chequeFile: '', chequeAt: '' };
  save(); render();
  toast('Bank details cleared', 'success');
}

function scrollToFirstErrField() {
  const f = document.querySelector('.field.invalid');
  if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------------- tab: Documents ---------------- */
function profTabDocuments() {
  const approved = S.profile.approved;
  const rows = S.profile.documents.map((d) => {
    const locked = approved && d.file; // approved profile → uploaded docs cannot be replaced
    return '<div class="doc-row">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">description</span></span>' +
      '<div class="dname">' + esc(d.name) +
        (d.file ? '<small>' + esc(d.file) + ' · uploaded ' + esc(d.at) + '</small>' : '<small>Not uploaded yet</small>') + '</div>' +
      (d.file ? '<span class="pill green">Uploaded</span>' : '<span class="pill amber">Pending</span>') +
      (locked
        ? '<span class="btn btn-outline btn-sm" style="opacity:0.55;cursor:not-allowed" title="Profile is approved — this document is locked. Contact the organiser to change it.">' +
            '<span class="material-symbols-outlined" style="font-size:16px">lock</span>Locked</span>'
        : '<label class="btn btn-outline btn-sm" style="cursor:pointer">' +
            '<span class="material-symbols-outlined" style="font-size:16px">upload</span>' + (d.file ? 'Replace' : 'Upload') +
            '<input type="file" accept=".pdf,image/*" style="display:none" onchange="uploadProfileDoc(\'' + d.id + '\', this)"></label>') +
    '</div>';
  }).join('');
  const approvedNote = approved
    ? '<div class="note" style="margin-bottom:14px"><b class="title">Company profile approved' +
      (S.profile.approvedAt ? ' — ' + esc(S.profile.approvedAt) : '') + '</b>' +
      'Documents uploaded at the time of registration are <b>locked</b> and cannot be replaced. ' +
      'You can still upload the documents that are pending. To correct a locked document, contact the organiser.</div>'
    : '';
  return pcard('folder_open', 'var(--blue-soft)', 'var(--blue)', 'Company Documents', null,
    approvedNote +
    '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 6px">Upload the supporting documents required by the organiser. PDF or image, up to 2 MB each.</p>' + rows);
}

function uploadProfileDoc(id, input) {
  const f = input.files[0];
  if (!f) return;
  const d = S.profile.documents.find((x) => x.id === id);
  if (!d) return;
  if (S.profile.approved && d.file) {
    toast('Profile is approved — "' + d.name + '" is locked and cannot be replaced. Contact the organiser.', 'error');
    return;
  }
  if (f.size > 2 * 1024 * 1024) { toast('File is larger than 2 MB — upload a smaller scan.', 'error'); return; }
  d.file = f.name;
  d.at = nowStr();
  save(); render();
  toast(d.name + ' uploaded', 'success');
}

/* ---------------- tab: Business Profile ---------------- */
const INDUSTRY_OPTS = ['Aerospace & Defence', 'Artificial Intelligence', 'Avionics', 'Cybersecurity', 'Drones & UAV', 'Electronics', 'MRO Services', 'Space Technology'];
const BIZ_TYPES = ['Manufacturer', 'Service Provider', 'Distributor', 'Consultancy'];
const MARKETS = ['Global', 'South Asia', 'Middle East', 'Europe', 'Africa', 'Americas'];

function chips(list, removeFn) {
  return list.map((t, i) =>
    '<span class="tagchip">' + esc(t) + '<button onclick="' + removeFn + '(' + i + ')" title="Remove">✕</button></span>').join('') ||
    '<span style="color:var(--muted);font-size:0.8rem">None added</span>';
}
function toggleChips(opts, selected, fn) {
  return '<div class="filter-chips" style="margin-top:6px">' + opts.map((o) =>
    '<button class="fchip' + (selected.includes(o) ? ' on' : '') + '" onclick="' + fn + '(\'' + o.replace(/'/g, "\\'") + '\')">' + o + '</button>').join('') + '</div>';
}

function profTabBusiness() {
  const B = S.profile.business;
  const classification =
    '<div class="field" style="margin-bottom:14px"><label>Primary Industry</label>' +
      '<select onchange="S.profile.business.primary=this.value;save();render()">' +
      INDUSTRY_OPTS.map((o) => '<option' + (B.primary === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>' +
    '<div style="margin-bottom:14px"><label style="font-size:0.8rem;font-weight:700">Secondary Industries</label><div style="margin-top:6px">' +
      chips(B.secondary, 'rmSecondary') + '</div>' +
      toggleChips(INDUSTRY_OPTS.filter((o) => o !== B.primary && !B.secondary.includes(o)), [], 'addSecondary') + '</div>' +
    '<div style="margin-bottom:14px"><label style="font-size:0.8rem;font-weight:700">Business Type</label>' +
      toggleChips(BIZ_TYPES, B.types, 'toggleBizType') + '</div>' +
    '<div><label style="font-size:0.8rem;font-weight:700">Target Market</label>' +
      toggleChips(MARKETS, B.targets, 'toggleMarket') + '</div>';

  const positioning =
    '<div class="field" style="margin-bottom:14px"><label>Company Overview <span style="float:right;color:var(--muted);font-weight:500">' + B.overview.length + ' / 500 characters</span></label>' +
      '<textarea id="bizOverview" rows="4" maxlength="500" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem">' + esc(B.overview) + '</textarea></div>' +
    '<div style="margin-bottom:14px"><label style="font-size:0.8rem;font-weight:700">Key Capabilities</label><div style="margin-top:6px">' + chips(B.capabilities, 'rmCapability') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><input type="text" id="capInput" placeholder="Add capability" style="border:1px solid #CFD7E4;border-radius:8px;padding:7px 12px;font-family:inherit;font-size:0.84rem">' +
      '<button class="btn btn-outline btn-sm" onclick="addCapability()">+ Add Tag</button></div></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" onclick="saveOverview()"><span class="material-symbols-outlined" style="font-size:16px">save</span>Save</button></div>';

  const prodRows = B.products.map((p) =>
    '<div class="prod-row">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">image</span></span>' +
      '<div class="pinfo"><b>' + esc(p.name) + '</b>' +
      '<span>Category: ' + esc(p.category) + ' · ' + esc(p.desc.slice(0, 60)) + (p.desc.length > 60 ? '…' : '') + '</span>' +
      (p.images.length || p.brochure ? '<span>' + (p.images.length ? p.images.length + ' image(s)' : '') + (p.brochure ? ' · Brochure: ' + esc(p.brochure) : '') + '</span>' : '') + '</div>' +
      '<button class="btn-link danger" onclick="rmProduct(\'' + p.id + '\')" title="Delete"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>' +
    '</div>').join('') || '<p style="color:var(--muted);font-size:0.85rem">No products added yet.</p>';

  const addForm =
    '<div style="border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:12px">' +
      '<b style="font-size:0.92rem;display:block;margin-bottom:12px">Add Product</b>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Product Name <span class="req">*</span></label><input type="text" id="prName"><div class="error"></div></div>' +
        '<div class="field"><label>Product Category <span class="req">*</span></label><select id="prCat"><option value="">Select a category</option>' +
          ['Fighter Aircraft', 'Helicopters', 'Aero Engines', 'Avionics', 'Security System', 'UAV / Drones', 'Simulation & Training', 'Other'].map((c) => '<option>' + c + '</option>').join('') + '</select><div class="error"></div></div>' +
        '<div class="field full"><label>Short Description</label><textarea id="prDesc" rows="2" maxlength="200" placeholder="Provide a brief overview of the product (max 200 characters)" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem"></textarea></div>' +
        '<div class="field"><label>Application Areas</label><input type="text" id="prAreas" placeholder="e.g. Defence, Civil (comma separated)"></div>' +
        '<div class="field"><label>Product Images</label><input type="file" id="prImages" accept="image/*" multiple></div>' +
        '<div class="field full"><label>Product Brochure</label><input type="file" id="prBrochure" accept=".pdf,.jpg,.jpeg,.png,.docx"><div class="hint">Supported formats: PDF, JPG, PNG, DOCX</div></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="addProduct()"><span class="material-symbols-outlined" style="font-size:16px">add</span>Add Product</button>' +
    '</div>';

  return '<div style="margin-bottom:16px"><h2 class="card-title" style="margin:0">Industry &amp; Products</h2>' +
    '<p style="font-size:0.8rem;color:var(--muted);margin:2px 0 0">Define how your company and offerings appear in the networking platform.</p></div>' +
    pcard('category', 'var(--blue-soft)', 'var(--blue)', 'Business Classification', null, classification) +
    pcard('campaign', '#FBEAE6', 'var(--red)', 'Company Positioning', null, positioning) +
    pcard('inventory_2', '#E6F4EC', 'var(--green)', 'Products & Solutions', null, prodRows + addForm);
}

/* --- business tab actions --- */
function addSecondary(v) { S.profile.business.secondary.push(v); save(); render(); }
function rmSecondary(i) { S.profile.business.secondary.splice(i, 1); save(); render(); }
function toggleBizType(v) {
  const a = S.profile.business.types;
  a.includes(v) ? a.splice(a.indexOf(v), 1) : a.push(v);
  save(); render();
}
function toggleMarket(v) {
  const a = S.profile.business.targets;
  a.includes(v) ? a.splice(a.indexOf(v), 1) : a.push(v);
  save(); render();
}
function addCapability() {
  const v = $('capInput').value.trim();
  if (!v) return;
  S.profile.business.capabilities.push(v);
  save(); render();
}
function rmCapability(i) { S.profile.business.capabilities.splice(i, 1); save(); render(); }
function saveOverview() {
  S.profile.business.overview = $('bizOverview').value.trim();
  save(); render();
  toast('Company positioning saved', 'success');
}
function addProduct() {
  clearErrs();
  const name = $('prName').value.trim();
  const cat = $('prCat').value;
  let ok = true;
  if (!name) { setErr('prName', 'Product name is required'); ok = false; }
  if (!cat) { setErr('prCat', 'Select a category'); ok = false; }
  if (!ok) return;
  S.profile.business.products.push({
    id: 'prod_' + Date.now(),
    name: name, category: cat, desc: $('prDesc').value.trim(),
    areas: $('prAreas').value.split(',').map((s) => s.trim()).filter(Boolean),
    images: [...$('prImages').files].map((f) => f.name),
    brochure: $('prBrochure').files[0] ? $('prBrochure').files[0].name : '',
  });
  save(); render();
  toast('Product "' + name + '" added', 'success');
}
function rmProduct(id) {
  if (!confirm('Remove this product?')) return;
  S.profile.business.products = S.profile.business.products.filter((p) => p.id !== id);
  save(); render();
}

/* ---------------- generic edit modals ---------------- */
function profileEditModal(title, fields, getObj) {
  // fields: [key, label, type?] — values read/written on getObj()
  const obj = getObj();
  openModal(title,
    '<form id="profEditForm" onsubmit="return false"><div class="form-grid">' +
    fields.map(([k, label, type]) =>
      '<div class="field"><label>' + label + '</label>' +
      (type === 'yesno'
        ? '<select id="pe_' + k + '"><option' + (obj[k] === 'Yes' ? ' selected' : '') + '>Yes</option><option' + (obj[k] !== 'Yes' ? ' selected' : '') + '>No</option></select>'
        : '<input type="text" id="pe_' + k + '" value="' + esc(obj[k] || '') + '">') +
      '</div>').join('') +
    '</div></form>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="saveProfileEdit()"><span class="material-symbols-outlined">save</span>Save</button>', true);
  window.__profEdit = { fields: fields, getObj: getObj };
}
function saveProfileEdit() {
  const { fields, getObj } = window.__profEdit;
  const obj = getObj();
  fields.forEach(([k]) => { obj[k] = $('pe_' + k).value.trim(); });
  save(); closeModal(); render();
  toast('Profile updated', 'success');
}

const ADDR_FIELDS = [
  ['building', 'Office No/Floor/Building'], ['landmark', 'Near By/Area/Landmark'],
  ['city', 'City'], ['state', 'State'], ['postal', 'Postal Code'], ['country', 'Country'],
];
function editCompanyInfo() {
  profileEditModal('Edit — Company Information', [
    ['businessType', 'Business Type'], ['email', 'Email'], ['phone', 'Phone Number'], ['website', 'Website'],
  ], () => S.profile.company);
}
function editCompliance() {
  profileEditModal('Edit — Compliance Details', [
    ['msme', 'MSME Registered?', 'yesno'], ['udyam', 'UAM / Udyam Registration Number'],
    ['selfCert', 'MSME Certificate Self-Certified?', 'yesno'], ['pan', 'PAN Number'], ['gst', 'GST Number'],
  ], () => S.profile.compliance);
}
function editRegAddress() { profileEditModal('Edit — Registered Address', ADDR_FIELDS, () => S.profile.regAddress); }
function editBilling() { profileEditModal('Edit — Billing Address', ADDR_FIELDS, () => S.profile.billing); }
function editPerson(key) {
  if (key === 'director') {
    profileEditModal('Edit — Director/Partner Detail', [
      ['fullName', 'Full Name'], ['email', 'Email'], ['phone', 'Contact Number'], ['designation', 'Designation'],
    ], () => S.profile.contacts.director);
    return;
  }
  const titles = { primary: 'Primary Contact Person', show: 'Show Coordination Person', account: 'Account Coordination Person' };
  profileEditModal('Edit — ' + titles[key], [
    ['first', 'First Name'], ['last', 'Last Name'], ['designation', 'Designation'],
    ['email', 'Email'], ['phone', 'Phone Number'], ['alt', 'Alternate Phone Number'],
  ], () => S.profile.contacts[key]);
}
