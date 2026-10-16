/* ============================================================
   Space Booking — shared stall inventory (exhibitor app + admin).
   One source of truth for: the hall / chalet master, the demo book
   of other exhibitors' applications (deterministic), DEO's actions
   on them (stored overrides), and the occupancy map every layout
   reads. Live applications of the logged-in exhibitor (HAL) are
   overlaid by the caller, so a stall can never be in two carts.

   Layout colour code (DEO): Available = green · Blocked (in cart /
   payment under verification) = pink · Allotted (100% paid) = red.
   After 100% payment the company name is visible on the layout.
   ============================================================ */

'use strict';

/* ---------------- hall & stall master ---------------- */
const SB_SIZE = { 108: '12X9', 54: '9X6', 36: '6X6' };
const SB_HALLS = ['A', 'B', 'C', 'D', 'E'].map((h) => ({
  id: h, name: 'Hall ' + h,
  stalls: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const sqm = n <= 4 ? 108 : n <= 8 ? 54 : 36;
    return { name: h + '8.' + n, hall: h, sqm: sqm, size: SB_SIZE[sqm],
      design: n % 2 ? 'Two Side Open Stall' : 'One Side Open Stall', sides: n % 2 ? '2 Sides' : '1 Side' };
  }),
}));
/* Chalet Line 1 — 10 hospitality chalets (6m × 12m) booked single / double storey */
const SB_CHALET = {
  id: 'CH', name: 'Chalet Line 1', chalet: true,
  stalls: Array.from({ length: 10 }, (_, i) => ({ name: 'CH-' + String(i + 1).padStart(2, '0'), hall: 'CH', sqm: 72, size: '12X6', chalet: true,
    design: 'Hospitality Chalet', sides: '4 Sides' })),
};
const SB_ZONES = SB_HALLS.concat([SB_CHALET]);
const sbZone = (id) => (id === 'CH' ? SB_CHALET : SB_HALLS.find((h) => h.id === id));
const sbZoneLabel = (id) => (id === 'CH' ? 'Chalet Line 1' : 'Hall ' + id);
const sbStallMaster = (hall, name) => { const z = sbZone(hall); return z ? z.stalls.find((s) => s.name === name) : null; };
const SB_SCHEME_LABEL = { shell: 'Shell', raw: 'Raw', outdoor: 'Outdoor', chalet1: 'Chalet · Single Storey', chalet2: 'Chalet · Double Storey' };
const sbSchemeLabel = (sc) => SB_SCHEME_LABEL[sc] || sc;
const SB_LIVE_COMPANY = SB_EXHIBITORS[0].company; // legacy name (HAL)
const SB_LIVE_REGNO = SB_EXHIBITORS[0].regNo;
/* state of one exhibitor portal (null when that company has not logged in yet) */
function sbPortalState(profile) { try { const raw = localStorage.getItem(profile.lsKey); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
const sbStallKey = (st) => (st.hall === 'Chalet Line 1' ? 'CH' : String(st.hall).replace('Hall ', '')) + '|' + st.stall;

/* ---------------- demo exhibitors (names only; from the exhibitor report) ---------------- */
const SB_COMPANIES = [{"id":"6a9e8461c6cded0d252d28a1","regNo":"ERD00203","company":"MUNITIONS INDIA LIMITED","origin":"national"},{"id":"6a9e7d9ac6cded0d252d2874","regNo":"ERD00202","company":"Aitech Innovation India Private Limited","origin":"national"},{"id":"6a9e7b7fc6cded0d252d2865","regNo":"","company":"Ashok Leyland","origin":"national"},{"id":"6a9e74d2c6cded0d252d284a","regNo":"","company":"Swastik Oil Products Manufacturing Navsari Pvt. Ltd.","origin":"national"},{"id":"6a9e7138c6cded0d252d2839","regNo":"","company":"ELEKTRONIK LAB INDIA PRIVATE LIMITED","origin":"national"},{"id":"6a9e6b5bc6cded0d252d281a","regNo":"ERD00199","company":"AEROARC PRIVATE LIMITED","origin":"national"},{"id":"6a9e5f59c6cded0d252d27da","regNo":"ERD00200","company":"SANGHVI AEROSPACE PVT LTD","origin":"national"},{"id":"6a9e5ca5c6cded0d252d27c7","regNo":"ERD00195","company":"Ibex Engineering Pvt Ltd","origin":"national"},{"id":"6a9e53ccc6cded0d252d2799","regNo":"","company":"JSR DYNAMICS LIMITED","origin":"national"},{"id":"6a9e4ca3c6cded0d252d2765","regNo":"","company":"CREATIVE EDM ENGG PVT LTD","origin":"national"},{"id":"6a9e4941c6cded0d252d274f","regNo":"","company":"Indocool Composites Private Limited","origin":"national"},{"id":"6a9e47bbc6cded0d252d2745","regNo":"ERD00192","company":"Kalapurna Steel & Engg Pvt Ltd","origin":"national"},{"id":"6a9e46e0c6cded0d252d2739","regNo":"ERD00193","company":"Paarvision Autonomy Private Limited","origin":"national"},{"id":"6a9e42a4c6cded0d252d272a","regNo":"","company":"ITP Externals India Private Limited","origin":"national"},{"id":"6a9e3f82c6cded0d252d2719","regNo":"ERD00201","company":"Kusumgar Limited","origin":"national"},{"id":"6a9e3dbbc6cded0d252d2711","regNo":"","company":"IQ INFOTECH LIMITED","origin":"national"},{"id":"6a9d8050c6cded0d252d26b6","regNo":"ERD00188","company":"AeroShul Technologies Private Limited","origin":"national"},{"id":"6a9d11a4c6cded0d252d267f","regNo":"ERD00187","company":"Aero A2Z Services Private Limited","origin":"national"},{"id":"6a9cf576c6cded0d252d265b","regNo":"ERD00186","company":"Eaton Industrial Products Private Limited","origin":"national"},{"id":"6a9cd8d7c6cded0d252d2644","regNo":"ERD00184","company":"AVIOCIAN TECHNOLOGIES PRIVATE LIMITED","origin":"national"},{"id":"6a9ccb71c6cded0d252d263b","regNo":"","company":"Rucha Yantra Private Limited","origin":"national"},{"id":"6a9c1156c6cded0d252d25f9","regNo":"ERD00194","company":"SANPAR Defence Systems Pvt Ltd","origin":"national"},{"id":"6a9c0681c6cded0d252d25e4","regNo":"","company":"SAMAYA ENGINEERING","origin":"national"},{"id":"6a9bea31c6cded0d252d259e","regNo":"ERD00182","company":"DEEP AVIATION PRIVATE LIMITED","origin":"national"},{"id":"6a9bd343c6cded0d252d256b","regNo":"","company":"Optiemus Unmanned Systems","origin":"national"},{"id":"6a9bd2a0c6cded0d252d2566","regNo":"ERD00183","company":"Deep Engineering Industries","origin":"national"},{"id":"6a9bcf94c6cded0d252d2563","regNo":"","company":"IM Gears Private Ltd","origin":"national"},{"id":"6a9bbc2ec6cded0d252d250d","regNo":"ERD00175","company":"Pushpak Aerospace India Pvt Ltd","origin":"national"},{"id":"6a9bb9afc6cded0d252d2504","regNo":"ERD00173","company":"Pushpak Products India Pvt Ltd","origin":"national"},{"id":"6a9bb6b7c6cded0d252d24fb","regNo":"","company":"MIDHANI","origin":"national"},{"id":"6a9ba841c6cded0d252d24d0","regNo":"ERD00172","company":"INNOMATIX GLOBAL SOLUTIONS PRIVATE LIMITED","origin":"national"},{"id":"6a9ba5a8c6cded0d252d24c8","regNo":"ERD00171","company":"KINGSLY INSTRUMENTATION AND COMMUNICATION PRIVATE LIMITED","origin":"national"},{"id":"6a9b953ec6cded0d252d2493","regNo":"ERD00181","company":"Star Wire India Ltd","origin":"national"},{"id":"6a9b8efdc6cded0d252d247b","regNo":"","company":"VEER O METALS PVT LTD","origin":"national"},{"id":"6a9af050c6cded0d252d242e","regNo":"","company":"Unimech Aerospace and Manufacturing Limited","origin":"national"},{"id":"6a9ae180c6cded0d252d241b","regNo":"ERD00196","company":"XTRAGEN TECHNOLOGIES PRIVATE LIMITED","origin":"national"},{"id":"6a9ad99ac6cded0d252d2403","regNo":"ERD00168","company":"DCM SHRIRAM INTERNATIONAL LTD","origin":"national"},{"id":"6a9ad930c6cded0d252d23ff","regNo":"ERD00169","company":"ADD Engineering Components India Pvt Ltd","origin":"national"},{"id":"6a9ac35ac6cded0d252d23e0","regNo":"","company":"Aerometals India Pvt Ltd","origin":"national"},{"id":"6a9aba29c6cded0d252d23cc","regNo":"ERD00167","company":"JR UAV Limited","origin":"national"},{"id":"6a9ab8e0c6cded0d252d23c2","regNo":"ERD00185","company":"AA Enterprises","origin":"national"},{"id":"6a9ab6e2c6cded0d252d23b6","regNo":"","company":"Green Aero Propulsion Pvt Ltd","origin":"national"},{"id":"6a9ab1d9c6cded0d252d2399","regNo":"ERD00190","company":"Aequs Limited","origin":"national"},{"id":"6a9aad0cc6cded0d252d237b","regNo":"","company":"NAABHYA INTERCONECT LLP","origin":"national"},{"id":"6a9aa75fc6cded0d252d2369","regNo":"ERD00170","company":"Universal Precision Screws","origin":"national"},{"id":"6a9aa742c6cded0d252d2368","regNo":"","company":"Kusumgar Limited","origin":"national"},{"id":"6a9aa011c6cded0d252d2330","regNo":"ERD00163","company":"MICROPACK PVT LTD","origin":"national"},{"id":"6a9a9ce3c6cded0d252d231d","regNo":"ERD00160","company":"Magod Laser Machining Pvt Ltd","origin":"national"},{"id":"6a9a9b48c6cded0d252d2315","regNo":"ERD00159","company":"EVONIK INDIA PRIVATE LIMITED","origin":"national"},{"id":"6a9a95bbc6cded0d252d22ef","regNo":"ERD00162","company":"Anant Defence Systems Pvt Ltd","origin":"national"},{"id":"6a9a876ac6cded0d252d228a","regNo":"","company":"ererer","origin":"national"},{"id":"6a9a8563c6cded0d252d227e","regNo":"ERD00151","company":"ANANYA CABLE TECH PRIVATE LIMITED","origin":"national"},{"id":"6a9a8270c6cded0d252d2264","regNo":"ERD00166","company":"ELASTOMERIC ENGINEERS","origin":"national"},{"id":"6a9a7f9ac6cded0d252d2257","regNo":"ERD00198","company":"Oriental Weaving & Processing Mills Pvt Ltd","origin":"national"},{"id":"6a9a7a7dc6cded0d252d222e","regNo":"ERD00141","company":"Tychon Global Systems Private Limited","origin":"national"},{"id":"6a9a782ec6cded0d252d221d","regNo":"ERD00139","company":"Accurate Gauging and Instruments Pvt Ltd","origin":"national"},{"id":"6a9a75edc6cded0d252d220a","regNo":"ERD00140","company":"Dilabs Systems Private Limited","origin":"national"},{"id":"6a9a7526c6cded0d252d2200","regNo":"","company":"Scorpio Events Management Pvt Ltd","origin":"national"},{"id":"6a9a71ccc6cded0d252d21ef","regNo":"ERD00161","company":"Raphe mPhibr Private Limited","origin":"national"},{"id":"6a9a6a3cc6cded0d252d2199","regNo":"ERD00156","company":"AeroCision Aerocomp India Private Limited","origin":"national"},{"id":"6a9a6808c6cded0d252d2182","regNo":"ERD00131","company":"Datasol Bangalore Limited","origin":"national"},{"id":"6a9a639ec6cded0d252d215a","regNo":"","company":"AADHYA SMARTECH PVT. LTD","origin":"national"},{"id":"6a9a61d0c6cded0d252d214a","regNo":"ERD00126","company":"ONYX ROBOTIC AND AUTOMATION PRIVATE LIMITED","origin":"national"},{"id":"6a9a5d16c6cded0d252d2124","regNo":"","company":"MPS Precision Engineering","origin":"national"},{"id":"6a9d0999c6cded0d252d2670","regNo":"ERI00008","company":"MBDA","origin":"international"},{"id":"6a999351c6cded0d252d1ee4","regNo":"ERI00004","company":"DASSAULT AVIATION","origin":"international"},{"id":"6a994916669185041b5fd2d7","regNo":"","company":"ALRO S.A.","origin":"international"},{"id":"6a9946d0669185041b5fd2b3","regNo":"ERI00012","company":"LEACH INTERNATIONAL EUROPE SAS","origin":"international"},{"id":"6a9934ad669185041b5fd14d","regNo":"ERI00003","company":"AVIAZAPCHAST PLC","origin":"international"},{"id":"6a99323e669185041b5fd11c","regNo":"ERI00007","company":"ECM EXPO&Conference Mgmt GmbH","origin":"international"},{"id":"6a9931d6669185041b5fd118","regNo":"ERI00005","company":"Saab","origin":"international"},{"id":"6a992ececfd3fd5caada3333","regNo":"ERI00011","company":"2Heads Global Design Ltd","origin":"international"}];

/* ---------------- demo book of other exhibitors' applications ---------------- */
const SB_DEMO_KEY = 'evenuefy_sbd_reservations_v2';   // DEO's actions on demo rows + rows DEO reserved for demo companies
function sbDemoStore() { try { return JSON.parse(localStorage.getItem(SB_DEMO_KEY)) || {}; } catch (e) { return {}; } }
function sbDemoSave(store) { try { localStorage.setItem(SB_DEMO_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
function sbDemoPatch(id, patch) { const st = sbDemoStore(); st[id] = Object.assign(st[id] || {}, patch); sbDemoSave(st); }
function sbDemoCreate(rec) { const st = sbDemoStore(); (st.__created = st.__created || []).push(rec); sbDemoSave(st); }

function sbHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function sbDaysAgo(n, seed) { const d = new Date(); d.setHours(9 + (seed % 9), (seed * 7) % 60, 0, 0); d.setDate(d.getDate() - n); return d; }
const sbFmtDT = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const SB_ONLINE = { national: ['Card', 'Net Banking', 'UPI'], international: ['International Card'] };
const SB_OFFLINE = { national: ['NEFT', 'RTGS', 'Cheque / DD'], international: ['SWIFT (Wire Transfer)'] };
const SB_HOLDING = ['reserved', 'payment_under_verification', 'confirmed'];

/* demo companies exclude the ones that have a portal login */
const SB_DEMO_POOL = SB_COMPANIES.filter((c) => !SB_EXHIBITORS.some((p) => p.company.toLowerCase().startsWith(c.company.toLowerCase()) || c.company.toLowerCase().startsWith(p.company.toLowerCase())));
/* stalls held by every exhibitor portal: { 'hall|stall': { company, regNo, status, res, seeded, profile } } */
function sbPortalHoldings(exclude) {
  const out = {};
  SB_EXHIBITORS.forEach((p) => {
    if (exclude && p.id === exclude.id) return;
    const st = sbPortalState(p);
    if (!st) return;
    ((st.spaceBooking && st.spaceBooking.reservations) || []).forEach((r) => {
      if (!SB_HOLDING.includes(r.status)) return;
      r.stalls.forEach((s) => { out[s.hall + '|' + s.name] = { company: p.company, regNo: p.regNo, status: r.status, res: r, profile: p }; });
    });
    (st.stalls || []).forEach((s) => { const key = sbStallKey(s); if (!out[key]) out[key] = { company: p.company, regNo: p.regNo, status: 'confirmed', seeded: true, profile: p }; });
  });
  return out;
}
/* taken: { 'hall|stall': true } — stalls held by exhibitor portals (never generated) */
function sbDemoBook(taken) {
  taken = Object.assign({}, taken || {});
  Object.keys(sbPortalHoldings()).forEach((k) => { taken[k] = true; });
  const out = [];
  const store = sbDemoStore();
  const now = Date.now();
  let k = 0;
  const mk = (st, h, seedBooked, seedCart) => {
    const r = (h >>> 4) % 10;
    const status = seedBooked ? 'confirmed' : seedCart ? 'reserved'
      : r < 2 ? 'reserved' : r === 2 ? 'payment_under_verification' : r === 3 ? 'expired' : 'confirmed';
    const age = status === 'reserved' ? 1 + (h % 18) : status === 'payment_under_verification' ? 4 + (h % 15) : status === 'expired' ? 24 + (h % 16) : 3 + (h % 27);
    const createdAt = sbDaysAgo(age, h);
    const company = SB_DEMO_POOL[(k * 7 + h % 5) % SB_DEMO_POOL.length];
    const origin = company.origin;
    const scheme = st.chalet ? (h % 2 ? 'chalet1' : 'chalet2') : (h % 3 === 0 ? 'raw' : 'shell');
    const stall = { hall: st.hall, name: st.name, sqm: st.sqm, size: st.size, scheme: scheme, sides: st.sides, design: st.design,
      mezzSqm: (!st.chalet && st.sqm > 100 && h % 4 === 0) ? 20 + (h % 35) : 0 };
    const mode = ((h >>> 7) % 10) < 7 ? 'online' : 'offline';
    const method = (mode === 'online' ? SB_ONLINE : SB_OFFLINE)[origin][h % (mode === 'online' ? SB_ONLINE : SB_OFFLINE)[origin].length];
    let payment = null, paidAt = null, pausedAt = null;
    if (status === 'confirmed') {
      let ago = age - 1 - ((h >>> 2) % Math.max(1, Math.min(age - 1, 12)));
      if (ago < 1) ago = 1 + ((h >>> 5) % 6);
      paidAt = sbDaysAgo(ago, h >>> 1);
      payment = { mode: mode, method: method, txn: 'TXN' + String(sbHash(st.name + 'p')).slice(0, 9), ref: mode === 'offline' ? 'UTR' + String(sbHash(st.name + 'u')).slice(0, 12) : '', verifiedBy: mode === 'offline' ? 'DEO Admin' : '' };
    } else if (status === 'payment_under_verification') {
      const m = SB_OFFLINE[origin][h % SB_OFFLINE[origin].length];
      const sub = sbDaysAgo(Math.max(1, age - 2 - (h % 3)), h >>> 3);
      payment = { mode: 'offline', method: m, ref: 'UTR' + String(sbHash(st.name + 'u')).slice(0, 12), date: sub.toISOString().slice(0, 10), amount: 0,
        fileName: 'payment-advice-' + st.name.toLowerCase().replace('.', '-') + '.pdf', submittedAt: sbFmtDT(sub), submittedAtIso: sub.toISOString() };
      pausedAt = sub.toISOString();
    }
    const b = { id: 'sbd_' + st.name, no: '#' + String(40000000 + (h % 59999999)), piNo: 'PI-AI27-' + String(1000 + (h % 8999)), company: company.company, regNo: company.regNo || '',
      origin: origin, exId: company.id, source: 'demo', type: st.chalet ? 'Chalet' : 'Pre-defined Space', stalls: [stall], status: status,
      createdAt: createdAt, createdAtIso: createdAt.toISOString(), holdUntil: sbpHoldUntil(createdAt.getTime()), pausedAt: pausedAt, extensions: [], payment: payment,
      paidAt: paidAt, paidAtIso: paidAt ? paidAt.toISOString() : '', orderNo: status === 'confirmed' ? 'ORD-2027-' + String(1000 + (h % 8999)) : '', remark: '', audit: [] };
    if (status === 'confirmed') b.allotment = { at: sbFmtDT(paidAt), by: 'System (auto-allotment)', company: company.company };
    if (status === 'expired') b.expiredAt = sbFmtDT(new Date(b.holdUntil));
    out.push(b);
    k++;
  };
  SB_HALLS.forEach((hall, hi) => hall.stalls.forEach((st, i) => {
    const n = i + 1;
    const h = sbHash('sbd' + st.name);
    const seedBooked = (n + hi) % 4 === 0;                       // stalls the layout has always shown as allotted
    const seedCart = !seedBooked && (n * 3 + hi) % 7 === 0;      // …and as blocked in another exhibitor's cart
    if (taken[hall.id + '|' + st.name] || !(seedBooked || seedCart || h % 10 < 6)) return;
    mk(st, h, seedBooked, seedCart);
  }));
  SB_CHALET.stalls.forEach((st, i) => {
    const n = i + 1;
    const h = sbHash('sbd' + st.name);
    if (taken['CH|' + st.name] || !(n % 4 === 0 || n === 7 || h % 10 < 6)) return;
    mk(st, h, n % 4 === 0, n === 7);
  });
  /* rows DEO reserved for demo companies from the admin */
  (store.__created || []).forEach((rec) => {
    if (taken[rec.stalls[0].hall + '|' + rec.stalls[0].name]) return;
    const b = JSON.parse(JSON.stringify(rec));
    b.createdAt = new Date(b.createdAtIso); b.paidAt = b.paidAtIso ? new Date(b.paidAtIso) : null; b.source = 'demo';
    out.push(b);
  });
  /* DEO's overrides (extend / verify / reject / release / shift / simulate expiry) */
  out.forEach((b) => {
    const d = store[b.id];
    if (d) { Object.assign(b, d); if (d.paidAtIso) b.paidAt = new Date(d.paidAtIso); }
    if (b.status === 'reserved' && new Date(b.holdUntil).getTime() < now) { b.status = 'expired'; b.expiredAt = sbFmtDT(new Date(b.holdUntil)); }
  });
  /* pricing: current rate card, registration credit once per company on its earliest live application */
  const firstLive = {};
  out.slice().sort((a, b) => a.createdAt - b.createdAt).forEach((b) => { if (SB_HOLDING.includes(b.status) && !firstLive[b.company]) firstLive[b.company] = b.id; });
  out.forEach((b) => {
    b.pricing = sbpPrice(b.stalls, { currency: b.origin === 'international' ? 'USD' : 'INR', withCredit: firstLive[b.company] === b.id });
    b.amount = b.pricing.payable; b.total = b.pricing.payable; b.value = b.pricing.grand;
    if (b.payment && !b.payment.amount) b.payment.amount = b.amount;
  });
  /* later demo rows must not double-book a stall an earlier one holds */
  const seen = {};
  return out.filter((b) => {
    const key = b.stalls[0].hall + '|' + b.stalls[0].name;
    if (!SB_HOLDING.includes(b.status)) return true;
    if (seen[key]) return false;
    seen[key] = true; return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

/* ---------------- occupancy map for the layout ----------------
   live: the logged-in exhibitor's applications · seeded: its pre-allotted
   S.stalls · self: its profile (null in the admin) · other exhibitor
   portals and the demo book are merged in, so no stall can be in two carts.
   returns { 'hall|stall': { kind: 'allotted'|'cart', company, piNo, status, mine, res } } */
function sbInventory(live, seeded, self) {
  const map = {};
  const taken = {};
  const me = self ? self.company : SB_LIVE_COMPANY;
  (live || []).forEach((r) => {
    if (!SB_HOLDING.includes(r.status)) return;
    r.stalls.forEach((s) => { const key = s.hall + '|' + s.name; taken[key] = true;
      map[key] = { kind: r.status === 'confirmed' ? 'allotted' : 'cart', company: me, piNo: r.piNo, status: r.status, mine: true, res: r }; });
  });
  (seeded || []).forEach((st) => {
    const key = sbStallKey(st);
    taken[key] = true;
    if (!map[key]) map[key] = { kind: 'allotted', company: me, status: 'confirmed', mine: true, seeded: true };
  });
  const others = sbPortalHoldings(self);
  Object.keys(others).forEach((key) => {
    const o = others[key];
    taken[key] = true;
    if (!map[key]) map[key] = { kind: o.status === 'confirmed' ? 'allotted' : 'cart', company: o.company, piNo: o.res ? o.res.piNo : '', status: o.status, mine: false, portal: o.profile };
  });
  sbDemoBook(taken).forEach((b) => {
    if (!SB_HOLDING.includes(b.status)) return;
    const key = b.stalls[0].hall + '|' + b.stalls[0].name;
    if (!map[key]) map[key] = { kind: b.status === 'confirmed' ? 'allotted' : 'cart', company: b.company, piNo: b.piNo, status: b.status, mine: false, demo: b };
  });
  return map;
}
