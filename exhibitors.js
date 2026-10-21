/* ============================================================
   Exhibitor portal logins (demo). Each company has its own portal
   state (localStorage key) so the domestic and the international
   flows can be tested side by side; the admin reads every portal.
   origin drives the billing currency: national → INR (Indian
   participant rates), international → USD (foreign participant rates).
   ============================================================ */

'use strict';

const SB_EXHIBITORS = [
  { id: 'hal', company: 'Hindustan Aeronautics Limited (HAL)', regNo: 'EXHC00001', country: 'India', origin: 'national',
    email: 'dhirens@evenuefy.com', lsKey: 'evenuefy_coex_module_v1', seedStalls: true, label: 'Domestic · Indian participant · billed in INR' },
  { id: 'saab', company: 'Saab AB', regNo: 'EXHC00002', country: 'Sweden', origin: 'international',
    email: 'aeroindia@saab-demo.se', lsKey: 'evenuefy_coex_module_v1_saab', seedStalls: false, label: 'International · foreign participant · billed in USD' },
  { id: 'startup', company: 'Nimbus Aerotech Private Limited', regNo: 'EXHC00003', country: 'India', origin: 'national', startup: true,
    email: 'founder@nimbus-aerotech-demo.in', lsKey: 'evenuefy_coex_module_v1_startup', seedStalls: false, label: 'Indian startup · Startup Zone pod · billed in INR' },
];
const SB_EXH_SEL_KEY = 'evenuefy_exhibitor';
function sbExhibitorById(id) { return SB_EXHIBITORS.find((p) => p.id === id) || SB_EXHIBITORS[0]; }
/* the company logged into this portal (chosen on the login screen).
   In the co-exhibitor portal (coex.html sets EVENUEFY_PORTAL = 'coex')
   it is the logged-in co-exhibitor / aggregator workspace instead. */
function sbCurrentExhibitor() {
  if (typeof window !== 'undefined' && window.EVENUEFY_PORTAL === 'coex') {
    const s = sbCoexSession();
    return (s && sbCoexProfile(s.mainId, s.coexId)) || SB_COEX_GUEST;
  }
  let id = null;
  try { id = localStorage.getItem(SB_EXH_SEL_KEY); } catch (e) { /* ignore */ }
  return sbExhibitorById(id);
}

function sbReadState(key) {
  if (!key) return null;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

/* ============================================================
   Co-exhibitor / aggregator workspaces
   A Separate co-exhibitor (registration paid) or an Aggregator
   (approved by the organiser) logs into coex.html and gets its own
   workspace: exhibition forms, digital showcase, aircraft, B2B,
   meeting rooms, its own cart & orders. Stall space and pass quotas
   stay in the main exhibitor's state (allocated by the main exhibitor).
   ============================================================ */
const SB_COEX_SESSION_KEY = 'evenuefy_coexlogin_session';
const sbCoexKey = (mainId, coexId) => 'evenuefy_coexws_' + mainId + '_' + coexId;
const sbCoexEligible = (c) => !!c && c.status === 'active' && (c.type === 'separate' || c.type === 'aggregator');
const SB_COEX_GUEST = { id: 'coex-guest', company: 'Co-Exhibitor', regNo: '', country: 'India', origin: 'national', email: '',
  lsKey: null, seedStalls: false, coex: true, parent: null };
/* session value "mainId:coexId" (sessions started before multi-exhibitor logins hold only HAL's coexId) */
function sbCoexSession() {
  let v = null;
  try { v = sessionStorage.getItem(SB_COEX_SESSION_KEY); } catch (e) { return null; }
  if (!v) return null;
  const i = v.indexOf(':');
  return i < 0 ? { mainId: 'hal', coexId: v } : { mainId: v.slice(0, i), coexId: v.slice(i + 1) };
}
function sbCoexProfile(mainId, coexId) {
  const parent = SB_EXHIBITORS.find((p) => p.id === mainId);
  if (!parent) return null;
  const st = sbReadState(parent.lsKey);
  const c = ((st && st.coexhibitors) || []).find((x) => x.id === coexId);
  if (!c) return null;
  const role = c.type === 'aggregator' ? 'Aggregator' : 'Co-Exhibitor';
  return { id: 'coex:' + mainId + ':' + coexId, company: c.company, regNo: c.regNo || '', country: parent.country, origin: parent.origin,
    email: c.email, lsKey: sbCoexKey(mainId, coexId), seedStalls: false, coex: true, coexId: coexId, coexType: c.type,
    parent: parent, role: role, label: role + ' of ' + parent.company };
}
/* every company that can log into the co-exhibitor portal, across all main exhibitors */
function sbCoexLogins() {
  const out = [];
  SB_EXHIBITORS.forEach((p) => {
    const st = sbReadState(p.lsKey);
    ((st && st.coexhibitors) || []).filter(sbCoexEligible).forEach((c) => {
      out.push({ value: p.id + ':' + c.id, mainId: p.id, coexId: c.id, company: c.company, email: c.email, type: c.type, parent: p });
    });
  });
  return out;
}

/* ============================================================
   Every company workspace (admin & committee read all of them):
   main exhibitor portals + co-exhibitor / aggregator portals.
   Records keep their per-company ids; outside their workspace they are
   addressed as "<workspace key>|<id>" so equal ids never collide.
   ============================================================ */
function sbWorkspaces() {
  const out = [];
  SB_EXHIBITORS.forEach((p) => {
    out.push({ key: p.lsKey, company: p.company, regNo: p.regNo, role: 'exhibitor', parent: null });
    const st = sbReadState(p.lsKey);
    ((st && st.coexhibitors) || []).filter((c) => c.type === 'separate' || c.type === 'aggregator').forEach((c) => {
      out.push({ key: sbCoexKey(p.id, c.id), company: c.company, regNo: c.regNo || '', role: c.type === 'aggregator' ? 'aggregator' : 'coex', parent: p });
    });
  });
  return out;
}
const sbWsRole = (ws) => (!ws || ws.role === 'exhibitor' ? 'Main exhibitor'
  : (ws.role === 'aggregator' ? 'Aggregator' : 'Co-exhibitor') + ' of ' + ws.parent.company);
const sbRef = (ws, id) => ws.key + '|' + id;
function sbParseRef(ref) {
  const s = String(ref);
  const i = s.indexOf('|');
  return i < 0 ? { key: null, id: s } : { key: s.slice(0, i), id: s.slice(i + 1) };
}
function sbTag(obj, ws) { Object.defineProperty(obj, '__ws', { value: ws, enumerable: false }); return obj; }
const sbWsCompany = (x) => (x && x.__ws ? x.__ws.company : SB_EXHIBITORS[0].company);
/* copies of a collection from every workspace — id replaced by the cross-workspace ref */
function sbAllIn(collection, wsFilter) {
  const out = [];
  sbWorkspaces().filter(wsFilter || (() => true)).forEach((ws) => {
    const st = sbReadState(ws.key);
    ((st && st[collection]) || []).forEach((x) => out.push(sbTag(Object.assign({}, x, { id: sbRef(ws, x.id), rawId: x.id }), ws)));
  });
  return out;
}
/* locate one record by ref (or a bare id — first workspace that has it) → { ws, st, item, ref } */
function sbFindIn(collection, ref) {
  const p = sbParseRef(ref);
  const list = sbWorkspaces().filter((ws) => !p.key || ws.key === p.key);
  for (let i = 0; i < list.length; i++) {
    const st = sbReadState(list[i].key);
    const item = st && (st[collection] || []).find((x) => x.id === p.id);
    if (item) return { ws: list[i], st: st, item: item, ref: sbRef(list[i], item.id) };
  }
  return null;
}
function sbWsSave(found) { try { localStorage.setItem(found.ws.key, JSON.stringify(found.st)); } catch (e) { /* ignore */ } }
/* next order number — ONE series across every company workspace, so two companies never share an
   order / invoice number. `st` is the caller's in-memory state (unsaved orders of a multi-item checkout count). */
function sbNextOrderNo(st) {
  const n = (o) => { const m = /^ORD-2027-(\d+)$/.exec((o && o.orderNo) || ''); return m ? parseInt(m[1], 10) : 0; };
  let max = 0;
  sbWorkspaces().forEach((ws) => ((sbReadState(ws.key) || {}).orders || []).forEach((o) => { max = Math.max(max, n(o)); }));
  ((st && st.orders) || []).forEach((o) => { max = Math.max(max, n(o)); });
  return 'ORD-2027-' + String(max + 1).padStart(4, '0');
}
/* a storage event that concerns any company workspace */
const sbIsWsKey = (key) => !!key && key.indexOf('evenuefy_coex') === 0;

/* ============================================================
   T&C 9(y) — Inaugural Function & Dinner invites
   · every exhibitor: 2 inaugural + 1 dinner invite per 50 sq.m block (pro-rata per further 50 sq.m)
   · Startup Zone pod holder: 1 inaugural + 1 dinner per pod
   · each indirect / co-exhibitor (Separate co-exhibitor or Aggregator, active): 1 + 1 complimentary
   · Platinum / Gold / Silver sponsors: 5+5 / 3+3 / 2+2 additional (sponsorship tariff)
   Nominations need the exhibitor's nodal officer approval, as for invitees.
   ============================================================ */
const SB_CER_CATS = [
  { id: 'cat_inaug', kind: 'ceremony', name: 'Inaugural Function Invite', free: 0, paid: 0 },
  { id: 'cat_dinner', kind: 'ceremony', name: 'Dinner Invite', free: 0, paid: 0 },
];
const SB_CER_SPONSOR = { sp_plat: { inaug: 5, dinner: 5, name: 'Platinum Sponsorship' }, sp_gold: { inaug: 3, dinner: 3, name: 'Gold Sponsorship' }, sp_silver: { inaug: 2, dinner: 2, name: 'Silver Sponsorship' } };
const SB_CER_EVENT = {
  inaug: { title: 'Inaugural Function', when: '08 February 2027 · 0900 hrs onwards', where: 'Air Force Station Yelahanka, Bengaluru' },
  dinner: { title: 'Networking Dinner', when: 'Date & time as intimated by the DEO', where: 'Venue as intimated by the DEO' },
};
/* rates — the Space Booking Configuration page can override them (admin) */
function sbCerRates() {
  const cfg = typeof sbpConfig === 'function' ? sbpConfig() : (sbReadState('evenuefy_space_config_v1') || {});
  const p = cfg.passes || {}, sp = (cfg.startup && cfg.startup.passes) || {};
  const n = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));
  return { inaugPer50: n(p.inaugPer50, 2), dinnerPer50: n(p.dinnerPer50, 1), podInaug: n(sp.inaug, 1), podDinner: n(sp.dinner, 1),
    coexInaug: n(p.coexInaug, 1), coexDinner: n(p.coexDinner, 1) };
}
const sbCerIsPod = (s) => s.scheme === 'pod' || s.hall === 'SZ' || String(s.hall) === 'Startup Zone';
const sbCerCoexList = (state) => ((state && state.coexhibitors) || []).filter((c) => c.status === 'active' && (c.type === 'separate' || c.type === 'aggregator'));
function sbCeremonyEntitlement(state) {
  const r = sbCerRates();
  const stalls = (state && state.stalls) || [];
  const sqm = stalls.filter((s) => !sbCerIsPod(s)).reduce((a, s) => a + Number(s.area != null ? s.area : s.sqm || 0) + Number(s.mezzSqm || 0), 0);
  const pods = stalls.filter(sbCerIsPod).length;
  const blocks = sqm > 0 ? 1 + Math.floor(Math.max(0, sqm - 50) / 50) : 0;
  const space = { inaug: blocks * r.inaugPer50 + pods * r.podInaug, dinner: blocks * r.dinnerPer50 + pods * r.podDinner };
  const coex = sbCerCoexList(state);
  const coexEnt = { inaug: coex.length * r.coexInaug, dinner: coex.length * r.coexDinner };
  const picked = (state && state.exforms && state.exforms.sponsorship && state.exforms.sponsorship.picked) || [];
  const sponsors = picked.filter((id) => SB_CER_SPONSOR[id]).map((id) => SB_CER_SPONSOR[id]);
  const sponsor = { inaug: sponsors.reduce((a, s) => a + s.inaug, 0), dinner: sponsors.reduce((a, s) => a + s.dinner, 0), names: sponsors.map((s) => s.name) };
  return { sqm: sqm, pods: pods, blocks: blocks, rates: r, space: space, coex: coex, coexEnt: coexEnt, sponsor: sponsor,
    inaug: space.inaug + coexEnt.inaug + sponsor.inaug, dinner: space.dinner + coexEnt.dinner + sponsor.dinner };
}
/* bring a main exhibitor's state in line with 9(y): categories, free counts and the co-exhibitors'
   complimentary 1 + 1 quota (comp quota rows; dropped again when unused and the company is no longer active) */
function sbCeremonySync(state) {
  if (!state || !Array.isArray(state.categories)) return null;
  SB_CER_CATS.forEach((c) => { if (!state.categories.some((x) => x.id === c.id)) state.categories.push(Object.assign({}, c)); });
  if (!Array.isArray(state.quotas)) state.quotas = [];
  const e = sbCeremonyEntitlement(state);
  state.categories.find((x) => x.id === 'cat_inaug').free = e.inaug;
  state.categories.find((x) => x.id === 'cat_dinner').free = e.dinner;
  const live = new Set(e.coex.map((c) => c.id));
  const used = (coexId, catId) => ((state.passes || []).filter((p) => p.catId === catId && p.coexId === coexId && p.status !== 'rejected')).length;
  state.quotas = state.quotas.filter((q) => !(q.comp && !live.has(q.coexId) && used(q.coexId, q.catId) === 0));
  e.coex.forEach((c) => [['cat_inaug', e.rates.coexInaug], ['cat_dinner', e.rates.coexDinner]].forEach(([catId, n]) => {
    if (!n) return;
    const q = state.quotas.find((x) => x.coexId === c.id && x.catId === catId);
    if (!q) state.quotas.push({ id: 'quota_cer_' + catId.slice(4) + '_' + c.id, coexId: c.id, catId: catId, quota: n, comp: true });
    else if (q.quota < n) { q.quota = n; q.comp = true; }
  }));
  return e;
}
