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
