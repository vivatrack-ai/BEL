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
  // Migration: matchmaking fields per the registration sheet
  // ("LookingFor & Offering.xlsx") — Exhibition Categories, I am
  // Looking For and Offering each hold {category: [subcategories]}.
  if (!S.profile.matchmaking || !S.profile.matchmaking.exCats) {
    const kw = (S.profile.matchmaking && S.profile.matchmaking.keywords) || ['Fighter Aircraft', 'Avionics'];
    S.profile.matchmaking = {
      keywords: kw,
      exCats: {
        'Aircraft Systems (Fixed Wing)': ['Fighter Aircraft', 'Light Combat Aircraft', 'Basic Trainer Aircraft'],
        'Helicopters & Rotary Wing': ['Utility Helicopters', 'Attack Helicopters'],
      },
      offering: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Overhaul Services', 'Upgrades & Retrofits'] },
    };
    save();
  }
  // Migration: booth brand material (videos & documents per booth)
  if (!S.booth) {
    S.booth = {
      videos: [{ id: 'vid_1', booth: 'Hall A · A8.5', title: 'HAL Corporate Film 2027', kind: 'link', url: 'https://youtube.com/watch?v=hal2027', file: '', createdAt: '20 Sept 2026, 11:00 am' }],
      documents: [{ id: 'bdoc_1', booth: 'Hall A · A8.5', title: 'HAL Product Brochure', file: 'HAL-Brochure-2027.pdf', createdAt: '20 Sept 2026, 11:05 am' }],
    };
    save();
  }
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
    const d = (P.business.overview ? 1 : 0) + (P.business.capabilities.length ? 1 : 0); // Company Positioning
    return pctOf(a + b + c + d, 17);
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
  if (section === 'matchmaking') {
    // Exhibitor-side matchmaking = OFFERING only ("I am Looking For" is
    // visitor-side; keywords & categories moved to Products → Product Profile).
    const m = P.matchmaking.offering;
    return Object.keys(m).some((k) => m[k].length) ? 100 : 0;
  }
  return 0;
}
function profileOverallPct() {
  const secs = ['company', 'contacts', 'billing', 'documents', 'matchmaking'];
  return Math.round(secs.reduce((a, s) => a + profileSectionPct(s), 0) / secs.length);
}

/* ---------------- shared pieces ---------------- */
const PROFILE_TABS = [
  ['company', 'Company Info'], ['contacts', 'Authorized Contacts'],
  ['billing', 'Billing & Bank Info'], ['documents', 'Documents'], ['matchmaking', 'Matchmaking'],
];
const PROG_LABELS = { company: 'Company Info', contacts: 'Authorized Contacts', billing: 'Billing & Bank Info', documents: 'Documents', matchmaking: 'Matchmaking' };

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
  else if (tab === 'matchmaking') body = profTabMatchmaking();
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
      ])) +
    positioningCard();
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
function chips(list, removeFn) {
  return list.map((t, i) =>
    '<span class="tagchip">' + esc(t) + '<button onclick="' + removeFn + '(' + i + ')" title="Remove">✕</button></span>').join('') ||
    '<span style="color:var(--muted);font-size:0.8rem">None added</span>';
}

/* Company Positioning — lives on the Company Info tab (the old
   Business Profile tab was removed; only this section was kept). */
function positioningCard() {
  const B = S.profile.business;
  const positioning =
    '<div class="field" style="margin-bottom:14px"><label>Company Overview <span style="float:right;color:var(--muted);font-weight:500">' + B.overview.length + ' / 500 characters</span></label>' +
      '<textarea id="bizOverview" rows="4" maxlength="500" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem">' + esc(B.overview) + '</textarea></div>' +
    '<div style="margin-bottom:14px"><label style="font-size:0.8rem;font-weight:700">Key Capabilities</label><div style="margin-top:6px">' + chips(B.capabilities, 'rmCapability') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><input type="text" id="capInput" placeholder="Add capability" style="border:1px solid #CFD7E4;border-radius:8px;padding:7px 12px;font-family:inherit;font-size:0.84rem">' +
      '<button class="btn btn-outline btn-sm" onclick="addCapability()">+ Add Tag</button></div></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" onclick="saveOverview()"><span class="material-symbols-outlined" style="font-size:16px">save</span>Save</button></div>';
  return pcard('campaign', '#FBEAE6', 'var(--red)', 'Company Positioning', null, positioning);
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
    createdAt: nowStr(),
  });
  save(); closeModal(); render();
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
/* ============================================================
   TAB · Matchmaking — real category/subcategory master from the
   "LookingFor & Offering.xlsx" registration sheet (window.MM_CATS,
   53 categories · 567 subcategories, loaded via matchmaking-data.js).
   Four separate sections: Keywords · Exhibition Categories ·
   I am Looking For · Offering — each with multi-select subs.
   ============================================================ */
const MM_FIELDS = { ex: 'exCats', of: 'offering' };
window.__mmOpen = window.__mmOpen || { ex: {}, of: {} };
window.__mmQ = window.__mmQ || { ex: '', of: '' };

function mmField(f) { return S.profile.matchmaking[MM_FIELDS[f]]; }
function mmCount(f) { return Object.values(mmField(f)).reduce((a, x) => a + x.length, 0); }

/* Searchable, collapsible category → subcategory multi-select tree */
function mmTree(f) {
  const map = mmField(f);
  const q = (window.__mmQ[f] || '').toLowerCase();
  let list = MM_CATS.map((c, ci) => ({ c: c, ci: ci }));
  if (q) list = list.filter((x) => x.c.name.toLowerCase().includes(q) || x.c.subs.some((s) => s.toLowerCase().includes(q)));

  const blocks = list.map((x) => {
    const c = x.c, ci = x.ci;
    const sel = map[c.name] || [];
    const allOn = c.subs.length > 0 && sel.length === c.subs.length;
    const open = q ? true : !!window.__mmOpen[f][c.name];
    const catMatches = c.name.toLowerCase().includes(q);
    const subRows = c.subs.map((sub, si) => {
      if (q && !catMatches && !sub.toLowerCase().includes(q)) return '';
      return '<label class="check-item' + (sel.includes(sub) ? ' selected' : '') + '" style="display:flex;margin:6px 0 6px 34px" ' +
        'onclick="event.preventDefault();mmToggleSub(\'' + f + '\',' + ci + ',' + si + ')">' +
        '<input type="checkbox"' + (sel.includes(sub) ? ' checked' : '') + '>' + esc(sub) + '</label>';
    }).join('');
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:8px 14px;margin-bottom:8px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<label class="check-item' + (allOn ? ' selected' : '') + '" style="display:flex;flex:1;border:none;padding:4px 0" ' +
          'onclick="event.preventDefault();mmToggleParent(\'' + f + '\',' + ci + ')">' +
          '<input type="checkbox"' + (allOn ? ' checked' : '') + '><b>' + esc(c.name) + '</b>' +
          (sel.length && !allOn ? ' <span class="pill blue" style="margin-left:8px">' + sel.length + ' selected</span>' : '') +
          (allOn ? ' <span class="pill green" style="margin-left:8px">All</span>' : '') + '</label>' +
        '<button class="btn-link" onclick="mmToggleOpen(\'' + f + '\',' + ci + ')">' +
          '<span class="material-symbols-outlined">' + (open ? 'keyboard_arrow_up' : 'keyboard_arrow_down') + '</span></button>' +
      '</div>' +
      (open ? subRows : '') +
    '</div>';
  }).join('') || '<p style="color:var(--muted);font-size:0.84rem">No category matches your search.</p>';

  return '<input type="text" id="mmq_' + f + '" value="' + esc(window.__mmQ[f]) + '" placeholder="Search category or subcategory.." ' +
      'oninput="mmSetQ(\'' + f + '\', this.value)" ' +
      'style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem;margin-bottom:10px">' +
    '<div style="max-height:420px;overflow-y:auto;padding-right:4px">' + blocks + '</div>';
}

function mmSetQ(f, v) {
  window.__mmQ[f] = v;
  render();
  const el = $('mmq_' + f);
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}
function mmToggleOpen(f, ci) {
  const name = MM_CATS[ci].name;
  window.__mmOpen[f][name] = !window.__mmOpen[f][name];
  render();
}
function mmToggleSub(f, ci, si) {
  const cat = MM_CATS[ci].name, sub = MM_CATS[ci].subs[si];
  const map = mmField(f);
  if (!map[cat]) map[cat] = [];
  const a = map[cat];
  a.includes(sub) ? a.splice(a.indexOf(sub), 1) : a.push(sub);
  if (!a.length) delete map[cat];
  window.__mmOpen[f][cat] = true;
  save(); render();
}
function mmToggleParent(f, ci) {
  const c = MM_CATS[ci];
  const map = mmField(f);
  const allOn = (map[c.name] || []).length === c.subs.length && c.subs.length > 0;
  if (allOn) delete map[c.name];
  else map[c.name] = c.subs.slice();
  window.__mmOpen[f][c.name] = true;
  save(); render();
}

const mmSecTitle = (t, f) => t + (f && mmCount(f) ? ' <span class="pill blue" style="margin-left:6px">' + mmCount(f) + ' selected</span>' : '');

function kwBlock() {
  return '<div style="margin:6px 0">' + chips(S.profile.matchmaking.keywords, 'rmKeyword') + '</div>' +
    '<div style="display:flex;gap:8px"><input type="text" id="kwInput" placeholder="Enter Keywords.." ' +
      'onkeydown="if(event.key===\'Enter\'){event.preventDefault();addKeyword();}" ' +
      'style="flex:1;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
      '<button class="btn btn-outline btn-sm" onclick="addKeyword()">+ Add</button></div>';
}

/* Matchmaking = OFFERING only. Keywords & Exhibition Categories are
   product-side classification (app-level filters) — they live on the
   Products page under the "Product Profile" tab. */
function profTabMatchmaking() {
  return '<div style="margin-bottom:16px"><h2 class="card-title" style="margin:0">Matchmaking</h2>' +
    '<p style="font-size:0.8rem;color:var(--muted);margin:2px 0 0">Powers B2B recommendations in the networking platform. Multi-select — tick a category to select all its subcategories, or pick subcategories individually. Keywords &amp; exhibition categories are managed under <a class="btn-link" style="padding:0" href="#/products" onclick="window.__prodTab=\'pprofile\'">Products → Product Profile</a>.</p></div>' +
    pcard('volunteer_activism', '#E6F4EC', 'var(--green)', mmSecTitle('Offering <span class="req">*</span>', 'of'), null,
      '<div class="hint" style="margin:0 0 8px">Products &amp; capabilities you offer. Visitors pick "I am Looking For" on their side — matchmaking pairs their demand with your offering.</div>' + mmTree('of'));
}

function addKeyword() {
  const v = $('kwInput').value.trim();
  if (!v) return;
  if (!S.profile.matchmaking.keywords.includes(v)) S.profile.matchmaking.keywords.push(v);
  save(); render();
}
function rmKeyword(i) { S.profile.matchmaking.keywords.splice(i, 1); save(); render(); }

/* ============================================================
   VIEW · Products — SEPARATE menu (not inside company profile),
   mirroring the platform: Product Gallery + placeholder tabs
   ============================================================ */
const PRODUCT_TABS = [['pprofile', 'Product Profile'], ['gallery', 'Product Gallery'], ['orders-by', 'Order By Product'], ['access', 'Request For Access'], ['orders', 'Product Orders']];
window.__prodTab = window.__prodTab || 'pprofile';
window.__prodQ = window.__prodQ || '';

function viewProducts() {
  const tab = window.__prodTab;
  const tabsHtml = '<div class="ptabs" style="border-bottom:none;padding-bottom:0;margin-bottom:16px">' +
    PRODUCT_TABS.map(([id, l]) =>
      '<button class="ptab' + (tab === id ? ' on' : '') + '" onclick="window.__prodTab=\'' + id + '\';render()">' + l + '</button>').join('') + '</div>';

  let body;
  if (tab === 'pprofile') {
    // Keywords & Exhibition Categories — product-side classification that
    // powers the event app's keyword and category/subcategory filters.
    body = '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 14px">Visitors filter products in the event app by <b>keyword</b> and by <b>category &amp; subcategory</b> — this classification drives those filters. <span class="req">*</span> indicates mandatory fields.</p>' +
      pcard('sell', 'var(--blue-soft)', 'var(--blue)', 'Keywords <span class="req">*</span>', null, kwBlock()) +
      pcard('category', '#F3ECFB', '#6C47C9', mmSecTitle('Exhibition Categories <span class="req">*</span>', 'ex'), null,
        '<div class="hint" style="margin:0 0 8px">The categories you exhibit under — tick a category to select all its subcategories, or pick individually.</div>' + mmTree('ex'));
  } else if (tab !== 'gallery') {
    const labels = { 'orders-by': 'orders placed by product', 'access': 'access requests', 'orders': 'product orders' };
    body = '<div class="card"><div class="empty"><span class="material-symbols-outlined">inventory_2</span>' +
      '<h3>Nothing here yet</h3><p>Visitor ' + labels[tab] + ' will appear here once the networking platform goes live.</p></div></div>';
  } else {
    const q = window.__prodQ.toLowerCase();
    const all = S.profile.business.products;
    const list = q ? all.filter((p) => (p.name + ' ' + p.category).toLowerCase().includes(q)) : all;
    const rows = list.map((p) =>
      '<div class="prod-row">' +
        '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">image</span></span>' +
        '<div class="pinfo"><b>' + esc(p.name) + '</b>' +
        '<span>Category: ' + esc(p.category) + (p.desc ? ' · ' + esc(p.desc.slice(0, 70)) + (p.desc.length > 70 ? '…' : '') : '') + '</span>' +
        ((p.areas || []).length || p.images.length || p.brochure
          ? '<span>' + [(p.areas || []).length ? 'Areas: ' + p.areas.join(', ') : '', p.images.length ? p.images.length + ' image(s)' : '', p.brochure ? 'Brochure: ' + esc(p.brochure) : ''].filter(Boolean).join(' · ') + '</span>' : '') + '</div>' +
        '<button class="btn-link danger" onclick="rmProduct(\'' + p.id + '\')" title="Delete"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>' +
      '</div>').join('');
    const empty =
      '<div class="empty"><span class="material-symbols-outlined">wallpaper</span>' +
      '<h3>No Product yet</h3><p>' + (all.length ? 'No products match your search.' : 'Products will show up here once they are added.') + '</p>' +
      '<button class="btn btn-primary" onclick="openProductModal()"><span class="material-symbols-outlined">add</span>Product</button></div>';
    body =
      '<div class="card">' +
        '<div class="card-head-row" style="flex-wrap:wrap;gap:10px">' +
          '<input type="text" value="' + esc(window.__prodQ) + '" placeholder="Search Products" ' +
            'oninput="window.__prodQ=this.value;render()" ' +
            'style="flex:1;min-width:220px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
          '<span class="result-count">' + list.length + ' product(s)</span>' +
          '<button class="btn btn-primary btn-sm" onclick="openProductModal()"><span class="material-symbols-outlined" style="font-size:16px">add</span>Product</button>' +
        '</div>' +
        (rows || empty) +
      '</div>';
  }

  return '<h1 class="page-title">Product</h1>' +
    '<p class="page-sub">Your product gallery for the event app &amp; networking platform.</p>' +
    tabsHtml + body;
}

function openProductModal() {
  openModal('Add Product',
    '<div class="form-grid">' +
      '<div class="field"><label>Product Name <span class="req">*</span></label><input type="text" id="prName" placeholder="Enter product name"><div class="error"></div></div>' +
      '<div class="field"><label>Product Category <span class="req">*</span></label><select id="prCat"><option value="">Select a category</option>' +
        MM_CATS.map((c) => '<option>' + esc(c.name) + '</option>').join('') + '</select><div class="error"></div></div>' +
      '<div class="field full"><label>Short Description</label><textarea id="prDesc" rows="2" maxlength="200" placeholder="Provide a brief overview of the product (max 200 characters)" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem"></textarea></div>' +
      '<div class="field"><label>Application Areas</label><input type="text" id="prAreas" placeholder="e.g. Defence, Civil (comma separated)"></div>' +
      '<div class="field"><label>Product Images</label><input type="file" id="prImages" accept="image/*" multiple></div>' +
      '<div class="field full"><label>Product Brochure</label><input type="file" id="prBrochure" accept=".pdf,.jpg,.jpeg,.png,.docx"><div class="hint">Supported formats: PDF, JPG, PNG, DOCX</div></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="addProduct()"><span class="material-symbols-outlined">add</span>Add Product</button>', true);
}

/* ============================================================
   VIEW · Manage Booth — Brand Material: Videos & Documents.
   Exhibitor can upload a file OR paste a link (videos), with a
   listing view; same pattern for booth documents.
   ============================================================ */
const boothOpts = (sel) => S.stalls.map((st) => {
  const label = st.hall + ' · ' + st.stall;
  return '<option' + (label === sel ? ' selected' : '') + '>' + esc(label) + '</option>';
}).join('');
window.__vidQ = window.__vidQ || '';
window.__bdocQ = window.__bdocQ || '';

function viewBoothVideo() {
  const q = window.__vidQ.toLowerCase();
  const all = S.booth.videos;
  const list = q ? all.filter((v) => v.title.toLowerCase().includes(q)) : all;
  const rows = list.map((v) =>
    '<div class="prod-row">' +
      '<span class="icon-sq" style="background:' + (v.kind === 'link' ? '#FFF4E0' : 'var(--blue-soft)') + ';color:' + (v.kind === 'link' ? 'var(--amber)' : 'var(--blue)') + '">' +
        '<span class="material-symbols-outlined">' + (v.kind === 'link' ? 'link' : 'movie') + '</span></span>' +
      '<div class="pinfo"><b>' + esc(v.title) + '</b>' +
      '<span>' + esc(v.booth) + ' · ' + (v.kind === 'link' ? 'Video Link: ' + esc(v.url) : 'File: ' + esc(v.file)) + '</span>' +
      '<span>Added ' + esc(v.createdAt) + '</span></div>' +
      (v.kind === 'link' ? '<a class="btn-link" href="' + esc(v.url) + '" target="_blank" rel="noopener">Open</a>' : '') +
      '<button class="btn-link danger" onclick="rmBoothVideo(\'' + v.id + '\')" title="Delete"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>' +
    '</div>').join('');
  const empty = '<div class="empty"><span class="material-symbols-outlined">movie</span>' +
    '<h3>No Videos yet</h3><p>' + (all.length ? 'No videos match your search.' : 'Videos will show up here once they are added.') + '</p>' +
    '<button class="btn btn-primary" onclick="openVideoModal()"><span class="material-symbols-outlined">add</span>Video</button></div>';

  return '<h1 class="page-title">Video</h1>' +
    '<p class="page-sub">Brand material — upload videos or add video links for important updates, schedules and announcements to attendees.</p>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px">' +
      '<input type="text" value="' + esc(window.__vidQ) + '" placeholder="Search Video By Name" oninput="window.__vidQ=this.value;render()" ' +
        'style="flex:1;min-width:220px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
      '<span class="result-count">' + list.length + ' video(s)</span>' +
      '<button class="btn btn-primary btn-sm" onclick="openVideoModal()"><span class="material-symbols-outlined" style="font-size:16px">add</span>Video</button>' +
    '</div>' + (rows || empty) + '</div>';
}

window.__vidKind = 'file';
function openVideoModal() {
  window.__vidKind = 'file';
  openModal('Create Video',
    '<div class="form-grid">' +
      '<div class="field full"><label>Select Booth</label><select id="bvBooth">' + boothOpts('') + '</select></div>' +
      '<div class="field full"><label>Title <span class="req">*</span></label><input type="text" id="bvTitle"><div class="error"></div></div>' +
      '<div class="field full"><div class="ptabs" style="border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px">' +
        '<button class="ptab on" id="bvTabFile" onclick="setVidKind(\'file\')">Video</button>' +
        '<button class="ptab" id="bvTabLink" onclick="setVidKind(\'link\')">Link</button></div>' +
        '<div id="bvFileWrap"><label style="font-size:0.8rem;font-weight:700">Upload Video <span class="req">*</span></label>' +
          '<div class="hint" style="margin:2px 0 8px">Recommended size 5MB</div>' +
          '<input type="file" id="bvFile" accept="video/*"><div class="error"></div></div>' +
        '<div id="bvLinkWrap" style="display:none"><div class="field"><label>Video Link <span class="req">*</span></label>' +
          '<input type="url" id="bvUrl" placeholder="https://youtube.com/watch?v=..."><div class="error"></div></div></div>' +
      '</div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="createBoothVideo()">Create</button>', true);
}
function setVidKind(k) {
  window.__vidKind = k;
  $('bvTabFile').classList.toggle('on', k === 'file');
  $('bvTabLink').classList.toggle('on', k === 'link');
  $('bvFileWrap').style.display = k === 'file' ? '' : 'none';
  $('bvLinkWrap').style.display = k === 'link' ? '' : 'none';
}
function createBoothVideo() {
  clearErrs();
  const title = $('bvTitle').value.trim();
  if (!title) { setErr('bvTitle', 'Title is required'); return; }
  const kind = window.__vidKind;
  let file = '', url = '';
  if (kind === 'file') {
    const f = $('bvFile').files[0];
    if (!f) { setErr('bvFile', 'Upload the video file'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('Video is larger than 5 MB — upload a smaller file.', 'error'); return; }
    file = f.name;
  } else {
    url = $('bvUrl').value.trim();
    if (!url) { setErr('bvUrl', 'Enter the video link'); return; }
  }
  S.booth.videos.unshift({ id: 'vid_' + Date.now(), booth: $('bvBooth').value, title: title, kind: kind, file: file, url: url, createdAt: nowStr() });
  save(); closeModal(); render();
  toast('Video "' + title + '" added', 'success');
}
function rmBoothVideo(id) {
  if (!confirm('Delete this video?')) return;
  S.booth.videos = S.booth.videos.filter((v) => v.id !== id);
  save(); render();
}

function viewBoothDocument() {
  const q = window.__bdocQ.toLowerCase();
  const all = S.booth.documents;
  const list = q ? all.filter((d) => d.title.toLowerCase().includes(q)) : all;
  const rows = list.map((d) =>
    '<div class="prod-row">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">description</span></span>' +
      '<div class="pinfo"><b>' + esc(d.title) + '</b>' +
      '<span>' + esc(d.booth) + ' · File: ' + esc(d.file) + '</span>' +
      '<span>Added ' + esc(d.createdAt) + '</span></div>' +
      '<button class="btn-link danger" onclick="rmBoothDoc(\'' + d.id + '\')" title="Delete"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>' +
    '</div>').join('');
  const empty = '<div class="empty"><span class="material-symbols-outlined">folder_open</span>' +
    '<h3>No Documents yet</h3><p>' + (all.length ? 'No documents match your search.' : 'Documents will show up here once they are added.') + '</p>' +
    '<button class="btn btn-primary" onclick="openBoothDocModal()"><span class="material-symbols-outlined">add</span>Document</button></div>';

  return '<h1 class="page-title">Document</h1>' +
    '<p class="page-sub">Brand material — upload all of your documents related to the event for your vendors, volunteers, sponsors, etc.</p>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px">' +
      '<input type="text" value="' + esc(window.__bdocQ) + '" placeholder="Search Document By Name" oninput="window.__bdocQ=this.value;render()" ' +
        'style="flex:1;min-width:220px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
      '<span class="result-count">' + list.length + ' document(s)</span>' +
      '<button class="btn btn-primary btn-sm" onclick="openBoothDocModal()"><span class="material-symbols-outlined" style="font-size:16px">add</span>Document</button>' +
    '</div>' + (rows || empty) + '</div>';
}
function openBoothDocModal() {
  openModal('Create Document',
    '<div class="form-grid">' +
      '<div class="field full"><label>Select Booth</label><select id="bdBooth">' + boothOpts('') + '</select></div>' +
      '<div class="field full"><label>Title <span class="req">*</span></label><input type="text" id="bdTitle"><div class="error"></div></div>' +
      '<div class="field full"><label>Upload Document <span class="req">*</span></label>' +
        '<div class="hint" style="margin:2px 0 8px">Recommended size 5MB</div>' +
        '<input type="file" id="bdFile" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"><div class="error"></div></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="createBoothDoc()">Create</button>', true);
}
function createBoothDoc() {
  clearErrs();
  const title = $('bdTitle').value.trim();
  if (!title) { setErr('bdTitle', 'Title is required'); return; }
  const f = $('bdFile').files[0];
  if (!f) { setErr('bdFile', 'Upload the document'); return; }
  if (f.size > 5 * 1024 * 1024) { toast('Document is larger than 5 MB — upload a smaller file.', 'error'); return; }
  S.booth.documents.unshift({ id: 'bdoc_' + Date.now(), booth: $('bdBooth').value, title: title, file: f.name, createdAt: nowStr() });
  save(); closeModal(); render();
  toast('Document "' + title + '" added', 'success');
}
function rmBoothDoc(id) {
  if (!confirm('Delete this document?')) return;
  S.booth.documents = S.booth.documents.filter((d) => d.id !== id);
  save(); render();
}

/* Register the new routes on the shared router */
ROUTES['products'] = viewProducts;
ROUTES['booth/video'] = viewBoothVideo;
ROUTES['booth/document'] = viewBoothDocument;

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
