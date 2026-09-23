/* ============================================================
   Evenuefy — Exhibition Forms + Conference Hall + Meeting Room
   Modelled 1:1 on dev.evenuefy.com exhibitor login:
     · Manage Exhibition → Exhibition Forms (5 stall-service forms;
       chargeable items go to the cart like every other payment)
     · Meeting Rooms → Conference Halls (slot booking)
     · B2B Meetings → Meeting Tables (slot booking)
   ============================================================ */

'use strict';

/* ---------------- state migration ---------------- */
(function migrateExhibition() {
  if (!S.exforms) {
    S.exforms = {
      catalogue: { tier: 'free', desc: '', collabs: [], status: 'pending' },
      sponsorship: { picked: [], status: 'pending' },
      contractor: { selected: [], status: 'pending' },
      furniture: { qty: {}, status: 'pending' },
      electrical: { qty: {}, status: 'pending' },
    };
  }
  if (!S.bookings) S.bookings = []; // {id,kind:'conference'|'b2b',name,date,slot,price}
  save();
})();

const FORM_DEADLINE = '31 Dec, 26 12:00 AM';

/* ---------------- catalogues / rate cards (from the live platform) ---------------- */
const SPONSOR_PACKS = [
  { id: 'sp_plat', name: 'Platinum Sponsorship', price: 50000, left: 0, total: 2, tag: 'Exclusive', desc: 'Aero India website · outside-venue branding · on-site branding · other benefits' },
  { id: 'sp_silver', name: 'Silver Sponsorship', price: 40000, left: 2, total: 3, tag: 'Exclusive', desc: 'On-site & outside-venue branding · website · other benefits' },
  { id: 'sp_gold', name: 'Gold Sponsorship', price: 60000, left: 2, total: 2, tag: 'Exclusive', desc: 'Gold package for two exhibitors only — website, on-site & outside-venue branding' },
  { id: 'sp_park', name: 'Car Parking (Two Hoardings at each Parking)', price: 15000, left: 8, total: 10, tag: 'Individual', desc: 'Strategic branding at designated car parking zones for arriving visitors & delegates' },
  { id: 'sp_wayin', name: 'Internal Way Finding (5 Prints)', price: 50000, left: 7, total: 10, tag: 'Individual', desc: 'Brand-integrated directional signage inside the venue across halls & key facilities' },
  { id: 'sp_wayout', name: 'External Way Finding', price: 50000, left: 10, total: 10, tag: 'Individual', desc: 'Directional branding at outdoor & entry approach points guiding visitors to the venue' },
  { id: 'sp_reg', name: 'Registration Desk (2 Reg. Desks)', price: 50000, left: 10, total: 10, tag: 'Individual', desc: 'Premium branding at the main registration & helpdesk counters' },
];

const CONTRACTORS = [
  { id: 'ct_pavilions', name: 'Pavilions and Interiors Pvt. Ltd.', services: 'Stall fabrication · furniture · electricals' },
  { id: 'ct_expobuild', name: 'ExpoBuild Services', services: 'Modular booth construction · AV setup' },
  { id: 'ct_insta', name: 'Insta Exhibitions Pvt. Ltd.', services: 'Custom design & build · signage' },
];

const FURNITURE = [
  { id: 'fu_counter', name: 'Counter (1080 x 540 x 750mm)', price: 1200 },
  { id: 'fu_cabinet', name: 'Cabinet (945 x 400 x 750mm)', price: 2500 },
  { id: 'fu_conf', name: 'Conference Table (1200 x 750mm)', price: 2200 },
  { id: 'fu_meet', name: 'Square Meeting Table (750mm)', price: 1600 },
  { id: 'fu_chair', name: 'Novia Chair (Upholstered)', price: 700 },
  { id: 'fu_stool', name: 'Bar Stool', price: 1200 },
  { id: 'fu_shelf', name: 'Shelf — Glass (300 x 1050mm)', price: 850 },
  { id: 'fu_lit', name: 'Literature Stand', price: 1200 },
  { id: 'fu_case', name: 'Glass Showcase (550 x 2000mm)', price: 6500 },
  { id: 'fu_spot', name: 'LED Spotlight (White)', price: 700 },
  { id: 'fu_tv42', name: 'LED TV, 42 inch', price: 12000 },
  { id: 'fu_fridge', name: 'Refrigerator, 165 ltr', price: 4500 },
  { id: 'fu_sofa', name: 'Box Sofa (double seater)', price: 5000 },
  { id: 'fu_bin', name: 'Dustbin', price: 200 },
];

const ELECTRICAL = [
  { id: 'el_12', name: 'For 12 hrs (Rate per KW)', price: 7000, note: 'Per-KW charge for 12 hours of supply during official event days.' },
  { id: 'el_24', name: 'For 24 hrs (Rate per KW)', price: 14000, note: 'Per-KW charge for 24 hours of continuous supply during event days.' },
  { id: 'el_pre', name: 'Pre / Post Event Days (per KW per day)', price: 3600, note: 'Working-hours supply on pre-event and post-event days.' },
];

const CONF_ROOMS = [
  { id: 'cr_50', name: 'Conference Hall for 50 people', type: 'Conference Room', persons: 50, price: 200000, mins: 120, slots: 13, amen: ['wifi', 'mode_fan'] },
  { id: 'cr_30', name: 'Conference Hall for 30 people', type: 'Conference Room', persons: 30, price: 80000, mins: 120, slots: 15, amen: ['wifi', 'mode_fan', 'coffee', 'tv'] },
];
const B2B_TABLES = [
  { id: 'bt_12', name: 'B2B Meeting Table for 12 people', type: 'Business Meeting Rooms', persons: 12, price: 15000, mins: 60, slots: 31, amen: ['wifi', 'coffee'] },
  { id: 'bt_8', name: 'B2B Meeting Table for 8 people', type: 'Business Meeting Rooms', persons: 8, price: 12000, mins: 60, slots: 33, amen: ['wifi', 'mode_fan', 'coffee', 'tv'] },
];
const AMEN_LABEL = { wifi: 'Wi-Fi', mode_fan: 'Air Conditioning', coffee: 'Tea & Coffee', tv: 'Display Screen' };
const SLOT_TIMES = ['10:00 AM', '11:30 AM', '01:00 PM', '02:30 PM', '04:00 PM'];

/* ---------------- shared bits ---------------- */
const exStatusPill = (s) => s === 'submitted'
  ? '<span class="pill green">Submitted</span>' : '<span class="pill amber">Pending</span>';
const stallLabel = () => S.stalls.length ? S.stalls[0].hall + ' · ' + S.stalls[0].stall : '—';
const wordCount = (t) => t.trim() ? t.trim().split(/\s+/).length : 0;

function exFormsSubmitted() {
  const F = S.exforms;
  return ['catalogue', 'sponsorship', 'contractor', 'furniture', 'electrical']
    .filter((k) => F[k].status === 'submitted').length;
}

/* ============================================================
   VIEW · Exhibition Forms (list)
   ============================================================ */
const EXFORM_META = [
  ['catalogue', 'Form 01', 'Catalogue Paid Entry', 'Kindly fill all the important details for listing in the directory. Please submit your catalogue details.'],
  ['sponsorship', 'Form 03', 'Sponsorship & Branding Opportunity', 'Kindly order the required sponsorship — the same will be available at your booth one day prior to the expo days.'],
  ['contractor', 'Form 04', 'Appoint Contractor', 'Kindly select & submit your appointed vendor / contractor for stall services.'],
  ['furniture', 'Form 05', 'Additional Furniture', 'Kindly order the required furniture — the same will be available at your booth one day prior to the expo days.'],
  ['electrical', 'Form 06', 'Extra Electrical Requirement & Charges Request Form', 'Request additional electrical points / load beyond the standard supply of your stall package. Chargeable as per the official rate card.'],
];

function viewExhibitionForms() {
  const cards = EXFORM_META.map(([key, no, title, desc]) =>
    '<div class="card" style="margin-top:14px;border-left:3px solid ' + (S.exforms[key].status === 'submitted' ? 'var(--green)' : 'var(--amber)') + '">' +
      '<div class="card-head-row" style="margin-bottom:6px">' +
        '<div><span class="pill blue">' + no + '</span>' +
        '<h2 class="card-title" style="margin:8px 0 2px">' + title + ' <span class="req" title="Required">★ Required</span></h2>' +
        '<p style="font-size:0.82rem;color:var(--muted);margin:0;max-width:640px">' + desc + '</p></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span class="pill gray"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">schedule</span> Deadline: ' + FORM_DEADLINE + '</span>' +
        exStatusPill(S.exforms[key].status) +
        '<span style="flex:1"></span>' +
        '<a class="btn btn-primary btn-sm" href="#/exhibition-forms/' + key + '">' + (S.exforms[key].status === 'submitted' ? 'View / Edit' : 'Submit') + '</a>' +
      '</div>' +
    '</div>').join('');

  return '<h1 class="page-title">Exhibition Forms <span class="pill blue" style="vertical-align:middle">Stall: ' + esc(stallLabel()) + '</span></h1>' +
    '<p class="page-sub">Effortlessly submit crucial information and streamline your stall services. ' + exFormsSubmitted() + ' of ' + EXFORM_META.length + ' forms submitted.</p>' +
    '<div class="card"><div style="display:flex;align-items:center;gap:14px">' +
      '<span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">groups</span></span>' +
      '<div style="flex:1"><b style="font-size:0.9rem">Exhibition Badges</b>' +
      '<div style="font-size:0.78rem;color:var(--muted)">Apply for your exhibitor badges here based on the quota allocated for your booth.</div></div>' +
      '<a class="btn btn-outline btn-sm" href="#/passes/badges">Apply</a>' +
    '</div></div>' + cards;
}

/* ============================================================
   FORM 01 · Catalogue Paid Entry
   ============================================================ */
function viewFormCatalogue() {
  const C = S.exforms.catalogue;
  const words = wordCount(C.desc);
  const maxWords = C.tier === 'extended' ? 300 : 150;
  const collabRows = C.collabs.map((c, i) =>
    '<div class="action-row"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">handshake</span></span>' +
    '<div class="atext"><b>' + esc(c.company) + '</b><span>' + esc(c.email) + ' · ' + money(20000) + '</span></div>' +
    '<button class="btn-link danger" onclick="rmCollab(' + i + ')"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button></div>').join('');

  return '<a class="back-link" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Exhibition Forms</a>' +
    '<h1 class="page-title">Catalogue Entry Detail <span class="pill blue" style="vertical-align:middle">Stall: ' + esc(stallLabel()) + '</span></h1>' +
    '<p class="page-sub">Boost your brand visibility with premium packages &amp; placements.</p>' +

    '<div class="card"><div class="card-head-row"><h2 class="card-title">Selection Guide</h2></div>' +
      '<div class="tiles" style="margin-bottom:0">' +
        '<div class="tile blue"><div class="t-label">Free Entry</div><div class="t-value" style="font-size:1.1rem">Included</div><div style="font-size:0.74rem;color:var(--muted)">Up to 150 words text description · no extra charge</div></div>' +
        '<div class="tile"><div class="t-label">Extended Entry</div><div class="t-value" style="font-size:1.1rem">' + money(15000) + '</div><div style="font-size:0.74rem;color:var(--muted)">Up to 300 words bio &amp; contact profile · company logo included</div></div>' +
        '<div class="tile"><div class="t-label">Collaborator</div><div class="t-value" style="font-size:1.1rem">' + money(20000) + '</div><div style="font-size:0.74rem;color:var(--muted)">Per additional entry for principals / agents</div></div>' +
      '</div></div>' +

    '<div class="card section-gap"><h2 class="card-title">Entry Type &amp; Description</h2>' +
      '<div class="radio-cards" style="margin:10px 0 14px">' +
        '<label class="radio-card' + (C.tier !== 'extended' ? ' selected' : '') + '" onclick="setCatTier(\'free\')"><input type="radio" name="catTier"' + (C.tier !== 'extended' ? ' checked' : '') + '><b>Free Entry</b><small>Free of cost · 150 words</small></label>' +
        '<label class="radio-card' + (C.tier === 'extended' ? ' selected' : '') + '" onclick="setCatTier(\'extended\')"><input type="radio" name="catTier"' + (C.tier === 'extended' ? ' checked' : '') + '><b>Extended Entry</b><small>' + money(15000) + ' · 300 words + logo</small></label>' +
      '</div>' +
      '<div class="field"><label>Company Description <span class="req">*</span> <span style="float:right;color:var(--muted);font-weight:500" id="catWords">' + words + ' / ' + maxWords + ' words</span></label>' +
        '<textarea id="catDesc" rows="4" oninput="document.getElementById(\'catWords\').textContent=(this.value.trim()?this.value.trim().split(/\\s+/).length:0)+\' / ' + maxWords + ' words\'" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem">' + esc(C.desc) + '</textarea>' +
        '<div class="hint">You can enter up to ' + maxWords + ' words for the ' + (C.tier === 'extended' ? 'Extended' : 'Free') + ' entry.</div><div class="error"></div></div>' +
    '</div>' +

    '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">Collaborators / Principals / Agents</h2>' +
      '<span class="result-count">Each entry costs ' + money(20000) + '</span></div>' +
      (collabRows || '<p style="color:var(--muted);font-size:0.84rem">Invite your first collaborator, principal or agent to extend your catalogue entry.</p>') +
      '<div class="form-grid" style="margin-top:12px">' +
        '<div class="field"><label>Collaborator Company</label><input type="text" id="clbCompany" placeholder="Company name"></div>' +
        '<div class="field"><label>Collaborator Email</label><input type="email" id="clbEmail" placeholder="email@company.com"><div class="error"></div></div>' +
      '</div>' +
      '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="addCollab()"><span class="material-symbols-outlined" style="font-size:16px">add</span>Add Entry</button>' +
    '</div>' +

    '<div class="bank-savebar"><b>' +
      (C.tier === 'extended' || C.collabs.length
        ? 'Payable: ' + money((C.tier === 'extended' ? 15000 : 0) + C.collabs.length * 20000) + ' — added to cart on save'
        : 'Free entry — no charge') + '</b>' +
      '<div style="display:flex;gap:10px">' +
        '<a class="btn btn-outline" href="#/exhibition-forms">Cancel</a>' +
        '<button class="btn btn-primary" onclick="saveCatalogue()"><span class="material-symbols-outlined">save</span>Save</button>' +
      '</div></div>';
}

function setCatTier(t) { S.exforms.catalogue.tier = t; S.exforms.catalogue.desc = $('catDesc').value; save(); render(); }
function addCollab() {
  clearErrs();
  const company = $('clbCompany').value.trim();
  const email = $('clbEmail').value.trim();
  if (!company) { toast('Enter the collaborator company name.', 'error'); return; }
  if (!EMAIL_RE.test(email)) { setErr('clbEmail', 'Enter a valid email address'); return; }
  S.exforms.catalogue.desc = $('catDesc').value;
  S.exforms.catalogue.collabs.push({ company: company, email: email });
  save(); render();
}
function rmCollab(i) { S.exforms.catalogue.collabs.splice(i, 1); save(); render(); }

function saveCatalogue() {
  clearErrs();
  const C = S.exforms.catalogue;
  const desc = $('catDesc').value.trim();
  const maxWords = C.tier === 'extended' ? 300 : 150;
  if (!desc) { setErr('catDesc', 'Company description is required'); return; }
  if (wordCount(desc) > maxWords) { setErr('catDesc', 'Description exceeds ' + maxWords + ' words'); return; }
  C.desc = desc;
  const fee = (C.tier === 'extended' ? 15000 : 0) + C.collabs.length * 20000;
  const already = S.cart.some((i) => i.type === 'exh_form' && i.refId === 'catalogue');
  if (fee > 0 && !already && !S.orders.some((o) => o.refId === 'catalogue')) {
    S.cart.push({
      id: uid('cart'), type: 'exh_form', refId: 'catalogue',
      label: 'Catalogue Paid Entry — ' + (C.tier === 'extended' ? 'Extended Entry' : 'Free Entry'),
      sub: (C.tier === 'extended' ? 'Extended tier' : '') + (C.collabs.length ? (C.tier === 'extended' ? ' + ' : '') + C.collabs.length + ' collaborator entr' + (C.collabs.length > 1 ? 'ies' : 'y') : ''),
      amount: fee,
    });
  }
  C.status = 'submitted';
  save(); render();
  toast('Catalogue entry saved' + (fee ? ' — ' + money(fee) + ' added to cart.' : '.'), 'success');
  location.hash = '#/exhibition-forms';
}

/* ============================================================
   FORM 03 · Sponsorship & Branding
   ============================================================ */
function viewFormSponsorship() {
  const picked = S.exforms.sponsorship.picked;
  const packCard = (p) => {
    const inCart = S.cart.some((i) => i.type === 'exh_form' && i.refId === p.id) || picked.includes(p.id);
    const soldOut = p.left === 0;
    return '<div class="feat-card' + (soldOut ? ' soon' : '') + '" style="cursor:default;min-height:150px">' +
      (soldOut ? '<span class="soon-pill">Sold Out</span>' : '<span class="soon-pill" style="background:var(--green-soft);color:var(--green)">' + p.left + ' left | ' + p.total + ' spots</span>') +
      '<span class="ficon ' + (p.tag === 'Exclusive' ? 'fc-purple' : 'fc-cyan') + '"><span class="material-symbols-outlined">verified</span></span>' +
      '<span class="ftitle">' + esc(p.name) + '</span>' +
      '<span class="fsub">' + esc(p.desc) + '</span>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:auto">' +
        '<b style="font-size:0.95rem">' + money(p.price) + '</b><span style="font-size:0.7rem;color:var(--muted)">+ GST</span>' +
        '<span style="flex:1"></span>' +
        (soldOut ? '<span class="pill gray">Unavailable</span>'
          : inCart ? '<span class="pill green">In Cart</span>'
          : '<button class="btn btn-outline btn-sm" onclick="addSponsorToCart(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:15px">add_shopping_cart</span>Add to Cart</button>') +
      '</div></div>';
  };
  return '<a class="back-link" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Exhibition Forms</a>' +
    '<h1 class="page-title">Sponsorship &amp; Branding Opportunity</h1>' +
    '<p class="page-sub">Comprehensive sponsorship offerings — boost your brand visibility with premium packages &amp; placements. Availability is live: "X left | Y spots".</p>' +
    '<h2 class="card-title">Exclusive Packages</h2>' +
    '<div class="feat-grid" style="margin-bottom:20px">' + SPONSOR_PACKS.filter((p) => p.tag === 'Exclusive').map(packCard).join('') + '</div>' +
    '<h2 class="card-title">Individual Sponsorship Packages</h2>' +
    '<div class="feat-grid">' + SPONSOR_PACKS.filter((p) => p.tag === 'Individual').map(packCard).join('') + '</div>';
}

function addSponsorToCart(id) {
  const p = SPONSOR_PACKS.find((x) => x.id === id);
  if (!p || p.left === 0) return;
  S.cart.push({
    id: uid('cart'), type: 'exh_form', refId: p.id,
    label: 'Sponsorship — ' + p.name, sub: p.tag + ' package · + GST', amount: p.price,
  });
  S.exforms.sponsorship.picked.push(id);
  S.exforms.sponsorship.status = 'submitted';
  save(); render();
  toast(p.name + ' added to cart — ' + money(p.price), 'success');
}

/* ============================================================
   FORM 04 · Appoint Contractor
   ============================================================ */
function viewFormContractor() {
  const F = S.exforms.contractor;
  const rows = CONTRACTORS.map((c) =>
    '<label class="check-item' + (F.selected.includes(c.id) ? ' selected' : '') + '" style="display:flex;margin:8px 0" onclick="event.preventDefault();toggleContractor(\'' + c.id + '\')">' +
      '<input type="checkbox"' + (F.selected.includes(c.id) ? ' checked' : '') + '>' +
      '<span><b>' + esc(c.name) + '</b><span class="td-sub">' + esc(c.services) + '</span></span></label>').join('');
  return '<a class="back-link" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Exhibition Forms</a>' +
    '<h1 class="page-title">Appoint Contractor <span class="pill blue" style="vertical-align:middle">Stall: ' + esc(stallLabel()) + '</span></h1>' +
    '<p class="page-sub">Kindly select &amp; submit your appointed vendor / contractor.</p>' +
    '<div class="card"><div class="pcard-head">' +
      '<span class="icon-sq" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">engineering</span></span>' +
      '<h2 class="card-title">Select Contractors</h2></div>' +
      '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 8px">Choose one or more service providers for your stall.</p>' +
      rows +
      '<label class="check-item' + (F.accepted ? ' selected' : '') + '" style="display:flex;margin-top:16px" onclick="event.preventDefault();S.exforms.contractor.accepted=!S.exforms.contractor.accepted;save();render()">' +
        '<input type="checkbox"' + (F.accepted ? ' checked' : '') + '>I have read and accept the <a class="btn-link" style="padding:0 4px" onclick="event.stopPropagation()">Terms and Conditions</a></label>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px">' +
        '<button class="btn btn-primary" onclick="submitContractor()">Submit</button></div>' +
    '</div>';
}
function toggleContractor(id) {
  const a = S.exforms.contractor.selected;
  a.includes(id) ? a.splice(a.indexOf(id), 1) : a.push(id);
  save(); render();
}
function submitContractor() {
  const F = S.exforms.contractor;
  if (!F.selected.length) { toast('Select at least one contractor.', 'error'); return; }
  if (!F.accepted) { toast('Please accept the Terms and Conditions.', 'error'); return; }
  F.status = 'submitted';
  save(); render();
  toast('Contractor appointment submitted.', 'success');
  location.hash = '#/exhibition-forms';
}

/* ============================================================
   FORM 05 / 06 · Furniture & Electrical (rate-card + qty steppers)
   ============================================================ */
function qtyStepper(formKey, itemId, qty) {
  return '<div style="display:inline-flex;align-items:center;gap:8px">' +
    '<button class="btn btn-outline btn-sm" style="padding:3px 8px" onclick="stepQty(\'' + formKey + '\',\'' + itemId + '\',-1)">−</button>' +
    '<b class="num" style="min-width:20px;text-align:center">' + qty + '</b>' +
    '<button class="btn btn-outline btn-sm" style="padding:3px 8px" onclick="stepQty(\'' + formKey + '\',\'' + itemId + '\',1)">+</button></div>';
}
function stepQty(formKey, itemId, d) {
  const q = S.exforms[formKey].qty;
  q[itemId] = Math.max(0, (q[itemId] || 0) + d);
  if (!q[itemId]) delete q[itemId];
  save(); render();
}
function rateCardTotal(formKey, items) {
  const q = S.exforms[formKey].qty;
  return items.reduce((a, it) => a + (q[it.id] || 0) * it.price, 0);
}

function viewFormFurniture() {
  const q = S.exforms.furniture.qty;
  const rows = FURNITURE.map((it) =>
    '<div class="action-row"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">chair</span></span>' +
    '<div class="atext"><b>' + esc(it.name) + '</b><span>' + money(it.price) + ' · Pavilions and Interiors Pvt. Ltd.</span></div>' +
    qtyStepper('furniture', it.id, q[it.id] || 0) + '</div>').join('');
  const total = rateCardTotal('furniture', FURNITURE);
  return '<a class="back-link" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Exhibition Forms</a>' +
    '<h1 class="page-title">Additional Furniture <span class="pill blue" style="vertical-align:middle">Stall: ' + esc(stallLabel()) + '</span></h1>' +
    '<p class="page-sub">Kindly order the required furniture — it will be available at your booth one day prior to the expo days.</p>' +
    '<div class="card">' + rows +
      '<div class="bank-savebar"><b>Total: ' + money(total) + '</b>' +
      '<button class="btn btn-primary" onclick="submitRateCard(\'furniture\', \'Additional Furniture\')"' + (total ? '' : ' disabled') + '><span class="material-symbols-outlined">shopping_cart</span>Submit &amp; Add to Cart</button></div>' +
    '</div>';
}

function viewFormElectrical() {
  const q = S.exforms.electrical.qty;
  const rows = ELECTRICAL.map((it) =>
    '<div class="action-row"><span class="aicon" style="background:#FFF4E0;color:var(--amber)"><span class="material-symbols-outlined">bolt</span></span>' +
    '<div class="atext"><b>' + esc(it.name) + ' — ' + money(it.price) + '</b><span>' + esc(it.note) + '</span></div>' +
    '<span style="font-size:0.72rem;color:var(--muted);font-weight:700">KW</span>' +
    qtyStepper('electrical', it.id, q[it.id] || 0) + '</div>').join('');
  const total = rateCardTotal('electrical', ELECTRICAL);
  return '<a class="back-link" href="#/exhibition-forms"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to Exhibition Forms</a>' +
    '<h1 class="page-title">Extra Electrical Requirement <span class="pill blue" style="vertical-align:middle">Stall: ' + esc(stallLabel()) + '</span></h1>' +
    '<p class="page-sub">Request additional electrical points / load beyond your stall package — chargeable as per the official rate card.</p>' +
    '<div class="note"><b class="title">Disclaimer</b>By submitting this form, the exhibitor confirms that the additional electrical requirements mentioned are correct and approved by the exhibitor’s authorised representative.</div>' +
    '<div class="card">' + rows +
      '<div class="bank-savebar"><b>Total: ' + money(total) + '</b>' +
      '<button class="btn btn-primary" onclick="submitRateCard(\'electrical\', \'Extra Electrical Requirement\')"' + (total ? '' : ' disabled') + '><span class="material-symbols-outlined">shopping_cart</span>Submit &amp; Add to Cart</button></div>' +
    '</div>';
}

function submitRateCard(formKey, label) {
  const items = formKey === 'furniture' ? FURNITURE : ELECTRICAL;
  const q = S.exforms[formKey].qty;
  const total = rateCardTotal(formKey, items);
  if (!total) return;
  const n = Object.keys(q).length;
  S.cart.push({
    id: uid('cart'), type: 'exh_form', refId: formKey + '_' + Date.now(),
    label: label, sub: n + ' item(s) · ' + stallLabel(), amount: total,
  });
  S.exforms[formKey].status = 'submitted';
  S.exforms[formKey].qty = {};
  save(); render();
  toast(label + ' — ' + money(total) + ' added to cart.', 'success');
  location.hash = '#/exhibition-forms';
}

/* ============================================================
   VIEW · Conference Hall & Meeting Room (slot booking → cart)
   ============================================================ */
function bookingConfirmed(b) { return S.orders.some((o) => o.refId === b.id); }
function bookingPending(b) { return S.cart.some((i) => i.refId === b.id); }

/* platform-style room card: image banner + slots badge + amenities */
function roomCard(r, kind, btn) {
  return '<div class="room-card">' +
    '<div class="room-banner ' + (kind === 'conference' ? 'rb-conf' : 'rb-b2b') + '">' +
      '<span class="slots-badge">' + r.slots + ' Slots</span>' +
      '<span class="avail-badge">Available</span>' +
      '<span class="material-symbols-outlined">' + (kind === 'conference' ? 'meeting_room' : 'handshake') + '</span>' +
    '</div>' +
    '<div class="room-body">' +
      '<b class="rname">' + esc(r.name) + '</b>' +
      '<span class="rtype">' + esc(r.type) + '</span>' +
      '<div class="room-meta">' +
        '<span class="pax-chip"><span class="material-symbols-outlined" style="font-size:15px">group</span>' + r.persons + ' Persons</span>' +
        '<span class="amen-row">' + r.amen.map((a) => '<span class="material-symbols-outlined" title="' + AMEN_LABEL[a] + '">' + a + '</span>').join('') + '</span>' +
      '</div>' +
      '<div class="room-foot">' +
        '<span class="price"><b>' + money(r.price) + '</b> <small>/' + r.mins + '-minutes</small></span>' +
        btn +
      '</div>' +
    '</div></div>';
}

function openRoomDetail(kind, roomId) {
  const list = kind === 'conference' ? CONF_ROOMS : B2B_TABLES;
  const r = list.find((x) => x.id === roomId);
  openModal(esc(r.name),
    '<div class="room-banner ' + (kind === 'conference' ? 'rb-conf' : 'rb-b2b') + '" style="border-radius:10px;margin-bottom:14px">' +
      '<span class="slots-badge">' + r.slots + ' Slots</span>' +
      '<span class="material-symbols-outlined">' + (kind === 'conference' ? 'meeting_room' : 'handshake') + '</span></div>' +
    '<div class="pkv">' +
      '<div class="cell"><div class="k">Category</div><div class="v">' + esc(r.type) + '</div></div>' +
      '<div class="cell"><div class="k">Capacity</div><div class="v">' + r.persons + ' Persons</div></div>' +
      '<div class="cell"><div class="k">Slot Duration</div><div class="v">' + r.mins + ' minutes</div></div>' +
      '<div class="cell"><div class="k">Price per Slot</div><div class="v">' + money(r.price) + '</div></div>' +
      '<div class="cell full"><div class="k">Amenities</div><div class="v">' + r.amen.map((a) => AMEN_LABEL[a]).join(' · ') + '</div></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Close</button>' +
    '<button class="btn btn-primary" onclick="openBookingModal(\'' + kind + '\',\'' + r.id + '\')">Book Slot</button>', true);
}

function bookingsList(kind) {
  const list = S.bookings.filter((b) => b.kind === kind);
  if (!list.length) return '';
  const rows = list.map((b, i) =>
    '<tr><td>' + (i + 1) + '</td><td class="td-strong">' + esc(b.name) + '</td>' +
    '<td>' + esc(b.date) + '</td><td>' + esc(b.slot) + '</td>' +
    '<td class="money">' + money(b.price) + '</td>' +
    '<td>' + (bookingConfirmed(b) ? '<span class="pill green">Confirmed</span>'
      : bookingPending(b) ? '<span class="pill amber">Payment Pending</span>'
      : '<span class="pill gray">Draft</span>') + '</td>' +
    '<td class="td-actions">' + (bookingConfirmed(b) ? '' :
      '<button class="btn-link danger" onclick="cancelBooking(\'' + b.id + '\')">Cancel</button>') + '</td></tr>').join('');
  return '<div class="card section-gap"><div class="card-head-row"><h2 class="card-title">My Bookings</h2></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>Room / Table</th><th>Date</th><th>Slot</th><th>Amount</th><th>Status</th><th></th></tr>' +
    rows + '</table></div></div>';
}

/* Meeting Rooms — the platform page lists BOTH categories with a
   search bar and category filter chips; cards use View Details. */
window.__mrQ = window.__mrQ || '';
window.__mrType = window.__mrType || '';
function mrSetQ(v) { window.__mrQ = v; render(); const el = $('mrQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }

function viewConferenceHall() {
  const all = B2B_TABLES.map((r) => ({ r: r, kind: 'b2b' })).concat(CONF_ROOMS.map((r) => ({ r: r, kind: 'conference' })));
  const q = window.__mrQ.toLowerCase();
  let list = all;
  if (q) list = list.filter((x) => x.r.name.toLowerCase().includes(q));
  if (window.__mrType) list = list.filter((x) => x.r.type === window.__mrType);
  const chip = (label) =>
    '<button class="fchip' + (window.__mrType === label ? ' on' : '') + '" onclick="window.__mrType=window.__mrType===\'' + label + '\'?\'\':\'' + label + '\';render()">' +
      '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">group</span> ' + label + '</button>';
  return '<h1 class="page-title">Meeting Rooms</h1>' +
    '<p class="page-sub">Business meeting rooms and conference halls for your delegation briefings, product launches and press meets. Payment via cart.</p>' +
    '<div class="card" style="margin-bottom:16px"><div class="card-head-row" style="margin-bottom:0;flex-wrap:wrap;gap:10px">' +
      '<input type="text" id="mrQ" value="' + esc(window.__mrQ) + '" placeholder="Search by Meeting Rooms" oninput="mrSetQ(this.value)" ' +
        'style="flex:1;min-width:220px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
      '<div class="filter-chips">' + chip('Business Meeting Rooms') + chip('Conference Room') + '</div>' +
    '</div></div>' +
    '<div class="room-grid">' +
      list.map((x) => roomCard(x.r, x.kind,
        '<button class="btn btn-primary btn-sm" onclick="openRoomDetail(\'' + x.kind + '\',\'' + x.r.id + '\')">View Details</button>')).join('') +
    '</div>' +
    bookingsList('conference') + bookingsList('b2b');
}

/* B2B Meetings — Meeting Table page: PAX filter chips + Book Slot */
window.__btPax = window.__btPax || 0;
function viewMeetingRoom() {
  let list = B2B_TABLES;
  if (window.__btPax) list = list.filter((r) => r.persons === window.__btPax);
  const paxChip = (v, label, count) =>
    '<button class="fchip' + (window.__btPax === v ? ' on' : '') + '" onclick="window.__btPax=' + v + ';render()">' + label +
      ' <span class="pill blue" style="margin-left:4px">' + count + '</span></button>';
  return '<h1 class="page-title">Meeting Table</h1>' +
    '<p class="page-sub">Book a B2B meeting table for your matchmaking meetings — 60-minute slots; payment via cart.</p>' +
    '<div class="card" style="margin-bottom:16px"><div class="card-head-row" style="margin-bottom:0;flex-wrap:wrap;gap:10px">' +
      '<div class="filter-chips">' +
        paxChip(0, 'ALL', B2B_TABLES.length) +
        paxChip(8, '8 PAX', B2B_TABLES.filter((r) => r.persons === 8).length) +
        paxChip(12, '12 PAX', B2B_TABLES.filter((r) => r.persons === 12).length) +
      '</div>' +
      '<span class="pill green">' + list.length + ' AVAILABLE NOW</span>' +
    '</div></div>' +
    '<div class="room-grid">' +
      list.map((r) => roomCard(r, 'b2b',
        '<button class="btn btn-primary btn-sm" onclick="openBookingModal(\'b2b\',\'' + r.id + '\')">Book Slot</button>')).join('') +
    '</div>' +
    bookingsList('b2b');
}

function openBookingModal(kind, roomId) {
  const list = kind === 'conference' ? CONF_ROOMS : B2B_TABLES;
  const r = list.find((x) => x.id === roomId);
  openModal('Book Slot — ' + esc(r.name),
    '<div class="form-grid">' +
      '<div class="field"><label>Event Date <span class="req">*</span></label><select id="bkDate">' +
        EVENT.eventDays.map((d) => '<option>' + d + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Time Slot <span class="req">*</span></label><select id="bkSlot">' +
        SLOT_TIMES.map((t) => '<option>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field full"><div class="note" style="margin:0"><b class="title">' + esc(r.name) + '</b>' +
        r.persons + ' persons · ' + r.mins + ' minutes · ' + money(r.price) + ' per slot. The amount is added to your cart; the slot is confirmed on payment.</div></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="confirmBooking(\'' + kind + '\',\'' + roomId + '\')">Add to Cart</button>', true);
}
function confirmBooking(kind, roomId) {
  const list = kind === 'conference' ? CONF_ROOMS : B2B_TABLES;
  const r = list.find((x) => x.id === roomId);
  const date = $('bkDate').value, slot = $('bkSlot').value;
  if (S.bookings.some((b) => b.roomId === roomId && b.date === date && b.slot === slot)) {
    toast('You already booked this slot for this room.', 'error'); return;
  }
  const id = uid('cart') + '_bk';
  S.bookings.push({ id: id, kind: kind, roomId: roomId, name: r.name, date: date, slot: slot, price: r.price, createdAt: nowStr() });
  S.cart.push({
    id: uid('cart'), type: 'booking', refId: id,
    label: (kind === 'conference' ? 'Conference Hall' : 'B2B Table') + ' — ' + r.name,
    sub: date + ' · ' + slot + ' · ' + r.mins + ' min', amount: r.price,
  });
  save(); closeModal(); render();
  toast('Slot added to cart — ' + money(r.price), 'success');
}
function cancelBooking(id) {
  if (!confirm('Cancel this booking? Any unpaid cart item for it is removed too.')) return;
  S.bookings = S.bookings.filter((b) => b.id !== id);
  S.cart = S.cart.filter((i) => i.refId !== id);
  save(); render();
  toast('Booking cancelled.', 'success');
}

/* ---------------- routes ---------------- */
ROUTES['exhibition-forms'] = viewExhibitionForms;
ROUTES['exhibition-forms/catalogue'] = viewFormCatalogue;
ROUTES['exhibition-forms/sponsorship'] = viewFormSponsorship;
ROUTES['exhibition-forms/contractor'] = viewFormContractor;
ROUTES['exhibition-forms/furniture'] = viewFormFurniture;
ROUTES['exhibition-forms/electrical'] = viewFormElectrical;
ROUTES['conference-hall'] = viewConferenceHall;
ROUTES['meeting-room'] = viewMeetingRoom;
