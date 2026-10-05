/* ============================================================
   Evenuefy — B2B Matchmaking
   Before the directory opens, the exhibitor states their preferences
   (I am Looking For + Offering, from "LookingFor & Offering.xlsx").
   The match % is two-way: my Offering vs their Looking For, and my
   Looking For vs their Offering. The exhibitor can then request B2B
   meetings (date · slot · venue · agenda).
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
  /* more demo meetings across statuses, dates & slots so the Meetings &
     Requests table, its filters and pagination can be tested */
  if (!S.b2b.meetings.some((m) => m.id === 'mtg_seed4')) {
    const mk = (n, partId, name, company, memberId, date, slot, venue, title, note, direction, status, extra) =>
      Object.assign({ id: 'mtg_seed' + n, partId: partId, name: name, company: company, memberId: memberId,
        date: date, slot: slot, venue: venue, title: title, note: note, direction: direction, status: status,
        createdAt: '2' + (n % 3) + ' Sept 2026, 1' + (n % 9) + ':15 am' }, extra || {});
    S.b2b.meetings.push(
      mk(4, 'pt_skyhawk', 'Maj. Gen. R. K. Bisht (Retd.)', 'SkyHawk Defence Consultants', 'tm_nikhil', '11 Feb 2027', '10:00 AM', 'My Booth (Hall A · A8.5)',
        'LCA export advisory', 'Discuss LCA Tejas export positioning for friendly nations.', 'incoming', 'confirmed'),
      mk(5, 'pt_gulfwing', 'Omar Al-Farsi', 'GulfWing Aviation', 'tm_rakesh', '12 Feb 2027', '11:30 AM', 'B2B Meeting Table',
        'Helicopter MRO partnership', 'Utility helicopter MRO support in the Gulf region.', 'outgoing', 'confirmed'),
      mk(6, 'pt_volga', 'Elena Petrova', 'Volga Dynamics', 'tm_main', '12 Feb 2027', '04:00 PM', 'Their Booth / Delegation Lounge',
        'Missile integration talk', 'Explore integration on the Su-30 platform.', 'incoming', 'declined'),
      mk(7, 'pt_atlas', 'Hannah Cole', 'Atlas AeroWorks', 'tm_nikhil', '13 Feb 2027', '01:00 PM', 'My Booth (Hall A · A8.5)',
        'HTT-40 trainer collaboration', 'Basic trainer overhaul & documentation support.', 'outgoing', 'pending', { rescheduled: true }),
      mk(8, 'pt_chennaiprop', 'Ananya Krishnan', 'Chennai Propulsion Works', 'tm_rakesh', '11 Feb 2027', '02:30 PM', 'B2B Meeting Table',
        'Engine component sourcing', 'Turboprop engine parts supply chain.', 'incoming', 'pending'),
      mk(9, 'pt_sarang', 'Dr. Nivedita Rao', 'Sarang Defence Research', 'tm_asha', '13 Feb 2027', '11:30 AM', 'My Booth (Hall A · A8.5)',
        'AI decision support demo', 'Show AI decision-support tools for mission planning.', 'incoming', 'completed'),
      mk(10, 'pt_pacaero', 'Chen Wei', 'Pacific AeroStructures', 'tm_priya', '12 Feb 2027', '10:00 AM', 'Their Booth / Delegation Lounge',
        'Composite aerostructures', 'Composite airframe sub-assemblies for LUH.', 'outgoing', 'pending'),
      mk(11, 'pt_nordic', 'Erik Johansson', 'Nordic Radar Solutions', 'tm_asha', '11 Feb 2027', '04:00 PM', 'B2B Meeting Table',
        'AESA radar cooperation', 'Ground surveillance AESA co-development.', 'incoming', 'confirmed'),
      mk(12, 'pt_falcon', 'Fatima Al-Zahra', 'Qatar Falcon Aviation', 'tm_main', '13 Feb 2027', '02:30 PM', 'My Booth (Hall A · A8.5)',
        'VIP helicopter fleet', 'VIP helicopter fleet support & spares.', 'incoming', 'pending')
    );
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
  { id: 'pt_bharatrotor', name: 'Sandeep Rathore', desig: 'VP — Rotary Wing', company: 'Bharat Rotorcraft Services', country: 'India', state: 'Uttar Pradesh', city: 'Lucknow', type: 'Visitor',
    lookingFor: { 'Helicopters & Rotary Wing': ['Utility Helicopters', 'Attack Helicopters'], 'MRO & Lifecycle Support': ['Overhaul Services'] } },
  { id: 'pt_aegean', name: 'Nikos Papadopoulos', desig: 'Head of Procurement', company: 'Aegean Aerospace', country: 'Greece', state: 'Attica', city: 'Athens', type: 'Delegation',
    lookingFor: { 'Aircraft Systems (Fixed Wing)': ['Fighter Aircraft'], 'Avionics': ['Mission Computers'] } },
  { id: 'pt_kalinga', name: 'Subhashree Das', desig: 'Director — Operations', company: 'Kalinga Aero Components', country: 'India', state: 'Odisha', city: 'Bhubaneswar', type: 'Exhibitor',
    lookingFor: { 'Aerospace Structures': ['Airframes', 'Wings'], 'Precision Engineering': ['CNC Machining'] } },
  { id: 'pt_southcross', name: 'Liam Walker', desig: 'Business Development Lead', company: 'Southern Cross Defence', country: 'Australia', state: 'New South Wales', city: 'Sydney', type: 'Delegation',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Upgrades & Retrofits'] } },
  { id: 'pt_nilgiri', name: 'Karthik Subramanian', desig: 'CEO', company: 'Nilgiri Simulation Systems', country: 'India', state: 'Tamil Nadu', city: 'Coimbatore', type: 'Exhibitor',
    lookingFor: { 'Simulation & Training': ['Flight Simulators', 'Maintenance Training Simulators'] } },
  { id: 'pt_bavaria', name: 'Markus Weber', desig: 'Programme Manager', company: 'Bavaria Avionik GmbH', country: 'Germany', state: 'Bavaria', city: 'Munich', type: 'Delegation',
    lookingFor: { 'Avionics': ['Cockpit Displays / Glass Cockpits', 'Flight Control Systems'] } },
  { id: 'pt_konkan', name: 'Pooja Naik', desig: 'Head — Supply Chain', company: 'Konkan Marine Engineering', country: 'India', state: 'Goa', city: 'Vasco da Gama', type: 'Visitor',
    lookingFor: { 'Shipbuilding & Marine Engineering': ['Ship Repair & Refit'], 'Naval Platforms': ['Offshore Patrol Vessels (OPVs)'] } },
  { id: 'pt_andalus', name: 'Javier Ruiz', desig: 'Director — Space', company: 'Andalus Space Tech', country: 'Spain', state: 'Andalusia', city: 'Seville', type: 'Delegation',
    lookingFor: { 'Space Systems': ['Earth Observation Satellites', 'Small Satellites / CubeSats'] } },
  { id: 'pt_marutdrone', name: 'Aditya Joshi', desig: 'Founder', company: 'Marut Drone Works', country: 'India', state: 'Rajasthan', city: 'Jaipur', type: 'Exhibitor',
    lookingFor: { 'Unmanned Aerial Systems': ['Rotary-Wing / Multirotor UAVs', 'Tactical UAVs'] } },
  { id: 'pt_seoul', name: 'Min-jun Park', desig: 'Senior Manager', company: 'Seoul Precision Aero', country: 'South Korea', state: 'Seoul', city: 'Seoul', type: 'Delegation',
    lookingFor: { 'Engines & Propulsion': ['Turbofan Engines'], 'Advanced Materials': ['Specialty Alloys'] } },
  { id: 'pt_capeaero', name: 'Thabo Nkosi', desig: 'Fleet Director', company: 'Cape Aero Holdings', country: 'South Africa', state: 'Western Cape', city: 'Cape Town', type: 'Delegation',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Repair Services'], 'Helicopters & Rotary Wing': ['Utility Helicopters'] } },
];

/* Demo "Offering" per participant (visitor registration captures
   Offering too). Deterministic: 1–2 categories from the pool of
   categories participants deal in, 2–4 subcategories each. */
(function seedParticipantOfferings() {
  const pool = [...new Set(PARTICIPANTS.reduce((a, p) => a.concat(Object.keys(p.lookingFor)), []))]
    .filter((n) => MM_CATS.some((c) => c.name === n));
  PARTICIPANTS.forEach((p) => {
    if (p.offering) return;
    let h = 7; for (let i = 0; i < p.id.length; i++) h = (h * 131 + p.id.charCodeAt(i)) >>> 0;
    const next = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9E3779B9) >>> 0; return h >>> 8; };
    const off = {};
    const nCats = 1 + (next() % 2);
    for (let k = 0; k < nCats; k++) {
      const catName = pool[next() % pool.length];
      const cat = MM_CATS.find((c) => c.name === catName);
      const subs = cat.subs.filter((x) => x.indexOf('Other') !== 0);
      const want = 2 + (next() % 3);
      const pick = off[cat.name] || [];
      for (let j = 0; j < want * 4 && pick.length < want; j++) {
        const sub = subs[next() % Math.min(subs.length, 10)];
        if (!pick.includes(sub)) pick.push(sub);
      }
      off[cat.name] = pick;
    }
    p.offering = off;
  });
})();

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

/* Two-way score:
   · Demand side — how much of THEIR Looking For is covered by MY
     Offering (exact subcategory = 1, via my Exhibition Categories = ½).
   · Supply side — how much of THEIR Offering is something I am
     Looking For (exact subcategory = 1, same category only = ½).
   Overall = average of the sides that can be computed. */
function b2bMatchInfo(p) {
  const M = S.profile.matchmaking;
  const off = flatSubs(M.offering);
  const cats = flatSubs(M.exCats);
  const want = flatSubs(p.lookingFor);
  const offHit = want.filter((s) => off.includes(s));
  const catHit = want.filter((s) => cats.includes(s) && !offHit.includes(s));
  const demand = want.length ? Math.min(1, (offHit.length + catHit.length * 0.5) / want.length) : null;

  const myLf = M.lookingFor || {};
  const theirOff = p.offering || {};
  const lfHit = [], lfCatHit = [];
  Object.keys(theirOff).forEach((cat) => theirOff[cat].forEach((s) => {
    if ((myLf[cat] || []).includes(s)) lfHit.push(s);
    else if ((myLf[cat] || []).length) lfCatHit.push(s);
  }));
  const offCount = flatSubs(theirOff).length;
  const supply = offCount && flatSubs(myLf).length ? Math.min(1, (lfHit.length + lfCatHit.length * 0.5) / offCount) : null;

  const sides = [demand, supply].filter((x) => x !== null);
  const pct = sides.length ? Math.round((sides.reduce((a, x) => a + x, 0) / sides.length) * 100) : 0;
  return {
    offHit: offHit, catHit: catHit, lfHit: lfHit, lfCatHit: lfCatHit, pct: pct,
    demandPct: demand === null ? null : Math.round(demand * 100),
    supplyPct: supply === null ? null : Math.round(supply * 100),
  };
}

/* ---------------- preferences — asked BEFORE matchmaking ---------------- */
const b2bHasPrefs = (map) => flatSubs(map).length > 0;
function b2bPrefsReady() {
  const M = S.profile.matchmaking;
  return !!S.b2b.prefsDone && b2bHasPrefs(M.lookingFor) && b2bHasPrefs(M.offering);
}
window.__b2bPrefStep = window.__b2bPrefStep || 1;

function b2bPrefsWizard() {
  const step = window.__b2bPrefStep;
  const lfN = mmCount('lf'), ofN = mmCount('of');
  const stepHead = (n, label, count) =>
    '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px">' +
      '<span style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:0.85rem;flex:none;' +
        (step === n ? 'background:var(--blue);color:#fff' : count ? 'background:var(--green);color:#fff' : 'background:#EEF1F6;color:var(--muted)') + '">' +
        (step !== n && count ? '<span class="material-symbols-outlined" style="font-size:17px">check</span>' : n) + '</span>' +
      '<div><b style="font-size:0.88rem">' + label + '</b><div style="font-size:0.74rem;color:var(--muted)">' +
        (count ? count + ' selected' : 'Not selected yet') + '</div></div></div>';

  const body = step === 1
    ? '<h2 class="card-title" style="margin:0 0 4px">What are you looking for?</h2>' +
      '<p style="font-size:0.82rem;color:var(--muted);margin:0 0 14px">Select the products, services &amp; capabilities you want to source, or the kind of partners you want to meet. Tick a category to select all its subcategories, or pick them individually.</p>' +
      mmTree('lf')
    : '<h2 class="card-title" style="margin:0 0 4px">What do you offer?</h2>' +
      '<p style="font-size:0.82rem;color:var(--muted);margin:0 0 14px">Select the products &amp; capabilities your company offers. Participants looking for these will be recommended to you.</p>' +
      mmTree('of');

  const need = step === 1 ? lfN : ofN;
  const foot = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">' +
    '<span style="font-size:0.78rem;color:var(--muted)">' + (need ? 'Step ' + step + ' of 2' : 'Select at least one subcategory to continue') + '</span>' +
    '<span style="display:flex;gap:8px;flex-wrap:wrap">' +
      (step === 2 ? '<button class="btn btn-outline" onclick="window.__b2bPrefStep=1;render();window.scrollTo(0,0)"><span class="material-symbols-outlined">arrow_back</span>Back</button>' : '') +
      (step === 1
        ? '<button class="btn btn-primary" onclick="b2bPrefNext()"' + (lfN ? '' : ' disabled') + '>Next: Offering<span class="material-symbols-outlined">arrow_forward</span></button>'
        : '<button class="btn btn-primary" onclick="b2bSavePrefs()"' + (ofN ? '' : ' disabled') + '><span class="material-symbols-outlined">hub</span>Save &amp; Find Matches</button>') +
    '</span></div>';

  return '<h1 class="page-title">B2B Matchmaking</h1>' +
    '<p class="page-sub">Before we recommend matches, tell us your preferences. Your <b>Looking For</b> is matched with other participants’ <b>Offering</b>, and your <b>Offering</b> with their <b>Looking For</b> — that is how the match % is calculated. You can edit them any time.</p>' +
    '<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">' +
      stepHead(1, 'I am Looking For', lfN) +
      '<span class="material-symbols-outlined" style="color:var(--muted)">chevron_right</span>' +
      stepHead(2, 'Offering', ofN) +
    '</div></div>' +
    '<div class="card">' + body + foot + '</div>';
}
function b2bPrefNext() {
  if (!mmCount('lf')) { toast('Select at least one subcategory you are looking for'); return; }
  window.__b2bPrefStep = 2; render(); window.scrollTo(0, 0);
}
function b2bSavePrefs() {
  if (!mmCount('lf') || !mmCount('of')) { toast('Select at least one subcategory in both steps'); return; }
  S.b2b.prefsDone = true;
  window.__b2bPrefStep = 1;
  window.__b2bPage = 1;
  save(); render(); window.scrollTo(0, 0);
  toast('Preferences saved — matches updated');
}
/* Edit Preferences — a side drawer over the matches, so the exhibitor
   never leaves the page. Every tick is saved instantly and the match
   list behind the drawer re-scores live. */
window.__b2bPrefTab = window.__b2bPrefTab || 'lf';
function b2bEditPrefs(tab) {
  if (tab) window.__b2bPrefTab = tab;
  b2bClosePrefs(true);
  const wrap = document.createElement('div');
  wrap.id = 'b2bPrefDrawer';
  wrap.innerHTML = '<div class="drawer-overlay" onclick="b2bClosePrefs()"></div>' +
    '<div class="drawer wide" role="dialog" aria-modal="true" aria-label="Edit matchmaking preferences">' +
      '<div class="drawer-head"><div><h3>Matchmaking Preferences</h3>' +
        '<div style="font-size:0.74rem;color:var(--muted);margin-top:2px">Changes save instantly — matches update behind this panel.</div></div>' +
        '<button class="modal-close" onclick="b2bClosePrefs()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<div id="b2bPrefTabs" style="padding:12px 20px 0"></div>' +
      '<div class="drawer-body" id="b2bPrefBody"></div>' +
      '<div class="drawer-foot" id="b2bPrefFoot"></div>' +
    '</div>';
  document.body.appendChild(wrap);
  b2bPrefsDrawerRefresh();
}
function b2bPrefsDrawerRefresh() {
  const body = $('b2bPrefBody');
  if (!body) return;
  const t = window.__b2bPrefTab;
  const lfN = mmCount('lf'), ofN = mmCount('of');
  const tabBtn = (k, label, n) => '<button class="' + (t === k ? 'on' : '') + '" onclick="b2bPrefTab(\'' + k + '\')">' + label +
    ' <span class="pill ' + (n ? 'blue' : 'amber') + '" style="margin-left:4px">' + (n || '!') + '</span></button>';
  $('b2bPrefTabs').innerHTML = '<div class="seg" style="width:100%;display:flex">' +
    tabBtn('lf', 'I am Looking For', lfN) + tabBtn('of', 'Offering', ofN) + '</div>';
  const scroll = body.scrollTop;
  body.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);margin:0 0 10px">' + (t === 'lf'
      ? 'Products, services &amp; partners you want to source or meet — matched with what others <b>offer</b>.'
      : 'Products &amp; capabilities your company offers — matched with what others are <b>looking for</b>.') + '</p>' +
    mmTree(t).replace('max-height:420px;overflow-y:auto', 'overflow:visible');
  body.scrollTop = scroll;
  const good = PARTICIPANTS.filter((p) => b2bMatchInfo(p).pct >= 30).length;
  const ok = lfN && ofN;
  $('b2bPrefFoot').innerHTML =
    '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px">' + (ok
      ? '<b style="color:var(--ink)">' + good + '</b> participants are a 30%+ match with these preferences.'
      : '<span style="color:var(--amber);font-weight:700">Select at least one subcategory in both tabs.</span>') + '</div>' +
    '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="b2bClosePrefs()"' + (ok ? '' : ' disabled') + '>' +
      '<span class="material-symbols-outlined">check</span>Done — Show Matches</button>';
}
window.addEventListener("hashchange", () => b2bClosePrefs(true));
function b2bPrefTab(k) { window.__b2bPrefTab = k; $('b2bPrefBody').scrollTop = 0; b2bPrefsDrawerRefresh(); }
function b2bClosePrefs(force) {
  const d = $('b2bPrefDrawer');
  if (!d) return;
  const M = S.profile.matchmaking;
  if (!force && (!b2bHasPrefs(M.lookingFor) || !b2bHasPrefs(M.offering))) { toast('Select at least one subcategory in both tabs'); return; }
  d.remove();
  if (!force) { window.__b2bPage = 1; render(); }
}

/* compact "My Preferences" strip above the matches */
function b2bPrefsStrip() {
  const M = S.profile.matchmaking;
  const summary = (map) => {
    const cats = Object.keys(map).filter((k) => map[k].length);
    return cats.slice(0, 3).map((c) => '<span class="tagchip" style="margin:0 4px 4px 0">' + esc(c) + ' · ' + map[c].length + '</span>').join('') +
      (cats.length > 3 ? '<span class="tagchip" style="margin:0 4px 4px 0;background:#F1F4FA;color:var(--muted)">+' + (cats.length - 3) + ' more</span>' : '');
  };
  const lbl = (t, c) => '<div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:' + c + ';margin-bottom:6px">' + t + '</div>';
  return '<div class="card" style="margin-bottom:14px">' +
    '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">' +
      '<div style="flex:1;min-width:220px">' + lbl('I am Looking For', 'var(--amber)') + summary(M.lookingFor) +
        '<button class="btn-link" style="padding:0;font-size:0.76rem" onclick="b2bEditPrefs(\'lf\')">Edit Looking For</button></div>' +
      '<div style="flex:1;min-width:220px">' + lbl('Offering', 'var(--green)') + summary(M.offering) +
        '<button class="btn-link" style="padding:0;font-size:0.76rem" onclick="b2bEditPrefs(\'of\')">Edit Offering</button></div>' +
    '</div></div>';
}

/* ---------------- views ---------------- */
window.__b2bTab = window.__b2bTab || 'matches';
window.__b2bQ = window.__b2bQ || '';
window.__b2bMin = window.__b2bMin || 0;

function b2bIncomingPending() {
  return S.b2b.meetings.filter((m) => m.direction === 'incoming' && m.status === 'pending').length;
}

function viewB2BMatchmaking() {
  if (!b2bPrefsReady()) return b2bPrefsWizard();
  const pend = b2bIncomingPending();
  const tabs = '<div class="ptabs" style="border-bottom:none;padding-bottom:0;margin-bottom:16px">' +
    '<button class="ptab' + (window.__b2bTab === 'matches' ? ' on' : '') + '" onclick="window.__b2bTab=\'matches\';render()">Recommended Matches</button>' +
    '<button class="ptab' + (window.__b2bTab === 'meetings' ? ' on' : '') + '" onclick="window.__b2bTab=\'meetings\';render()">Meetings &amp; Requests' +
      (pend ? ' <span class="pill amber" style="margin-left:4px">' + pend + '</span>' : '') + '</button>' +
    '</div>';
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
      '<h1 class="page-title">B2B Matchmaking</h1>' +
      '<button class="btn btn-outline" onclick="b2bEditPrefs()"><span class="material-symbols-outlined">tune</span>Edit My Preferences</button></div>' +
    '<p class="page-sub">Participants matched two-way on your preferences — what they <b>Look For</b> vs your <b>Offering</b>, and what they <b>Offer</b> vs what you <b>Look For</b>. Request a meeting directly from a match.</p>' +
    tabs + (window.__b2bTab === 'meetings' ? b2bMeetingsBody() : b2bPrefsStrip() + b2bMatchesBody());
}

window.__b2bView = window.__b2bView || 'grid';
window.__b2bCat = window.__b2bCat || '';
window.__b2bSub = window.__b2bSub || '';
window.__b2bCountry = window.__b2bCountry || '';
window.__b2bState = window.__b2bState || '';
window.__b2bCity = window.__b2bCity || '';
window.__b2bPage = window.__b2bPage || 1;
const B2B_PAGE = 12; // divisible by 2, 3 & 4 grid columns — no half-empty last row
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
  const already = S.b2b.meetings.some((mt) => mt.partId === p.id && !['declined', 'cancelled'].includes(mt.status));
  if (!already) return '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openMeetingModal(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:15px">event</span>Request Meeting</button>';
  return S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status === 'confirmed')
    ? '<span class="pill green">Meeting Approved</span>' : '<span class="pill amber">Meeting Requested</span>';
}
const b2bScoreColor = (pct) => pct >= 60 ? 'var(--green)' : pct >= 30 ? 'var(--amber)' : 'var(--muted)';

function b2bMatchesBody() {
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

  const chipsOf = (m, max) => {
    const hits = m.offHit.concat(m.lfHit.filter((s) => !m.offHit.includes(s)));
    const more = hits.length + m.catHit.length + m.lfCatHit.length - Math.min(max, hits.length);
    return hits.slice(0, max).map((s) => '<span class="tagchip" style="margin:0 4px 4px 0">' + esc(s) + '</span>').join('') +
      (more > 0 ? '<span class="tagchip" style="margin:0 4px 4px 0;background:#F1F4FA;color:var(--muted)">+' + more + '</span>' : '');
  };

  /* GRID view — networking-platform card (photo, dot, bookmark,
     % Profile Match pill + calendar & chat quick actions) */
  const grid = '<div class="match-grid">' + list.map((x) => {
    const p = x.p, m = x.m;
    const fav = (S.b2b.favs || []).includes(p.id);
    const met = S.b2b.meetings.some((mt) => mt.partId === p.id && !['declined', 'cancelled'].includes(mt.status));
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
        ? '<span class="pill green">Meeting Approved</span>' : '<span class="pill amber">Meeting Requested</span>') + '</span>' : '') +
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

  const offeringBlocks = Object.keys(p.offering || {}).map((cat) =>
    '<div style="margin-bottom:12px"><b style="font-size:0.84rem">' + esc(cat) + '</b><div style="margin-top:6px">' +
      p.offering[cat].map((s) => {
        const hit = m.lfHit.includes(s) || m.lfCatHit.includes(s);
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
      pcard('volunteer_activism', '#E6F4EC', 'var(--green)', 'Offering', null,
        '<div class="hint" style="margin:0 0 10px">✓ ticked subcategories match what you are Looking For.</div>' + (offeringBlocks || '<p style="color:var(--muted);font-size:0.84rem">No offering listed.</p>')) +
      (meetRows ? pcard('event', 'var(--blue-soft)', 'var(--blue)', 'Meetings with ' + esc(p.name.split(' ')[0]), null, meetRows) : '') +
    '</div>' +
    '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 class="card-title" style="margin:0">Match Summary</h2>' +
      '<button class="btn-link" style="padding:0;font-size:0.78rem" onclick="b2bEditPrefs()"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">tune</span> Edit my preferences</button></div>' +
      '<div class="prog-row" style="margin-top:10px"><div class="pr-head"><span>Overall Match</span><span>' + m.pct + '%</span></div>' +
        '<div class="prog-bar"><i style="width:' + m.pct + '%"></i></div></div>' +
      (m.demandPct !== null ? '<div class="prog-row" style="margin-top:12px"><div class="pr-head"><span>They look for · You offer</span><span>' + m.demandPct + '%</span></div>' +
        '<div class="prog-bar"><i style="width:' + m.demandPct + '%"></i></div></div>' : '') +
      (m.supplyPct !== null ? '<div class="prog-row" style="margin-top:8px"><div class="pr-head"><span>They offer · You look for</span><span>' + m.supplyPct + '%</span></div>' +
        '<div class="prog-bar"><i style="width:' + m.supplyPct + '%"></i></div></div>' : '') +
      '<div style="font-size:0.8rem;color:var(--muted);font-weight:600;margin-top:8px">' +
        '<b style="color:var(--ink)">' + m.offHit.length + '</b> matched with your Offering · ' +
        '<b style="color:var(--ink)">' + m.catHit.length + '</b> with your Exhibition Categories · ' +
        '<b style="color:var(--ink)">' + m.lfHit.length + '</b> with your Looking For</div>' +
      (m.offHit.length + m.lfHit.length ? '<div style="margin-top:10px">' + m.offHit.concat(m.lfHit).map((s) => '<span class="tagchip" style="margin:0 5px 5px 0">' + esc(s) + '</span>').join('') + '</div>' : '') +
    '</div></div>';
}

/* ---------------- request / respond ---------------- */
function openMeetingModal(partId) {
  const p = PARTICIPANTS.find((x) => x.id === partId);
  const m = b2bMatchInfo(p);
  openModal('Request B2B Meeting — ' + esc(p.name),
    '<div class="note" style="margin-top:0"><b class="title">' + esc(p.company) + ' · ' + m.pct + '% match</b>' +
      'Matched on: ' + (m.offHit.concat(m.lfHit, m.catHit).slice(0, 4).map(esc).join(', ') || 'general networking') + '</div>' +
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
      '<div class="field full"><label>Meeting Title <span class="req">*</span></label>' +
        '<input type="text" id="mtTitle" maxlength="100" value="Business Meeting — ' + esc(p.company) + '"></div>' +
      '<div class="field full"><label>Meeting Description</label>' +
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
    title: ($('mtTitle') && $('mtTitle').value.trim()) || 'Business Meeting',
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
  const m = S.b2b.meetings.find((x) => x.id === id);
  if (!m) return;
  m.status = 'cancelled';
  m.cancelledAt = nowStr();
  save(); render();
  toast('Meeting cancelled.', 'success');
}

/* ---------------- Meetings & Requests tab ----------------
   Laid out like the platform's "Networking Lounge Meetings":
   From · To · Meeting At · Title · Description · Status · Actions,
   with search, date, slot, status & team filters and pagination.
   Requests to ANY team member land here in the main login. */
/* statuses follow the platform: Pending · Approved · Rejected · Cancelled · Completed
   (a rescheduled meeting goes back to Pending with a "Rescheduled" note) */
const mtgStatusKey = (m) => ['confirmed', 'declined', 'cancelled', 'completed'].includes(m.status) ? m.status : 'pending';
const MTG_STATUS = {
  pending: ['amber', 'Pending'], confirmed: ['green', 'Approved'], declined: ['red', 'Rejected'],
  cancelled: ['gray', 'Cancelled'], completed: ['blue', 'Completed'],
};
const mtgStatusPill = (m) => { const s = MTG_STATUS[mtgStatusKey(m)]; return '<span class="pill ' + s[0] + '">' + s[1] + '</span>'; };

function slotRange(slot) {
  const mm = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot || '');
  if (!mm) return slot || '';
  const h = (+mm[1] % 12) + (mm[3] === 'PM' ? 12 : 0);
  const e = (h + 1) % 24;
  return slot + ' - ' + String(e % 12 || 12).padStart(2, '0') + ':' + mm[2] + ' ' + (e >= 12 ? 'PM' : 'AM');
}

function mtgTitle(m) {
  if (m.title) return m.title;
  return m.direction === 'incoming'
    ? 'Hi ' + memberName(m).split(' ')[0] + ', I would like to connect with you.'
    : 'Business Meeting';
}

function mtgPersonCell(name, company, desig) {
  return '<span class="td-strong">' + esc(name) + '</span>' +
    '<span class="td-sub"><b>C:</b> ' + esc(company) + '</span>' +
    (desig ? '<span class="td-sub"><b>D:</b> ' + esc(desig) + '</span>' : '');
}

function mtgActions(m) {
  const k = mtgStatusKey(m);
  const b = (label, fn, color) =>
    '<button class="btn btn-outline btn-sm" style="color:' + (color || 'var(--blue)') + ';min-width:84px;justify-content:center" onclick="' + fn + '">' + label + '</button>';
  if (k === 'confirmed') {
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
      b('Reschedule', 'openRescheduleModal(\'' + m.id + '\')') +
      b('Cancel', 'cancelMeeting(\'' + m.id + '\')', 'var(--red)') + '</div>';
  }
  if (k === 'declined') return '<span style="color:var(--red);font-weight:700;font-size:0.84rem">Rejected</span>';
  if (k === 'cancelled') return '<span style="color:var(--muted);font-weight:700;font-size:0.84rem">Cancelled</span>';
  if (k === 'completed') return '<span style="color:var(--blue);font-weight:700;font-size:0.84rem">Completed</span><span class="td-sub">Marked by organiser</span>';
  if (m.direction === 'incoming') {
    return '<div style="display:flex;gap:6px">' +
      b('Accept', 'respondMeeting(\'' + m.id + '\',\'confirmed\')') +
      b('Reject', 'respondMeeting(\'' + m.id + '\',\'declined\')', 'var(--red)') + '</div>';
  }
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
    '<span style="color:var(--amber);font-weight:700;font-size:0.8rem;display:block;width:100%">Awaiting response</span>' +
    b('Reschedule', 'openRescheduleModal(\'' + m.id + '\')') +
    b('Cancel', 'cancelMeeting(\'' + m.id + '\')', 'var(--red)') + '</div>';
}

window.__b2bTeam = window.__b2bTeam || '';
window.__b2bMtgQ = window.__b2bMtgQ || '';
window.__b2bMtgDate = window.__b2bMtgDate || '';
window.__b2bMtgSlot = window.__b2bMtgSlot || '';
window.__b2bMtgStatus = window.__b2bMtgStatus || '';
window.__b2bMtgPage = window.__b2bMtgPage || 1;
const MTG_ROWS = 10;
function mtgSet(key, v) { window[key] = v; window.__b2bMtgPage = 1; render(); }
function mtgSetQ(v) {
  window.__b2bMtgQ = v; window.__b2bMtgPage = 1; render();
  const el = $('b2bMtgQ'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}
function mtgPage(d) { window.__b2bMtgPage += d; render(); }

function mtgFiltered() {
  const q = window.__b2bMtgQ.toLowerCase();
  return S.b2b.meetings.filter((m) =>
    (!q || (m.name + ' ' + memberName(m) + ' ' + m.company).toLowerCase().includes(q)) &&
    (!window.__b2bTeam || m.memberId === window.__b2bTeam) &&
    (!window.__b2bMtgDate || m.date === window.__b2bMtgDate) &&
    (!window.__b2bMtgSlot || m.slot === window.__b2bMtgSlot) &&
    (!window.__b2bMtgStatus || mtgStatusKey(m) === window.__b2bMtgStatus));
}

function exportMeetingsCsv() {
  const list = mtgFiltered();
  if (!list.length) { toast('No meetings to export.', 'error'); return; }
  const head = ['From', 'From Company', 'To', 'To Company', 'Date', 'Slot', 'Venue', 'Title', 'Description', 'Status'];
  const rows = list.map((m) => {
    const inc = m.direction === 'incoming';
    return [inc ? m.name : memberName(m), inc ? m.company : EVENT.exhibitor,
      inc ? memberName(m) : m.name, inc ? EVENT.exhibitor : m.company,
      m.date, slotRange(m.slot), m.venue, mtgTitle(m), m.note || '-', MTG_STATUS[mtgStatusKey(m)][1]];
  });
  const csv = [head].concat(rows)
    .map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'B2B-Meetings-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  toast('Meetings exported.', 'success');
}

function b2bMeetingsBody() {
  const sel = (key, opts, allLabel) =>
    '<select class="flt-sel" onchange="mtgSet(\'' + key + '\', this.value)">' +
      '<option value="">' + allLabel + '</option>' +
      opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (window[key] === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') +
    '</select>';
  const hasFlt = window.__b2bMtgQ || window.__b2bTeam || window.__b2bMtgDate || window.__b2bMtgSlot || window.__b2bMtgStatus;

  const all = S.b2b.meetings;
  const cnt = (k) => all.filter((m) => mtgStatusKey(m) === k).length;
  const list = mtgFiltered();
  const totalPages = Math.max(1, Math.ceil(list.length / MTG_ROWS));
  if (window.__b2bMtgPage > totalPages) window.__b2bMtgPage = totalPages;
  const start = (window.__b2bMtgPage - 1) * MTG_ROWS;

  const rows = list.slice(start, start + MTG_ROWS).map((m) => {
    const inc = m.direction === 'incoming';
    const p = PARTICIPANTS.find((x) => x.id === m.partId);
    const t = teamById(m.memberId) || {};
    const visitor = mtgPersonCell(m.name, m.company, p ? p.desig : '');
    const member = mtgPersonCell(memberName(m), 'HAL', t.desig || '');
    return '<tr>' +
      '<td style="min-width:170px">' + (inc ? visitor : member) + '</td>' +
      '<td style="min-width:170px">' + (inc ? member : visitor) + '</td>' +
      '<td style="white-space:nowrap">' + esc(m.date) + '<span class="td-sub">' + esc(slotRange(m.slot)) + '</span>' +
        '<span class="td-sub">' + esc(m.venue) + '</span></td>' +
      '<td style="min-width:150px;max-width:210px">' + esc(mtgTitle(m)) + '</td>' +
      '<td style="min-width:160px;max-width:230px">' + (m.note ? esc(m.note) : '-') + '</td>' +
      '<td>' + mtgStatusPill(m) + (m.rescheduled && mtgStatusKey(m) === 'pending' ? '<span class="td-sub" style="color:var(--amber)">Rescheduled</span>' : '') + '</td>' +
      '<td style="min-width:190px">' + mtgActions(m) + '</td>' +
    '</tr>';
  }).join('') ||
    '<tr><td colspan="7"><div class="empty" style="padding:26px 10px"><span class="material-symbols-outlined">event_busy</span>' +
    '<h3>No meetings found</h3><p>' + (all.length ? 'No meetings match the selected filters.' : 'Request a meeting from the Recommended Matches tab.') + '</p></div></td></tr>';

  return '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Meetings</div><div class="t-value">' + all.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Pending</div><div class="t-value">' + cnt('pending') + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Approved</div><div class="t-value">' + cnt('confirmed') + '</div></div>' +
      '<div class="tile"><div class="t-label">Rejected</div><div class="t-value">' + cnt('declined') + '</div></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head-row" style="margin-bottom:6px"><h2 class="card-title">Meetings &amp; Requests</h2>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<button class="icon-act" title="Export" onclick="exportMeetingsCsv()"><span class="material-symbols-outlined" style="font-size:19px;color:var(--blue)">download</span></button>' +
          '<button class="btn btn-outline btn-sm" onclick="openTeamModal()"><span class="material-symbols-outlined" style="font-size:16px">groups</span>My Team (' + S.b2b.team.length + ')</button>' +
        '</div></div>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 12px">All requests sent to <b>any of your team members</b> appear here — you (main login) or the member can accept them.</p>' +
      '<div class="b2b-row">' +
        '<div style="flex:1;min-width:220px;display:flex;align-items:center;gap:8px;border:1px solid #CFD7E4;border-radius:9px;padding:0 12px">' +
          '<span class="material-symbols-outlined" style="font-size:19px;color:var(--muted)">search</span>' +
          '<input type="text" id="b2bMtgQ" value="' + esc(window.__b2bMtgQ) + '" placeholder="Search Meetings by User Name" oninput="mtgSetQ(this.value)" ' +
            'style="flex:1;border:none;outline:none;padding:9px 0;font-family:inherit;font-size:0.86rem;background:none">' +
        '</div>' +
        sel('__b2bMtgDate', EVENT.eventDays.map((d) => [d, d]), 'All Dates') +
        sel('__b2bMtgSlot', SLOT_TIMES.map((s) => [s, slotRange(s)]), 'All Slot') +
        sel('__b2bMtgStatus', Object.keys(MTG_STATUS).map((k) => [k, MTG_STATUS[k][1]]), 'All Status') +
        sel('__b2bTeam', S.b2b.team.map((t) => [t.id, t.name]), 'All Team Members') +
        (hasFlt ? '<button class="btn btn-outline btn-sm" onclick="window.__b2bMtgQ=\'\';window.__b2bTeam=\'\';window.__b2bMtgDate=\'\';window.__b2bMtgSlot=\'\';window.__b2bMtgStatus=\'\';window.__b2bMtgPage=1;render()"><span class="material-symbols-outlined" style="font-size:15px">filter_alt_off</span>Clear</button>' : '') +
      '</div>' +
      '<div class="tablewrap" style="margin-top:12px"><table class="grid">' +
      '<tr><th>From</th><th>To</th><th>Meeting At</th><th>Meeting Title</th><th>Meeting Description</th><th>Status</th><th>Actions</th></tr>' +
      rows + '</table></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px;font-size:0.8rem;color:var(--muted)">' +
        '<span class="pill blue">Total: ' + list.length + '</span>' +
        '<span style="display:flex;align-items:center;gap:8px">Rows ' + MTG_ROWS + ' · Showing <b>' + (list.length ? start + 1 : 0) + '</b> to <b>' + Math.min(start + MTG_ROWS, list.length) + '</b>' +
          '<button class="btn btn-outline btn-sm" onclick="mtgPage(-1)"' + (window.__b2bMtgPage <= 1 ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_left</span></button>' +
          '<button class="btn btn-outline btn-sm" onclick="mtgPage(1)"' + (window.__b2bMtgPage >= totalPages ? ' disabled' : '') + '><span class="material-symbols-outlined" style="font-size:16px">keyboard_arrow_right</span></button>' +
        '</span></div>' +
    '</div>';
}

ROUTES['b2b-matchmaking'] = viewB2BMatchmaking;
