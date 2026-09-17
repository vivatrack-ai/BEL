/* ============================================================
   API / Data layer.

   EVERY data operation the UI needs goes through this file and
   every function is async. Today it is backed by localStorage
   (same keys as the vanilla build, so existing test data keeps
   working). To go live, replace ONLY the bodies of these
   functions with real HTTP calls — suggested endpoints are noted
   on each function. No component needs to change.
   ============================================================ */

import { EVENT, nowStr, aircraftPrice, acftParticipant } from '../lib.js';
import ADMIN_DATA from '../data/report-data.js';

export const LS_KEY = 'evenuefy_coex_module_v1';        // exhibitor portal state
export const ADMIN_LS_KEY = 'evenuefy_admin_spacereq_v4'; // admin portal state

/* ---------------- seeds & persistence ---------------- */
const SEED = {
  seq: { coex: 0, pass: 0, alloc: 0, quota: 0, cart: 0, invite: 0, sreq: 0, acft: 0 },
  spaceRequirements: [
    { id: 'sreq_reg1', setupType: 'Raw', sqm: 100, floors: null, openSides: 'One Side', source: 'registration', submittedAt: '20 Aug 2026' },
    { id: 'sreq_reg2', setupType: 'Outdoor Space', sqm: 200, floors: null, openSides: null, source: 'registration', submittedAt: '20 Aug 2026' },
  ],
  srRegSeeded: true,
  stalls: [
    { id: 'st1', hall: 'Hall A', stall: 'A8.5', area: 110 },
    { id: 'st2', hall: 'Hall 2', stall: 'C-25', area: 36 },
  ],
  categories: [
    { id: 'cat_exh', kind: 'badge', name: 'Exhibitor', free: 6, paid: 0 },
    { id: 'cat_staff', kind: 'badge', name: 'Exhibitor Support Staff', free: 3, paid: 0 },
    { id: 'cat_addl', kind: 'badge', name: 'Additional Exhibitor Badges', free: 0, paid: 5 },
    { id: 'cat_contr', kind: 'badge', name: 'Exhibitor - Contractor Badges', free: 100, paid: 0 },
    { id: 'cat_invitee', kind: 'invitee', name: 'Exhibitor Invitee', free: 30, paid: 0 },
    { id: 'cat_veh', kind: 'vehicle', name: 'Vehicle Pass', free: 2, paid: 0 },
    { id: 'cat_veh12', kind: 'vehicle', name: 'Vehicle Pass (Above 12 Seater)', free: 0, paid: 2 },
  ],
  coexhibitors: [],
  allocations: [],
  quotas: [],
  passes: [],
  invites: [],
  cart: [],
  aircraft: [],
  acftDrafts: {},
};

function readState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // migrations (same as vanilla build)
      if (!s.spaceRequirements) s.spaceRequirements = [];
      if (!s.seq.sreq) s.seq.sreq = 0;
      if (!s.seq.acft) s.seq.acft = 0;
      if (!s.aircraft) s.aircraft = [];
      if (!s.acftDrafts) s.acftDrafts = {};
      if (!s.srRegSeeded) {
        SEED.spaceRequirements.forEach((r) => {
          if (!s.spaceRequirements.some((x) => x.id === r.id)) s.spaceRequirements.unshift(JSON.parse(JSON.stringify(r)));
        });
        s.srRegSeeded = true;
      }
      s.spaceRequirements.forEach((r) => {
        if (!r.source) r.source = 'exhibitor-portal';
        if (r.setupType === 'Chalet') r.sqm = null;
      });
      s.aircraft.forEach((a) => { if (!a.status || a.status === 'payment_pending') a.status = 'draft'; });
      return s;
    }
  } catch (e) { /* storage unavailable */ }
  return JSON.parse(JSON.stringify(SEED));
}

function writeState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* in-memory */ }
  return s;
}

function uid(s, k) { s.seq[k] += 1; return k + '_' + s.seq[k]; }

/* Small helper: run a mutation against the current state and persist. */
async function mutate(fn) {
  const s = readState();
  const result = fn(s);
  writeState(s);
  return result;
}

/* ============================================================
   EXHIBITOR API
   ============================================================ */
export const exhibitorApi = {
  /* GET /api/exhibitor/portal-state (or one GET per resource) */
  async getState() { return readState(); },

  async reset() { writeState(JSON.parse(JSON.stringify(SEED))); },

  /* ---------- Co-Exhibitors ---------- */
  /* POST /api/co-exhibitors */
  async addCoExhibitor(data) {
    return mutate((s) => {
      const id = uid(s, 'coex');
      const coex = { id, ...data, createdAt: nowStr() };
      if (data.type === 'separate') {
        coex.regNo = 'COEX-2027-' + String(s.seq.coex).padStart(4, '0');
        coex.status = 'payment_pending';
        s.cart.push({
          id: uid(s, 'cart'), type: 'coex_reg', refId: id,
          label: 'Co-Exhibitor Registration — ' + data.company,
          sub: 'Reg. No. ' + coex.regNo + ' · incl. GST', amount: EVENT.coexRegFee,
        });
      } else {
        coex.regNo = '';
        coex.status = 'active';
      }
      s.coexhibitors.push(coex);
      return coex;
    });
  },
  /* DELETE /api/co-exhibitors/:id */
  async deleteCoExhibitor(id) {
    return mutate((s) => {
      s.coexhibitors = s.coexhibitors.filter((c) => c.id !== id);
      s.cart = s.cart.filter((i) => !(i.type === 'coex_reg' && i.refId === id));
    });
  },

  /* ---------- Stall allocation ---------- */
  /* POST /api/stall-allocations  ·  PUT /api/stall-allocations/:id */
  async saveAllocation({ editId, coexId, stallId, sqm }) {
    return mutate((s) => {
      if (editId) {
        const a = s.allocations.find((x) => x.id === editId);
        Object.assign(a, { coexId, stallId, sqm });
      } else {
        s.allocations.push({ id: uid(s, 'alloc'), coexId, stallId, sqm });
      }
    });
  },
  /* DELETE /api/stall-allocations/:id */
  async removeAllocation(id) {
    return mutate((s) => { s.allocations = s.allocations.filter((a) => a.id !== id); });
  },

  /* ---------- Pass quotas ---------- */
  /* POST /api/pass-quotas */
  async assignQuota({ coexId, catId, qty }) {
    return mutate((s) => {
      const existing = s.quotas.find((q) => q.coexId === coexId && q.catId === catId);
      if (existing) existing.quota += qty;
      else s.quotas.push({ id: uid(s, 'quota'), coexId, catId, quota: qty });
    });
  },
  /* DELETE /api/pass-quotas/:id */
  async removeQuota(id) {
    return mutate((s) => { s.quotas = s.quotas.filter((q) => q.id !== id); });
  },

  /* ---------- Passes (badge / invitee / vehicle) ---------- */
  /* POST /api/passes */
  async addPass({ catId, coexId, data, amount = 0, status = 'issued', cartItem = null }) {
    return mutate((s) => {
      const id = uid(s, 'pass');
      s.passes.push({ id, catId, coexId: coexId || null, data, status, amount, createdAt: nowStr() });
      if (cartItem) s.cart.push({ id: uid(s, 'cart'), type: 'vehicle', refId: id, ...cartItem });
      return id;
    });
  },
  /* POST /api/pass-invites */
  async sendInvite({ catId, coexId, firstName, lastName, email }) {
    return mutate((s) => {
      s.invites.push({ id: uid(s, 'invite'), catId, coexId: coexId || null, firstName, lastName, email, sentAt: nowStr() });
    });
  },

  /* ---------- Space Requirement (single-save upsert) ---------- */
  /* PUT /api/space-requirements (bulk upsert) */
  async saveSpaceRequirements(staged) {
    return mutate((s) => {
      let added = 0, updated = 0, removed = 0;
      staged.forEach((row) => {
        const existing = s.spaceRequirements.find((r) => r.setupType === row.type);
        if (row.wanted) {
          if (existing) {
            const changed = existing.sqm !== row.sqm || existing.floors !== row.floors || existing.openSides !== row.openSides;
            if (changed) {
              Object.assign(existing, { sqm: row.sqm, floors: row.floors, openSides: row.openSides, modifiedAt: nowStr() });
              updated++;
            }
          } else {
            s.spaceRequirements.push({
              id: uid(s, 'sreq'), setupType: row.type, sqm: row.sqm, floors: row.floors,
              openSides: row.openSides, source: 'exhibitor-portal', submittedAt: nowStr(),
            });
            added++;
          }
        } else if (existing) {
          s.spaceRequirements = s.spaceRequirements.filter((r) => r.setupType !== row.type);
          removed++;
        }
      });
      return { added, updated, removed };
    });
  },

  /* ---------- Cart / payment ---------- */
  /* DELETE /api/cart/:id */
  async removeCartItem(id) {
    return mutate((s) => {
      const item = s.cart.find((i) => i.id === id);
      if (!item) return;
      if (item.type === 'vehicle') s.passes = s.passes.filter((p) => p.id !== item.refId);
      s.cart = s.cart.filter((i) => i.id !== id);
    });
  },
  /* POST /api/cart/checkout (payment gateway integration point) */
  async payCart() {
    return mutate((s) => {
      const paidCoex = [];
      s.cart.forEach((i) => {
        if (i.type === 'coex_reg') {
          const c = s.coexhibitors.find((x) => x.id === i.refId);
          if (c) { c.status = 'active'; paidCoex.push({ email: c.email, company: c.company }); }
        } else if (i.type === 'vehicle') {
          const p = s.passes.find((x) => x.id === i.refId);
          if (p) p.status = 'issued';
        } else if (i.type === 'aircraft_reg') {
          const a = s.aircraft.find((x) => x.id === i.refId);
          if (a) { a.status = 'registered'; a.paidAt = nowStr(); }
        }
      });
      s.cart = [];
      return paidCoex;
    });
  },

  /* ---------- Aircraft applications ---------- */
  /* POST /api/aircraft-applications */
  async createAircraft(payload) {
    return mutate((s) => {
      const id = uid(s, 'acft');
      const a = {
        id, appNo: 'ACR-2027-' + String(s.seq.acft).padStart(4, '0'),
        ...payload, status: 'draft', air7a: null, air4: null, air7b: null, createdAt: nowStr(),
      };
      s.aircraft.push(a);
      return a;
    });
  },
  /* PUT /api/aircraft-applications/:id */
  async updateAircraft(id, payload) {
    return mutate((s) => {
      const a = s.aircraft.find((x) => x.id === id);
      Object.assign(a, payload, { status: 'draft', remark: '' });
      return a;
    });
  },
  /* DELETE /api/aircraft-applications/:id */
  async deleteAircraft(id) {
    return mutate((s) => {
      s.aircraft = s.aircraft.filter((a) => a.id !== id);
      s.cart = s.cart.filter((i) => !(i.type === 'aircraft_reg' && i.refId === id));
    });
  },
  /* PUT /api/aircraft-applications/:id/air7a (same for air4 / air7b) */
  async saveAircraftForm(id, formKey, data) {
    return mutate((s) => {
      const a = s.aircraft.find((x) => x.id === id);
      a[formKey] = { ...data, savedAt: nowStr() };
      return a;
    });
  },
  /* POST /api/aircraft-applications/:id/submit — auto after all 4 steps */
  async submitAircraftIfComplete(id) {
    return mutate((s) => {
      const a = s.aircraft.find((x) => x.id === id);
      if (a.air7a && a.air4 && a.air7b && (a.status === 'draft' || a.status === 'rejected')) {
        a.status = 'submitted';
        a.submittedForApprovalAt = nowStr();
        a.remark = '';
        return true;
      }
      return false;
    });
  },
  /* Approved fees -> cart (server-side hook in production) */
  async syncApprovedFees() {
    return mutate((s) => {
      s.aircraft.forEach((a) => {
        if (a.status === 'approved') {
          if (a.price == null) a.status = 'registered';
          else if (!s.cart.some((i) => i.type === 'aircraft_reg' && i.refId === a.id)) {
            s.cart.push({
              id: uid(s, 'cart'), type: 'aircraft_reg', refId: a.id,
              label: 'Aircraft Registration — ' + a.model,
              sub: a.regNo + ' · approved by committee', amount: a.price, currency: a.feeCurrency,
            });
          }
        }
      });
    });
  },

  /* ---------- Aircraft form drafts (auto-save) ---------- */
  /* PUT /api/aircraft-drafts/:key */
  async saveDraft(key, data) { return mutate((s) => { s.acftDrafts[key] = data; }); },
  async clearDraft(key) { return mutate((s) => { delete s.acftDrafts[key]; }); },
};

/* ============================================================
   ADMIN API
   ============================================================ */
function readAdminState() {
  try {
    const raw = localStorage.getItem(ADMIN_LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.exhibitors && s.requirements) { if (!s.emailLog) s.emailLog = []; return s; }
    }
  } catch (e) { /* in-memory */ }
  return { exhibitors: ADMIN_DATA.exhibitors, requirements: ADMIN_DATA.requirements, emailLog: [] };
}
function writeAdminState(s) {
  try { localStorage.setItem(ADMIN_LS_KEY, JSON.stringify(s)); } catch (e) { /* in-memory */ }
}

export const adminApi = {
  /* GET /api/admin/space-requirements (exhibitors + requirement rows) */
  async getRequirements() { return readAdminState(); },

  async reset() {
    writeAdminState({ exhibitors: ADMIN_DATA.exhibitors, requirements: ADMIN_DATA.requirements, emailLog: [] });
  },

  /* POST /api/admin/bulk-email */
  async sendBulkEmail({ subject, recipients }) {
    const s = readAdminState();
    s.emailLog.unshift({ sentAt: nowStr(), subject, recipients, count: recipients.length });
    writeAdminState(s);
  },

  /* GET /api/admin/aircraft-applications */
  async getAircraftApplications() {
    const ex = readState();
    return ex.aircraft || [];
  },
  /* POST /api/admin/aircraft-applications/:id/approve */
  async approveAircraft(id) {
    return mutate((s) => {
      const a = s.aircraft.find((x) => x.id === id);
      if (a) { a.status = 'approved'; a.approvedAt = nowStr(); a.remark = ''; }
      return a;
    });
  },
  /* POST /api/admin/aircraft-applications/:id/reject */
  async rejectAircraft(id, remark) {
    return mutate((s) => {
      const a = s.aircraft.find((x) => x.id === id);
      if (a) { a.status = 'rejected'; a.remark = remark || 'Rejected by committee'; }
      return a;
    });
  },
};

/* Weight-based fee helper re-export for forms */
export { aircraftPrice, acftParticipant };
