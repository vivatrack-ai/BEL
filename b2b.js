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
    save();
  }
})();

/* ---------------- visiting companies / delegations (demo directory) ----------------
   In production this list streams from visitor registrations; each
   entry carries the visitor-side "I am Looking For" selections. */
const PARTICIPANTS = [
  { id: 'pt_garuda', name: 'Cmdr. Arjun Nair (Retd.)', desig: 'Director — Procurement', company: 'Garuda Aerospace Services', country: 'India', type: 'Visitor',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Overhaul Services', 'Repair Services'], 'Helicopters & Rotary Wing': ['Naval Helicopters'] } },
  { id: 'pt_meridian', name: 'Sofia Andersson', desig: 'Head of Sourcing', company: 'Meridian Defence Logistics', country: 'Sweden', type: 'Delegation',
    lookingFor: { 'MRO & Lifecycle Support': ['Spares & Consumables Supply', 'Upgrades & Retrofits'], 'Defence Logistics & Supply Chain': ['Warehousing Solutions'] } },
  { id: 'pt_skyhawk', name: 'Maj. Gen. R. K. Bisht (Retd.)', desig: 'Advisor', company: 'SkyHawk Defence Consultants', country: 'India', type: 'Visitor',
    lookingFor: { 'Aircraft Systems (Fixed Wing)': ['Fighter Aircraft', 'Light Combat Aircraft'], 'Simulation & Training': ['Flight Simulators'] } },
  { id: 'pt_helios', name: 'Daniel Moreau', desig: 'VP Business Development', company: 'Helios Avionique', country: 'France', type: 'Delegation',
    lookingFor: { 'Avionics': ['Mission Computers', 'Cockpit Displays / Glass Cockpits', 'Head-Up Displays (HUD)'] } },
  { id: 'pt_indocoast', name: 'Capt. Meera Pillai', desig: 'Fleet Manager', company: 'IndoCoast Marine Services', country: 'India', type: 'Visitor',
    lookingFor: { 'MRO & Lifecycle Support': ['Maintenance Services', 'Fleet Sustainment & Life Extension Programmes'], 'Naval Platforms': ['Offshore Patrol Vessels (OPVs)'] } },
  { id: 'pt_zenith', name: 'Kenji Watanabe', desig: 'Chief Engineer', company: 'Zenith Precision Industries', country: 'Japan', type: 'Delegation',
    lookingFor: { 'Precision Engineering': ['CNC Machining', 'Bearings'], 'Advanced Materials': ['Composite Materials'] } },
  { id: 'pt_deccan', name: 'Ishaan Reddy', desig: 'Founder & CEO', company: 'Deccan UAV Labs', country: 'India', type: 'Exhibitor',
    lookingFor: { 'Unmanned Aerial Systems': ['Fixed-Wing UAVs', 'UAV Ground Control Stations'], 'Engines & Propulsion': ['Turboprop Engines'] } },
  { id: 'pt_atlas', name: 'Hannah Cole', desig: 'Programme Director', company: 'Atlas AeroWorks', country: 'United Kingdom', type: 'Delegation',
    lookingFor: { 'Aircraft Systems (Fixed Wing)': ['Basic Trainer Aircraft'], 'MRO & Lifecycle Support': ['Overhaul Services', 'Technical Publications & Documentation'] } },
  { id: 'pt_sarang', name: 'Dr. Nivedita Rao', desig: 'Director — R&D', company: 'Sarang Defence Research', country: 'India', type: 'Visitor',
    lookingFor: { 'Artificial Intelligence & Autonomy': ['Computer Vision', 'AI Decision Support Systems'], 'Simulation & Training': ['Wargaming & Decision Simulation'] } },
  { id: 'pt_gulfwing', name: 'Omar Al-Farsi', desig: 'Procurement Head', company: 'GulfWing Aviation', country: 'UAE', type: 'Delegation',
    lookingFor: { 'Helicopters & Rotary Wing': ['Utility Helicopters', 'VIP Helicopters'], 'MRO & Lifecycle Support': ['Maintenance Services'] } },
];

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

function b2bMatchesBody() {
  const off = flatSubs(S.profile.matchmaking.offering);
  if (!off.length) {
    return '<div class="card"><div class="empty"><span class="material-symbols-outlined">hub</span>' +
      '<h3>Set up your Offering first</h3><p>Matches are computed from your matchmaking Offering. Select the products &amp; capabilities you offer, then come back here.</p>' +
      '<a class="btn btn-primary" href="#/profile/matchmaking">Open Matchmaking</a></div></div>';
  }
  const q = window.__b2bQ.toLowerCase();
  let list = PARTICIPANTS.map((p) => ({ p: p, m: b2bMatchInfo(p) }));
  if (q) list = list.filter((x) => (x.p.name + ' ' + x.p.company + ' ' + x.p.country).toLowerCase().includes(q));
  if (window.__b2bMin) list = list.filter((x) => x.m.pct >= window.__b2bMin);
  list.sort((a, b) => b.m.pct - a.m.pct);

  const minChips = [[0, 'All'], [30, '30%+'], [60, '60%+']].map(([v, l]) =>
    '<button class="fchip' + (window.__b2bMin === v ? ' on' : '') + '" onclick="window.__b2bMin=' + v + ';render()">' + l + ' match</button>').join('');

  const cards = list.map((x) => {
    const p = x.p, m = x.m;
    const already = S.b2b.meetings.some((mt) => mt.partId === p.id && mt.status !== 'declined');
    const chips = m.offHit.slice(0, 3).map((s) => '<span class="tagchip" style="margin:0 4px 4px 0">' + esc(s) + '</span>').join('') +
      m.catHit.slice(0, 2).map((s) => '<span class="tagchip" style="margin:0 4px 4px 0;background:#F1F4FA;color:var(--muted)">' + esc(s) + '</span>').join('') +
      (m.offHit.length + m.catHit.length > 5 ? '<span class="tagchip" style="margin:0 4px 4px 0;background:#F1F4FA;color:var(--muted)">+' + (m.offHit.length + m.catHit.length - 5) + '</span>' : '');
    const badge = m.pct >= 60 ? 'var(--green)' : m.pct >= 30 ? 'var(--amber)' : 'var(--muted)';
    return '<div class="card" style="margin-top:12px"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
      '<span class="avatar" style="width:44px;height:44px;font-size:1.05rem;flex:none">' + esc(p.name.charAt(0)) + '</span>' +
      '<div style="flex:1;min-width:230px">' +
        '<b style="font-size:0.95rem">' + esc(p.name) + '</b> <span class="pill ' + (p.type === 'Delegation' ? 'blue' : 'gray') + '">' + p.type + '</span>' +
        '<div class="td-sub">' + esc(p.desig) + ' · ' + esc(p.company) + ' · ' + esc(p.country) + '</div>' +
        '<div style="margin-top:8px">' + (chips || '<span style="font-size:0.76rem;color:var(--muted)">No direct overlap — general networking</span>') + '</div>' +
      '</div>' +
      '<div style="text-align:right;min-width:130px">' +
        '<div style="font-size:1.35rem;font-weight:800;color:' + badge + '">' + m.pct + '%</div>' +
        '<div style="font-size:0.68rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Match Score</div>' +
        (already
          ? '<span class="pill green">Meeting ' + (S.b2b.meetings.find((mt) => mt.partId === p.id && mt.status === 'confirmed') ? 'Confirmed' : 'Requested') + '</span>'
          : '<button class="btn btn-primary btn-sm" onclick="openMeetingModal(\'' + p.id + '\')"><span class="material-symbols-outlined" style="font-size:15px">event</span>Request Meeting</button>') +
      '</div></div></div>';
  }).join('') || '<div class="card"><div class="empty"><span class="material-symbols-outlined">search_off</span><h3>No matches found</h3><p>Try clearing the search or match filter.</p></div></div>';

  return '<div class="card"><div class="card-head-row" style="margin-bottom:0;flex-wrap:wrap;gap:10px">' +
      '<input type="text" value="' + esc(window.__b2bQ) + '" placeholder="Search by name, company or country" oninput="window.__b2bQ=this.value;render()" ' +
        'style="flex:1;min-width:220px;border:1px solid #CFD7E4;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
      '<div class="filter-chips">' + minChips + '</div>' +
      '<span class="result-count">' + list.length + ' of ' + PARTICIPANTS.length + '</span>' +
    '</div></div>' + cards;
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
    note: $('mtNote').value.trim(),
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
  save(); render();
  toast('Meeting ' + (status === 'confirmed' ? 'accepted — added to your schedule.' : 'declined.'), status === 'confirmed' ? 'success' : 'error');
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

function b2bMeetingsBody() {
  const inc = S.b2b.meetings.filter((m) => m.direction === 'incoming' && m.status === 'pending');
  const incoming = inc.length
    ? '<div class="card pending-card" style="margin-bottom:16px"><div class="card-head-row"><h2 class="card-title">Incoming Requests</h2>' +
      '<span class="pill amber">' + inc.length + ' awaiting your response</span></div>' +
      inc.map((m) =>
        '<div class="action-row"><span class="aicon"><span class="material-symbols-outlined">move_to_inbox</span></span>' +
        '<div class="atext"><b>' + esc(m.name) + ' · ' + esc(m.company) + '</b>' +
        '<span>' + esc(m.date) + ' · ' + esc(m.slot) + ' · ' + esc(m.venue) + (m.note ? ' — “' + esc(m.note) + '”' : '') + '</span></div>' +
        '<button class="btn btn-primary btn-sm" onclick="respondMeeting(\'' + m.id + '\',\'confirmed\')">Accept</button>' +
        '<button class="btn btn-outline btn-sm" onclick="respondMeeting(\'' + m.id + '\',\'declined\')">Decline</button>' +
        '</div>').join('') + '</div>'
    : '';

  const rows = S.b2b.meetings.map((m, i) =>
    '<tr><td>' + (i + 1) + '</td>' +
    '<td><span class="td-strong">' + esc(m.name) + '</span><span class="td-sub">' + esc(m.company) + '</span></td>' +
    '<td>' + esc(m.date) + '<span class="td-sub">' + esc(m.slot) + '</span></td>' +
    '<td>' + esc(m.venue) + '</td>' +
    '<td>' + (m.direction === 'incoming' ? '<span class="pill blue">Incoming</span>' : '<span class="pill gray">Sent by you</span>') + '</td>' +
    '<td>' + mtgStatusPill(m) + '</td>' +
    '<td class="td-actions">' +
      (m.direction === 'outgoing' && m.status === 'pending'
        ? '<button class="btn-link danger" onclick="cancelMeeting(\'' + m.id + '\')">Cancel</button>' : '') +
    '</td></tr>').join('') ||
    '<tr><td colspan="7" style="color:var(--muted)">No meetings yet — request one from the Recommended Matches tab.</td></tr>';

  const confirmed = S.b2b.meetings.filter((m) => m.status === 'confirmed').length;
  return incoming +
    '<div class="tiles">' +
      '<div class="tile blue"><div class="t-label">Total Meetings</div><div class="t-value">' + S.b2b.meetings.length + '</div></div>' +
      '<div class="tile accent"><div class="t-label">Confirmed</div><div class="t-value">' + confirmed + '</div></div>' +
      '<div class="tile"><div class="t-label">Awaiting Response</div><div class="t-value">' + S.b2b.meetings.filter((m) => m.status === 'pending').length + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Meeting Schedule</h2></div>' +
    '<div class="tablewrap"><table class="grid">' +
    '<tr><th>No.</th><th>With</th><th>Date / Slot</th><th>Venue</th><th>Direction</th><th>Status</th><th></th></tr>' +
    rows + '</table></div></div>';
}

ROUTES['b2b-matchmaking'] = viewB2BMatchmaking;
