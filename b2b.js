/* ============================================================
   Evenuefy — B2B Matchmaking
   Pairs the exhibitor's MATCHMAKING fields (Offering, plus
   Exhibition Categories as a secondary signal) with what visiting
   companies / delegations are LOOKING FOR, and lets the exhibitor
   request B2B meetings with them (date · slot · venue · agenda).
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */
(function migrateB2B() {
  if (!S.b2b) {
    S.b2b = {
      meetings: [
        {
          id: 'mtg_seed1', partId: 'pt_garuda', name: 'Cmdr. Arjun Nair (Retd.)', company: 'Garuda Aerospace Services',
          date: '11 Feb 2027', slot: '11:30 AM', venue: 'My Booth (Hall A · A8.5)',
          note: 'Interested in MRO partnership for naval helicopters.',
          direction: 'incoming', status: 'pending', createdAt: '21 Sept 2026, 05:20 pm',
        },
        {
          id: 'mtg_seed2', partId: 'pt_meridian', name: 'Sofia Andersson', company: 'Meridian Defence Logistics (Sweden)',
          date: '12 Feb 2027', slot: '02:30 PM', venue: 'B2B Meeting Table',
          note: 'Exploring spares supply-chain collaboration in South Asia.',
          direction: 'incoming', status: 'pending', createdAt: '22 Sept 2026, 09:05 am',
        },
      ],
    };
  }
  /* TEAM MEMBERS of the exhibiting company — visitors can request a
     meeting with a specific member; ALL such requests are visible in
     this MAIN exhibitor login, and either the member or the main
     login can approve them. */
  if (!S.b2b.team) {
    S.b2b.team = [
      { id: 'tm_main', name: 'Dhiren Shah', desig: 'Nodal Officer (Main Login)', email: 'dhirens@evenuefy.com' },
      { id: 'tm_nikhil', name: 'Nikhil Sharma', desig: 'GM — Exhibitions', email: 'nikhil.sharma@hal-india.co.in' },
      { id: 'tm_priya', name: 'Priya Menon', desig: 'Marketing Head', email: 'priya.menon@hal-india.co.in' },
      { id: 'tm_rakesh', name: 'Rakesh Verma', desig: 'MRO Business Lead', email: 'rakesh.verma@hal-india.co.in' },
      { id: 'tm_asha', name: 'Asha Iyer', desig: 'Design & Avionics SPOC', email: 'asha.iyer@hal-india.co.in' },
    ];
    // existing seeded incoming requests were addressed to specific members
    const assign = { mtg_seed1: 'tm_rakesh', mtg_seed2: 'tm_priya' };
    S.b2b.meetings.forEach((m, i) => {
      if (!m.memberId) m.memberId = assign[m.id] || S.b2b.team[i % S.b2b.team.length].id;
    });
    // a third demo request for another member, so the team view is rich
    if (!S.b2b.meetings.some((m) => m.id === 'mtg_seed3')) {
      S.b2b.meetings.push({
        id: 'mtg_seed3', partId: 'pt_helios', name: 'Daniel Moreau', company: 'Helios Avionique (France)',
        date: '13 Feb 2027', slot: '10:00 AM', venue: 'Their Booth / Delegation Lounge',
        note: 'Avionics co-development discussion with your design team.',
        direction: 'incoming', status: 'pending', createdAt: '23 Sept 2026, 11:40 am', memberId: 'tm_asha',
      });
    }
  }
  save();
})();

const teamById = (id) => S.b2b.team.find((t) => t.id === id);
const memberName = (m) => { const t = m.memberId && teamById(m.memberId); return t ? t.name : 'Dhiren Shah'; };

/* ---------------- visiting companies / delegations (demo directory) ----------------
   In production this list streams from visitor registrations; each
   entry carries the visitor-side "I am Looking For" selections. */
const PARTICIPANTS = [
  { id: 'pt_garuda', name: 'Cmdr. Arjun Nair (Retd.)', desig: 'Director — Procurement', company: 'Garuda Aerospace Services', country: 'India', state: 'Karnataka', city: 'Bengaluru', type: 'Visitor',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Overhaul Services', 'Repair Services'], 'Helicopters & Rotary Wing': ['Naval Helicopters'] } },
  { id: 'pt_meridian', name: 'Sofia Andersson', desig: 'Head of Sourcing', company: 'Meridian Defence Logistics', country: 'Sweden', state: 'Stockholm County', city: 'Stockholm', type: 'Delegation',
    lookingFor: { 'MRO & Lifecycle Support': ['Spares & Consumables Supply', 'Upgrades & Retrofits'], 'Defence Logistics & Supply Chain': ['Warehousing Solutions'] } },
  { id: 'pt_skyhawk', name: 'Maj. Gen. R. K. Bisht (Retd.)', desig: 'Advisor', company: 'SkyHawk Defence Consultants', country: 'India', state: 'Delhi', city: 'New Delhi', type: 'Visitor',
    lookingFor: { 'Aircraft Systems (Fixed Wing)': ['Fighter Aircraft', 'Light Combat Aircraft'], 'Simulation & Training': ['Flight Simulators'] } },
  { id: 'pt_helios', name: 'Daniel Moreau', desig: 'VP Business Development', company: 'Helios Avionique', country: 'France', state: 'Île-de-France', city: 'Paris', type: 'Delegation',
    lookingFor: { 'Avionics': ['Mission Computers', 'Cockpit Displays / Glass Cockpits', 'Head-Up Displays (HUD)'] } },
  { id: 'pt_indocoast', name: 'Capt. Meera Pillai', desig: 'Fleet Manager', company: 'IndoCoast Marine Services', country: 'India', state: 'Kerala', city: 'Kochi', type: 'Visitor',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Fleet Sustainment & Life Extension Programmes'], 'Naval Platforms': ['Offshore Patrol Vessels (OPVs)'] } },
  { id: 'pt_zenith', name: 'Kenji Watanabe', desig: 'Chief Engineer', company: 'Zenith Precision Industries', country: 'Japan', state: 'Tokyo', city: 'Tokyo', type: 'Delegation',
    lookingFor: { 'Precision Engineering': ['CNC Machining', 'Bearings'], 'Advanced Materials': ['Composite Materials'] } },
  { id: 'pt_deccan', name: 'Ishaan Reddy', desig: 'Founder & CEO', company: 'Deccan UAV Labs', country: 'India', state: 'Telangana', city: 'Hyderabad', type: 'Exhibitor',
    lookingFor: { 'Unmanned Aerial Systems': ['Fixed-Wing UAVs', 'UAV Ground Control Stations'], 'Engines & Propulsion': ['Turboprop Engines'] } },
  { id: 'pt_atlas', name: 'Hannah Cole', desig: 'Programme Director', company: 'Atlas AeroWorks', country: 'United Kingdom', state: 'England', city: 'Bristol', type: 'Delegation',
    lookingFor: { 'Aircraft Systems (Fixed Wing)': ['Basic Trainer Aircraft'], 'MRO & Lifecycle Support': ['Overhaul Services', 'Technical Publications & Documentation'] } },
  { id: 'pt_sarang', name: 'Dr. Nivedita Rao', desig: 'Director — R&D', company: 'Sarang Defence Research', country: 'India', state: 'Karnataka', city: 'Bengaluru', type: 'Visitor',
    lookingFor: { 'Artificial Intelligence & Autonomy': ['Computer Vision', 'AI Decision Support Systems'], 'Simulation & Training': ['Wargaming & Decision Simulation'] } },
  { id: 'pt_gulfwing', name: 'Omar Al-Farsi', desig: 'Procurement Head', company: 'GulfWing Aviation', country: 'UAE', state: 'Dubai', city: 'Dubai', type: 'Delegation',
    lookingFor: { 'Helicopters & Rotary Wing': ['Utility Helicopters', 'VIP Helicopters'], 'MRO & Lifecycle Support': ['Maintenance Services'] } },
  { id: 'pt_volga', name: 'Elena Petrova', desig: 'Export Director', company: 'Volga Dynamics', country: 'Russia', state: 'Moscow Oblast', city: 'Moscow', type: 'Delegation',
    lookingFor: { 'Missile Systems': ['Surface-to-Air Missiles', 'Air-to-Air Missiles (Short/Medium/Long Range)'], 'Radar Systems': ['Fire Control Radar'] } },
  { id: 'pt_delta', name: 'Tom van der Berg', desig: 'Naval Programmes Lead', company: 'Delta Naval Systems', country: 'Netherlands', state: 'South Holland', city: 'Rotterdam', type: 'Delegation',
    lookingFor: { 'Naval Combat & Communication Systems': ['Naval Communication Systems'], 'Underwater Warfare': ['Sonar Systems (Hull-Mounted Towed Dipping)'] } },
  { id: 'pt_chennaiprop', name: 'Ananya Krishnan', desig: 'Head — Sourcing', company: 'Chennai Propulsion Works', country: 'India', state: 'Tamil Nadu', city: 'Chennai', type: 'Visitor',
    lookingFor: { 'Engines & Propulsion': ['Turbofan Engines', 'Turboprop Engines'], 'Precision Engineering': ['Gear Systems & Transmissions'] } },
  { id: 'pt_sahel', name: 'David Okafor', desig: 'Chief of Acquisitions', company: 'Sahel Defence Group', country: 'Nigeria', state: 'Lagos State', city: 'Lagos', type: 'Delegation',
    lookingFor: { 'Land Combat Vehicles': ['Main Battle Tanks (MBTs)', 'Armoured Personnel Carriers (APCs)'], 'Soldier Systems': ['Body Armour & Ballistic Plates'] } },
  { id: 'pt_pacaero', name: 'Chen Wei', desig: 'Supply Chain Director', company: 'Pacific AeroStructures', country: 'Singapore', state: 'Singapore', city: 'Singapore', type: 'Exhibitor',
    lookingFor: { 'Aerospace Structures': ['Airframes', 'Composite Aerostructures'], 'Advanced Materials': ['Composite Materials'] } },
  { id: 'pt_falcon', name: 'Fatima Al-Zahra', desig: 'Fleet Director', company: 'Qatar Falcon Aviation', country: 'Qatar', state: 'Doha', city: 'Doha', type: 'Delegation',
    lookingFor: { 'Helicopters & Rotary Wing': ['VIP Helicopters'], 'MRO & Lifecycle Support': ['Maintenance Services', 'Spares & Consumables Supply'] } },
  { id: 'pt_punjabforge', name: 'Rajat Kapoor', desig: 'Managing Director', company: 'Punjab Forge & Precision', country: 'India', state: 'Punjab', city: 'Ludhiana', type: 'Visitor',
    lookingFor: { 'Precision Engineering': ['Forging', 'CNC Machining', 'Heat Treatment'] } },
  { id: 'pt_adria', name: 'Lisa Novak', desig: 'CEO', company: 'Adria Simulation Labs', country: 'Czech Republic', state: 'Prague', city: 'Prague', type: 'Exhibitor',
    lookingFor: { 'Simulation & Training': ['Flight Simulators', 'Mission & Tactics Simulators'] } },
  { id: 'pt_cybershield', name: 'Vikrant Desai', desig: 'CTO', company: 'Pune Cyber Shield', country: 'India', state: 'Maharashtra', city: 'Pune', type: 'Visitor',
    lookingFor: { 'Cyber Security': ['Network Security', 'Security Operations Centres (SOC)'] } },
  { id: 'pt_caledonia', name: 'James Morrison', desig: 'Partnerships Director', company: 'Caledonia MRO Partners', country: 'United Kingdom', state: 'Scotland', city: 'Glasgow', type: 'Delegation',
    lookingFor: { 'MRO & Lifecycle Support': ['Overhaul Services', 'Repair Services', 'Upgrades & Retrofits'] } },
  { id: 'pt_sakura', name: 'Aiko Tanaka', desig: 'Mission Director', company: 'Sakura Space Systems', country: 'Japan', state: 'Osaka', city: 'Osaka', type: 'Delegation',
    lookingFor: { 'Space Systems': ['Communication Satellites', 'Earth Observation Satellites'] } },
  { id: 'pt_emirland', name: 'Mohammed Rashid', desig: 'Programmes Head', company: 'Emirates Land Systems', country: 'UAE', state: 'Abu Dhabi', city: 'Abu Dhabi', type: 'Delegation',
    lookingFor: { 'Armoured Vehicle Technologies': ['Composite Armour', 'Reactive Armour'], 'Land Combat Vehicles': ['Infantry Fighting Vehicles (IFVs)'] } },
  { id: 'pt_nagpuruav', name: 'Neha Kulkarni', desig: 'Co-Founder', company: 'Nagpur UAV Dynamics', country: 'India', state: 'Maharashtra', city: 'Nagpur', type: 'Exhibitor',
    lookingFor: { 'Unmanned Aerial Systems': ['Fixed-Wing UAVs', 'Rotary-Wing / Multirotor UAVs', 'Drone Payloads (ISR EW Weapons)'] } },
  { id: 'pt_nordic', name: 'Erik Johansson', desig: 'Sales Director', company: 'Nordic Radar Solutions', country: 'Sweden', state: 'Västra Götaland', city: 'Gothenburg', type: 'Exhibitor',
    lookingFor: { 'Radar Systems': ['Ground Surveillance Radar', 'AESA (Active Electronically Scanned Array) Radar'], 'Electronic Warfare': ['Electronic Countermeasures (ECM)'] } },
  { id: 'pt_andes', name: 'Carlos Mendez', desig: 'Logistics Head', company: 'Andes Defence Logistics', country: 'Brazil', state: 'São Paulo', city: 'São Paulo', type: 'Delegation',
    lookingFor: { 'Defence Logistics & Supply Chain': ['Warehousing Solutions', 'Packaging Solutions', 'Freight & Transportation Services'] } },
];

/* deterministic demo contact details for the profile page */
function ptEmail(p) {
  return p.name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/)[0].toLowerCase() + '@' +
    p.company.replace(/[^A-Za-z]/g, '').toLowerCase().slice(0, 12) + '.com';
}
function ptPhone(p) {
  let h = 0; for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  return '+' + (p.country === 'India' ? '91 98' : '00 55') + String(10000000 + (h % 89999999)).slice(0, 8);
}

/* ---------------- match math ---------------- */
const flatSubs = (map) => Object.keys(map || {}).reduce((a, k) => a.concat(map[k]), []);

function b2bMatchInfo(p) {
  const M = S.profile.matchmaking;
  const off = flatSubs(M.offering);
  const cats = flatSubs(M.exCats);
  const want = flatSubs(p.lookingFor);
  const offHit = want.filter((s) => off.includes(s));
  const catHit = want.filter((s) => cats.includes(s) && !offHit.includes(s));
  const pct = want.length ? Math.round(((offHit.length + catHit.length * 0.5) / want.length) * 100) : 0;
  return { offHit: offHit, catHit: catHit, pct: Math.min(100, pct) };
}

/* ---------------- views ---------------- */
window.__b2bTab = window.__b2bTab || 'matches';
window.__b2bQ = window.__b2bQ || '';
window.__b2bMin = window.__b2bMin || 0;

function b2bIncomingPending() {
  return S.b2b.meetings.filter((m) => m.direction === 'incoming' && m.status === 'pending').length;
}

function viewB2BMatchmaking() {
  const pend = b2bIncomingPending();
  const tabs = '<div class="ptabs" style="border-bottom:none;padding-bottom:0;margin-bottom:16px">' +
    '<button class="ptab' + (window.__b2bTab === 'matches' ? ' on' : '') + '" onclick="window.__b2bTab=\'matches\';render()">Recommended Matches</button>' +
    '<button class="ptab' + (window.__b2bTab === 'meetings' ? ' on' : '') + '" onclick="window.__b2bTab=\'meetings\';render()">My Meetings' +
      (pend ? ' <span class="pill amber" style="margin-left:4px">' + pend + '</span>' : '') + '</button>' +
    '</div>';
  return '<h1 class="page-title">B2B Matchmaking</h1>' +
    '<p class="page-sub">Visitors &amp; delegations whose <b>"I am Looking For"</b> matches your <b>Offering</b> &amp; exhibition categories — request a meeting directly from a match.</p>' +
    tabs + (window.__b2bTab === 'meetings' ? b2bMeetingsBody() : b2bMatchesBody());
}

window.__b2bView = window.__b2bView || 'grid';
window.__b2bCat = window.__b2bCat || '';
window.__b2bSub = window.__b2bSub || '';
window.__b2bCountry = window.__b2bCountry || '';
window.__b2bState = window.__b2bState || '';
window.__b2bCity = window.__b2bCity || '';
window.__b2bPage = window.__b2bPage || 1;
const B2B_PAGE = 9;
function b2bSetQ(v) { window.__b2bQ = v; window.__b2bPage = 1; render(); const el = $('b2bQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function b2bSetCountry(v) { window.__b2bCountry = v; window.__b2bState = ''; window.__b2bCity = ''; window.__b2bPage = 1; render(); }
function b2bSetState(v) { window.__b2bState = v; window.__b2bCity = ''; window.__b2bPage = 1; render(); }
function b2bPageGo(d) { window.__b2bPage += d; render(); window.scrollTo(0, 0); }

function b2bToggleFav(id) {
  if (!S.b2b.favs) S.b2b.favs = [];
  const a = S.b2b.favs;
  a.includes(id) ? a.splice(a.indexOf(id), 1) : a.push(id);
  save(); render();
}

function b2bMatchPill(p) {
  const already = S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status !== 'declined');
  if (!already) return '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openMeetingModal(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:15px">event</span>Request Meeting</button>';
  return S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status === 'confirmed')
    ? '<span class="pill green">Meeting Confirmed</span>' : '<span class="pill amber">Meeting Requested</span>';
}
const b2bScoreColor = (pct) => pct >= 60 ? 'var(--green)' : pct >= 30 ? 'var(--amber)' : 'var(--muted)';

function b2bMatchesBody() {
  const off = flatSubs(S.profile.matchmaking.offering);
  if (!off.length) {
    return '<div class="card"><div class="empty"><span class="material-symbols-outlined">hub</span>' +
      '<h3>Set up your Offering first</h3><p>Matches are computed from your matchmaking Offering. Select the products &amp; capabilities you offer, then come back here.</p>' +
      '<a class="btn btn-primary" href="#/profile/matchmaking">Open Matchmaking</a></div></div>';
  }
  const q = window.__b2bQ.toLowerCase();
  let list = PARTICIPANTS.map((p) => ({ p: p, m: b2bMatchInfo(p) }));
  if (q) list = list.filter((x) => (x.p.name + ' ' + x.p.company + ' ' + x.p.country + ' ' + x.p.city).toLowerCase().includes(q));
  if (window.__b2bCat) list = list.filter((x) => Object.keys(x.p.lookingFor).includes(window.__b2bCat));
  if (window.__b2bSub) list = list.filter((x) => (x.p.lookingFor[window.__b2bCat] || []).includes(window.__b2bSub));
  if (window.__b2bCountry) list = list.filter((x) => x.p.country === window.__b2bCountry);
  if (window.__b2bState) list = list.filter((x) => x.p.state === window.__b2bState);
  if (window.__b2bCity) list = list.filter((x) => x.p.city === window.__b2bCity);
  if (window.__b2bMin) list = list.filter((x) => x.m.pct >= window.__b2bMin);
  list.sort((a, b) => b.m.pct - a.m.pct);

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(list.length / B2B_PAGE));
  if (window.__b2bPage > totalPages) window.__b2bPage = totalPages;
  const pStart = (window.__b2bPage - 1) * B2B_PAGE;
  const fullCount = list.length;
  const pageList = list.slice(pStart, pStart + B2B_PAGE);
  const pager = fullCount > B2B_PAGE
    ? '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:16px;font-size:0.8rem;color:var(--muted)">' +
        '<span>Total: <b>' + fullCount + '</b> · ' + B2B_PAGE + ' per page</span>' +
        '<span style="display:flex;align-items:center;gap:8px">Showing <b>' + (fullCount ? pStart + 1 : 0) + '</b> to <b>' + Math.min(pStart + B2B_PAGE, fullCount) + '</b>' +
          '<button class="btn btn-outline btn-sm" onclick="b2bPageGo(-1)"' + (window.__b2bPage <= 1 ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_left</span></button>' +
          '<span class="pill blue">' + window.__b2bPage + ' / ' + totalPages + '</span>' +
          '<button class="btn btn-outline btn-sm" onclick="b2bPageGo(1)"' + (window.__b2bPage >= totalPages ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_right</span></button>' +
      '</span></div>'
    : '';
  list = pageList;

  /* cascading options */
  const countries = [...new Set(PARTICIPANTS.map((p) => p.country))].sort();
  const states = [...new Set(PARTICIPANTS.filter((p) => !window.__b2bCountry || p.country === window.__b2bCountry).map((p) => p.state))].sort();
  const cities = [...new Set(PARTICIPANTS.filter((p) =>
    (!window.__b2bCountry || p.country === window.__b2bCountry) && (!window.__b2bState || p.state === window.__b2bState)).map((p) => p.city))].sort();
  const catDef = MM_CATS.find((c) => c.name === window.__b2bCat);
  const sel = (opts, val, fn, allLabel) =>
    '<select class="flt-sel" onchange="' + fn + '"><option value="">' + allLabel + '</option>' +
    opts.map((o) => '<option' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';

  const matchSeg = '<div class="seg">' + [[0, 'All'], [30, '30%+ Match'], [60, '60%+ Match']].map(([v, l]) =>
    '<button class="' + (window.__b2bMin === v ? 'on' : '') + '" onclick="window.__b2bMin=' + v + ';window.__b2bPage=1;render()">' + l + '</button>').join('') + '</div>';
  const viewSeg = '<div class="seg">' +
    '<button class="' + (window.__b2bView === 'grid' ? 'on' : '') + '" onclick="window.__b2bView=\'grid\';render()"><span class="material-symbols-outlined">grid_view</span>Grid</button>' +
    '<button class="' + (window.__b2bView === 'list' ? 'on' : '') + '" onclick="window.__b2bView=\'list\';render()"><span class="material-symbols-outlined">view_list</span>List</button></div>';
  const hasFlt = window.__b2bCat || window.__b2bSub || window.__b2bCountry || window.__b2bState || window.__b2bCity || window.__b2bMin || window.__b2bQ;

  const chipsOf = (m, max) =>
    m.offHit.slice(0, max).map((s) => '<span class="tagchip" style="margin:0 4px 4px 0">' + esc(s) + '</span>').join('') +
    (m.offHit.length + m.catHit.length > max ? '<span class="tagchip" style="margin:0 4px 4px 0;background:#F1F4FA;color:var(--muted)">+' + (m.offHit.length + m.catHit.length - max) + '</span>' : '');

  /* GRID view — networking-platform card (photo, dot, bookmark,
     % Profile Match pill + calendar & chat quick actions) */
  const grid = '<div class="match-grid">' + list.map((x) => {
    const p = x.p, m = x.m;
    const fav = (S.b2b.favs || []).includes(p.id);
    const met = S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status !== 'declined');
    return '<div class="match-card" onclick="location.hash=\'#/b2b-matchmaking/profile/' + p.id + '\'">' +
      '<button class="mc-bm' + (fav ? ' on' : '') + '" title="' + (fav ? 'Remove bookmark' : 'Bookmark') + '" onclick="event.stopPropagation();b2bToggleFav(\'' + p.id + '\')">' +
        '<span class="material-symbols-outlined" style="font-size:22px;' + (fav ? "font-variation-settings:'FILL' 1" : '') + '">bookmark</span></button>' +
      '<span class="mc-avatar">' + esc(p.name.replace(/[^A-Za-z ]/g, '').trim().charAt(0)) + '<span class="dot"></span></span>' +
      '<b class="mc-name">' + esc(p.name) + '</b>' +
      '<span class="mc-desig">' + esc(p.desig) + '</span>' +
      '<span class="mc-company">' + esc(p.company) + '</span>' +
      '<span class="mc-loc"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:-2px">location_on</span> ' + esc(p.city) + ', ' + esc(p.country) + ' · ' + p.type + '</span>' +
      '<div class="mc-foot">' +
        '<span class="mc-match">' + m.pct + '%&nbsp; Profile Match</span>' +
        '<button class="mc-act" title="Request Meeting" onclick="event.stopPropagation();openMeetingModal(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:19px">calendar_month</span></button>' +
      '</div>' +
      (met ? '<span class="mc-status">' + (S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status === 'confirmed')
        ? '<span class="pill green">Meeting Confirmed</span>' : '<span class="pill amber">Meeting Requested</span>') + '</span>' : '') +
    '</div>';
  }).join('') + '</div>';

  /* LIST view */
  const listRows = list.map((x) => {
    const p = x.p, m = x.m;
    return '<div class="card" style="margin-top:12px;cursor:pointer" onclick="location.hash=\'#/b2b-matchmaking/profile/' + p.id + '\'">' +
      '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
      '<span class="avatar" style="width:44px;height:44px;font-size:1.05rem;flex:none">' + esc(p.name.charAt(0)) + '</span>' +
      '<div style="flex:1;min-width:230px">' +
        '<b style="font-size:0.95rem">' + esc(p.name) + '</b> <span class="pill ' + (p.type === 'Delegation' ? 'blue' : 'gray') + '">' + p.type + '</span>' +
        '<div class="td-sub">' + esc(p.desig) + ' · ' + esc(p.company) + ' · ' + esc(p.city) + ', ' + esc(p.country) + '</div>' +
        '<div style="margin-top:6px">' + (chipsOf(m, 3) || '<span style="font-size:0.76rem;color:var(--muted)">No direct overlap — general networking</span>') + '</div>' +
      '</div>' +
      '<div style="text-align:right;min-width:140px">' +
        '<div style="font-size:1.3rem;font-weight:800;color:' + b2bScoreColor(m.pct) + '">' + m.pct + '%</div>' +
        '<div style="font-size:0.66rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Match Score</div>' +
        b2bMatchPill(p) +
      '</div></div></div>';
  }).join('');

  const empty = '<div class="card" style="margin-top:12px"><div class="empty"><span class="material-symbols-outlined">search_off</span><h3>No matches found</h3><p>Try clearing the search or filters.</p></div></div>';

  return '<div class="card">' +
      '<div class="b2b-row">' +
        '<div style="flex:1;min-width:240px;display:flex;align-items:center;gap:8px;border:1px solid #CFD7E4;border-radius:9px;padding:0 12px">' +
          '<span class="material-symbols-outlined" style="font-size:19px;color:var(--muted)">search</span>' +
          '<input type="text" id="b2bQ" value="' + esc(window.__b2bQ) + '" placeholder="Search by name, company, city or country" oninput="b2bSetQ(this.value)" ' +
            'style="flex:1;border:none;outline:none;padding:10px 0;font-family:inherit;font-size:0.86rem;background:none">' +
        '</div>' +
        viewSeg +
        '<span class="result-count">' + fullCount + ' of ' + PARTICIPANTS.length + ' matches</span>' +
      '</div>' +
      '<div class="b2b-row">' +
        sel(MM_CATS.map((c) => c.name), window.__b2bCat, 'window.__b2bCat=this.value;window.__b2bSub=\'\';window.__b2bPage=1;render()', 'Category: All') +
        (catDef ? sel(catDef.subs, window.__b2bSub, 'window.__b2bSub=this.value;window.__b2bPage=1;render()', 'Subcategory: All') : '') +
        sel(countries, window.__b2bCountry, 'b2bSetCountry(this.value)', 'Country: All') +
        sel(states, window.__b2bState, 'b2bSetState(this.value)', 'State: All') +
        sel(cities, window.__b2bCity, 'window.__b2bCity=this.value;window.__b2bPage=1;render()', 'City: All') +
        matchSeg +
        (hasFlt ? '<button class="btn btn-outline btn-sm" onclick="window.__b2bQ=\'\';window.__b2bCat=\'\';window.__b2bSub=\'\';window.__b2bCountry=\'\';window.__b2bState=\'\';window.__b2bCity=\'\';window.__b2bMin=0;window.__b2bPage=1;render()"><span class="material-symbols-outlined" style="font-size:15px">filter_alt_off</span>Clear</button>' : '') +
      '</div>' +
    '</div>' +
    (fullCount ? (window.__b2bView === 'grid' ? grid : listRows) + pager : empty);
}

/* ---------------- full profile detail page ---------------- */
function viewB2BProfile(partId) {
  const p = PARTICIPANTS.find((x) => x.id === partId);
  if (!p) { location.hash = '#/b2b-matchmaking'; return ''; }
  const m = b2bMatchInfo(p);
  const meetings = S.b2b.meetings.filter((mt) => mt.partId === p.id);

  const lookingBlocks = Object.keys(p.lookingFor).map((cat) =>
    '<div style="margin-bottom:12px"><b style="font-size:0.84rem">' + esc(cat) + '</b><div style="margin-top:6px">' +
      p.lookingFor[cat].map((s) => {
        const hit = m.offHit.includes(s) || m.catHit.includes(s);
        return '<span class="tagchip" style="margin:0 6px 6px 0;' + (hit ? '' : 'background:#F1F4FA;color:var(--muted)') + '">' +
          (hit ? '<span class="material-symbols-outlined" style="font-size:12px">check</span> ' : '') + esc(s) + '</span>';
      }).join('') + '</div></div>').join('');

  const meetRows = meetings.map((mt) =>
    '<div class="action-row"><span class="aicon" style="background:var(--blue-soft);color:var(--blue)"><span class="material-symbols-outlined">event</span></span>' +
    '<div class="atext"><b>' + esc(mt.date) + ' · ' + esc(mt.slot) + '</b><span>' + esc(mt.venue) + (mt.note ? ' — “' + esc(mt.note) + '”' : '') + '</span></div>' +
    mtgStatusPill(mt) + '</div>').join('');

  return '<a class="back-link" href="#/b2b-matchmaking"><span class="material-symbols-outlined" style="font-size:16px">arrow_back</span>Back to B2B Matchmaking</a>' +
    '<div class="card"><div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">' +
      '<span class="avatar" style="width:74px;height:74px;font-size:1.8rem;flex:none">' + esc(p.name.charAt(0)) + '</span>' +
      '<div style="flex:1;min-width:250px">' +
        '<h1 class="page-title" style="margin-bottom:2px">' + esc(p.name) + ' <span class="pill ' + (p.type === 'Delegation' ? 'blue' : 'gray') + '">' + p.type + '</span></h1>' +
        '<p class="page-sub" style="margin-bottom:10px">' + esc(p.desig) + ' · <b>' + esc(p.company) + '</b></p>' +
        '<div class="pkv" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' +
          '<div class="cell"><div class="k">Location</div><div class="v">' + esc(p.city) + ', ' + esc(p.state) + '</div></div>' +
          '<div class="cell"><div class="k">Country</div><div class="v">' + esc(p.country) + '</div></div>' +
          '<div class="cell"><div class="k">Email</div><div class="v">' + esc(ptEmail(p)) + '</div></div>' +
          '<div class="cell"><div class="k">Phone</div><div class="v">' + esc(ptPhone(p)) + '</div></div>' +
        '</div></div>' +
      '<div style="text-align:right;min-width:150px">' +
        '<div style="font-size:2rem;font-weight:800;color:' + b2bScoreColor(m.pct) + '">' + m.pct + '%</div>' +
        '<div style="font-size:0.68rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">Match Score</div>' +
        b2bMatchPill(p) +
      '</div></div></div>' +
    '<div class="prof-layout" style="margin-top:16px"><div>' +
      pcard('travel_explore', '#FFF4E0', 'var(--amber)', 'I am Looking For', null,
        '<div class="hint" style="margin:0 0 10px">✓ ticked subcategories match your Offering / Exhibition Categories.</div>' + lookingBlocks) +
      (meetRows ? pcard('event', 'var(--blue-soft)', 'var(--blue)', 'Meetings with ' + esc(p.name.split(' ')[0]), null, meetRows) : '') +
    '</div>' +
    '<div class="card"><h2 class="card-title">Match Summary</h2>' +
      '<div class="prog-row" style="margin-top:10px"><div class="pr-head"><span>Overall Match</span><span>' + m.pct + '%</span></div>' +
        '<div class="prog-bar"><i style="width:' + m.pct + '%"></i></div></div>' +
      '<div style="font-size:0.8rem;color:var(--muted);font-weight:600;margin-top:8px">' +
        '<b style="color:var(--ink)">' + m.offHit.length + '</b> matched with your Offering · ' +
        '<b style="color:var(--ink)">' + m.catHit.length + '</b> with your Exhibition Categories</div>' +
      (m.offHit.length ? '<div style="margin-top:10px">' + m.offHit.map((s) => '<span class="tagchip" style="margin:0 5px 5px 0">' + esc(s) + '</span>').join('') + '</div>' : '') +
    '</div></div>';
}

/* ---------------- request / respond ---------------- */
function openMeetingModal(partId) {
  const p = PARTICIPANTS.find((x) => x.id === partId);
  const m = b2bMatchInfo(p);
  openModal('Request B2B Meeting — ' + esc(p.name),
    '<div class="note" style="margin-top:0"><b class="title">' + esc(p.company) + ' · ' + m.pct + '% match</b>' +
      'Matched on: ' + (m.offHit.concat(m.catHit).slice(0, 4).map(esc).join(', ') || 'general networking') + '</div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>Event Date <span class="req">*</span></label><select id="mtDate">' +
        EVENT.eventDays.map((d) => '<option>' + d + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Time Slot <span class="req">*</span></label><select id="mtSlot">' +
        SLOT_TIMES.map((t) => '<option>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field full"><label>Venue <span class="req">*</span></label><select id="mtVenue">' +
        '<option>My Booth (' + esc(stallLabel()) + ')</option>' +
        '<option>B2B Meeting Table</option>' +
        '<option>Their Booth / Delegation Lounge</option></select>' +
        '<div class="hint">B2B Meeting Table slots are chargeable — book the table from the Meeting Room menu.</div></div>' +
      '<div class="field full"><label>Attending Team Member <span class="req">*</span></label><select id="mtMember">' +
        S.b2b.team.map((t) => '<option value="' + t.id + '">' + esc(t.name) + ' — ' + esc(t.desig) + '</option>').join('') + '</select>' +
        '<div class="hint">The meeting goes on this member’s schedule; the main login always sees it too.</div></div>' +
      '<div class="field full"><label>Agenda / Message</label>' +
        '<textarea id="mtNote" rows="2" maxlength="300" placeholder="Briefly describe what you would like to discuss" style="width:100%;border:1px solid #CFD7E4;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:0.88rem"></textarea></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="sendMeetingRequest(\'' + partId + '\')"><span class="material-symbols-outlined">send</span>Send Request</button>', true);
}

function sendMeetingRequest(partId) {
  const p = PARTICIPANTS.find((x) => x.id === partId);
  S.b2b.meetings.unshift({
    id: 'mtg_' + Date.now(), partId: partId, name: p.name, company: p.company,
    date: $('mtDate').value, slot: $('mtSlot').value, venue: $('mtVenue').value,
    note: $('mtNote').value.trim(), memberId: $('mtMember') ? $('mtMember').value : 'tm_main',
    direction: 'outgoing', status: 'pending', createdAt: nowStr(),
  });
  save(); closeModal(); render();
  toast('Meeting request sent to ' + p.name + ' — you will be notified when they respond.', 'success');
}

function respondMeeting(id, status) {
  const m = S.b2b.meetings.find((x) => x.id === id);
  if (!m) return;
  m.status = status;
  m.respondedAt = nowStr();
  m.respondedBy = 'Main Exhibitor Login'; // member logins record their own name in production
  save(); render();
  toast('Meeting ' + (status === 'confirmed' ? 'accepted — added to ' + memberName(m) + '’s schedule.' : 'declined.'), status === 'confirmed' ? 'success' : 'error');
}

/* ---------------- My Team (members of the exhibiting company) ---------------- */
function openTeamModal() {
  const rows = S.b2b.team.map((t) =>
    '<div class="action-row"><span class="avatar" style="width:36px;height:36px;flex:none">' + esc(t.name.charAt(0)) + '</span>' +
    '<div class="atext"><b>' + esc(t.name) + (t.id === 'tm_main' ? ' <span class="pill blue">Main Login</span>' : '') + '</b>' +
    '<span>' + esc(t.desig) + ' · ' + esc(t.email) + '</span></div>' +
    '<span class="pill gray">' + S.b2b.meetings.filter((m) => m.memberId === t.id).length + ' meeting(s)</span></div>').join('');
  openModal('My Team — ' + esc(EVENT.exhibitor),
    '<p style="margin-top:0;font-size:0.8rem;color:var(--muted)">Visitors can request a meeting with any team member — every request lands here in the main login, and you or the member can approve it.</p>' +
    rows +
    '<div class="form-grid" style="margin-top:14px">' +
      '<div class="field"><label>Member Name</label><input type="text" id="tmName" placeholder="Full name"></div>' +
      '<div class="field"><label>Designation</label><input type="text" id="tmDesig" placeholder="e.g. Sales Lead"></div>' +
    '</div>' +
    '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="addTeamMember()"><span class="material-symbols-outlined" style="font-size:16px">person_add</span>Add Member</button>');
}
function addTeamMember() {
  const name = $('tmName').value.trim();
  if (!name) { toast('Enter the member name.', 'error'); return; }
  S.b2b.team.push({
    id: 'tm_' + Date.now(), name: name, desig: $('tmDesig').value.trim() || 'Team Member',
    email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@hal-india.co.in',
  });
  save(); openTeamModal(); render();
  toast(name + ' added to your team.', 'success');
}

function openRescheduleModal(id) {
  const m = S.b2b.meetings.find((x) => x.id === id);
  if (!m) return;
  openModal('Reschedule Meeting — ' + esc(m.name),
    '<div class="note" style="margin-top:0"><b class="title">Current: ' + esc(m.date) + ' · ' + esc(m.slot) + '</b>' +
      esc(m.venue) + '. Pick a new date &amp; slot — the other party re-confirms the new time.</div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>New Event Date <span class="req">*</span></label><select id="rsDate">' +
        EVENT.eventDays.map((d) => '<option' + (d === m.date ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>New Time Slot <span class="req">*</span></label><select id="rsSlot">' +
        SLOT_TIMES.map((t) => '<option' + (t === m.slot ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field full"><label>Venue <span class="req">*</span></label><select id="rsVenue">' +
        ['My Booth (' + stallLabel() + ')', 'B2B Meeting Table', 'Their Booth / Delegation Lounge'].map((v) =>
          '<option' + (v === m.venue ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="saveReschedule(\'' + id + '\')"><span class="material-symbols-outlined">update</span>Reschedule</button>', true);
}
function saveReschedule(id) {
  const m = S.b2b.meetings.find((x) => x.id === id);
  if (!m) return;
  const nd = $('rsDate').value, ns = $('rsSlot').value;
  if (m.date === nd && m.slot === ns && m.venue === $('rsVenue').value) { toast('Pick a different date, slot or venue.', 'error'); return; }
  m.date = nd; m.slot = ns; m.venue = $('rsVenue').value;
  m.rescheduled = true;
  m.status = 'pending'; // the other party re-confirms the new time
  m.respondedAt = '';
  save(); closeModal(); render();
  toast('Meeting rescheduled to ' + nd + ' · ' + ns + ' — awaiting re-confirmation.', 'success');
}

function cancelMeeting(id) {
  if (!confirm('Cancel this meeting request?')) return;
  S.b2b.meetings = S.b2b.meetings.filter((m) => m.id !== id);
  save(); render();
  toast('Meeting request cancelled.', 'success');
}

/* ---------------- meetings tab ---------------- */
const mtgStatusPill = (m) => m.status === 'confirmed' ? '<span class="pill green">Confirmed</span>'
  : m.status === 'declined' ? '<span class="pill red">Declined</span>'
  : '<span class="pill amber">Pending</span>';

window.__b2bTeam = window.__b2bTeam || '';
function b2bMeetingsBody() {
  const teamSel =
    '<select onchange="window.__b2bTeam=this.value;render()" style="border:1px solid #CFD7E4;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.82rem;cursor:pointer">' +
      '<option value="">All Team Members</option>' +
      S.b2b.team.map((t) => '<option value="' + t.id + '"' + (window.__b2bTeam === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') +
    '</select>';
  const filt = (arr) => window.__b2bTeam ? arr.filter((m) => m.memberId === window.__b2bTeam) : arr;

  const inc = filt(S.b2b.meetings.filter((m) => m.direction === 'incoming' && m.status === 'pending'));
  const incoming = inc.length
    ? '<div class="card pending-card" style="margin-bottom:16px"><div class="card-head-row"><h2 class="card-title">Incoming Requests</h2>' +
      '<span class="pill amber">' + inc.length + ' awaiting response</span></div>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 6px">Requests sent to <b>any of your team members</b> appear here — you (main login) or the member can approve them.</p>' +
      inc.map((m) =>
        '<div class="action-row"><span class="aicon"><span class="material-symbols-outlined">move_to_inbox</span></span>' +
        '<div class="atext"><b>' + esc(m.name) + ' · ' + esc(m.company) +
          ' <span class="pill blue">for ' + esc(memberName(m)) + '</span></b>' +
        '<span>' + esc(m.date) + ' · ' + esc(m.slot) + ' · ' + esc(m.venue) + (m.note ? ' — “' + esc(m.note) + '”' : '') + '</span></div>' +
        '<button class="btn btn-primary btn-sm" onclick="respondMeeting(\'' + m.id + '\',\'confirmed\')">Accept</button>' +
        '<button class="btn btn-outline btn-sm" onclick="respondMeeting(\'' + m.id + '\',\'declined\')">Decline</button>' +
        '</div>').join('') + '</div>'
    : '';

  const rows = filt(S.b2b.meetings).map((m, i) =>
    '<tr><td>' + (i + 1) + '</td>' +
    '<td><span class="td-strong">' + esc(m.name) + '</span><span class="td-sub">' + esc(m.company) + '</span></td>' +
    '<td><span class="td-strong">' + esc(memberName(m)) + '</span>' +
      '<span class="td-sub">' + (m.direction === 'incoming' ? 'requested with' : 'attending') + '</span></td>' +
    '<td>' + esc(m.date) + '<span class="td-sub">' + esc(m.slot) + '</span></td>' +
    '<td>' + esc(m.venue) + '</td>' +
    '<td>' + (m.direction === 'incoming' ? '<span class="pill blue">Incoming</span>' : '<span class="pill gray">Sent by you</span>') + '</td>' +
    '<td>' + mtgStatusPill(m) +
      (m.rescheduled && m.status === 'pending' ? '<span class="td-sub" style="color:var(--amber)">Rescheduled — awaiting re-confirmation</span>' : '') + '</td>' +
    '<td class="td-actions">' +
      (m.status === 'confirmed'
        ? '<button class="btn-link" onclick="openRescheduleModal(\'' + m.id + '\')">Reschedule</button>' : '') +
      (m.direction === 'outgoing' && m.status === 'pending'
        ? '<button class="btn-link" onclick="openRescheduleModal(\'' + m.id + '\')">Reschedule</button>' +
          '<button class="btn-link danger" onclick="cancelMeeting(\'' + m.id + '\')">Cancel</button>' : '') +
    '</td></tr>').join('') ||
    '<tr><td colspan="8" style="color:var(--muted)">No meetings yet — request one from the Recommended Matches tab.</td></tr>';

  const all = filt(S.b2b.meetings);
  const confirmed = all.filter((m) => m.status === 'confirmed').length;
  return incoming +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Meetings</div><div class="t-value">' + all.length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Confirmed</div><div class="t-value">' + confirmed + '</div></div>' +
      '<div class="tile"><div class="t-label">Awaiting Response</div><div class="t-value">' + all.filter((m) => m.status === 'pending').length + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title">Meeting Schedule</h2>' +
      '<div style="display:flex;gap:8px;align-items:center">' + teamSel +
      '<button class="btn btn-outline btn-sm" onclick="openTeamModal()"><span class="material-symbols-outlined" style="font-size:16px">groups</span>My Team (' + S.b2b.team.length + ')</button></div></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>With</th><th>Team Member</th><th>Date / Slot</th><th>Venue</th><th>Direction</th><th>Status</th><th></th></tr>' +
    rows + '</table></div></div>';
}

ROUTES['b2b-matchmaking'] = viewB2BMatchmaking;
