/* Exhibitor portal store — thin wrapper over the API layer.
   Components read state with useExhibitorState() and mutate through
   `actions`; every action calls the API then refreshes the snapshot,
   so swapping the API to real HTTP changes nothing here or in the UI. */

import { useSyncExternalStore } from 'react';
import { exhibitorApi, LS_KEY } from '../services/api.js';

let state = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function refresh() {
  state = await exhibitorApi.getState();
  emit();
}
refresh();

// Live-refresh when the admin (another tab) approves/rejects
window.addEventListener('storage', (e) => { if (e.key === LS_KEY) refresh(); });

function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
export function useExhibitorState() {
  return useSyncExternalStore(subscribe, () => state);
}

/* every action: call API -> refresh snapshot -> return API result */
const act = (fn) => async (...args) => { const r = await fn(...args); await refresh(); return r; };

export const actions = {
  reset: act(exhibitorApi.reset),
  addCoExhibitor: act(exhibitorApi.addCoExhibitor),
  deleteCoExhibitor: act(exhibitorApi.deleteCoExhibitor),
  saveAllocation: act(exhibitorApi.saveAllocation),
  removeAllocation: act(exhibitorApi.removeAllocation),
  assignQuota: act(exhibitorApi.assignQuota),
  removeQuota: act(exhibitorApi.removeQuota),
  addPass: act(exhibitorApi.addPass),
  sendInvite: act(exhibitorApi.sendInvite),
  saveSpaceRequirements: act(exhibitorApi.saveSpaceRequirements),
  removeCartItem: act(exhibitorApi.removeCartItem),
  payCart: act(exhibitorApi.payCart),
  createAircraft: act(exhibitorApi.createAircraft),
  updateAircraft: act(exhibitorApi.updateAircraft),
  deleteAircraft: act(exhibitorApi.deleteAircraft),
  saveAircraftForm: act(exhibitorApi.saveAircraftForm),
  submitAircraftIfComplete: act(exhibitorApi.submitAircraftIfComplete),
  syncApprovedFees: act(exhibitorApi.syncApprovedFees),
  saveDraft: act(exhibitorApi.saveDraft),
  clearDraft: act(exhibitorApi.clearDraft),
};

/* ---------------- derived helpers (same math as vanilla build) ---------------- */
export const catTotal = (cat) => cat.free + cat.paid;
export const usedByExhibitor = (s, catId) => s.passes.filter((p) => p.catId === catId && !p.coexId).length;
export const allocatedToCoex = (s, catId) => s.quotas.filter((q) => q.catId === catId).reduce((a, q) => a + q.quota, 0);
export const exhibitorBalance = (s, catId) => {
  const c = s.categories.find((x) => x.id === catId);
  return catTotal(c) - usedByExhibitor(s, catId) - allocatedToCoex(s, catId);
};
export const quotaUsed = (s, coexId, catId) => s.passes.filter((p) => p.catId === catId && p.coexId === coexId).length;
export const quotaFor = (s, coexId, catId) => {
  const q = s.quotas.find((x) => x.coexId === coexId && x.catId === catId);
  return q ? q.quota : 0;
};
export const stallAvailable = (s, stallId, excludeAllocId) => {
  const st = s.stalls.find((x) => x.id === stallId);
  const used = s.allocations.filter((a) => a.stallId === stallId && a.id !== excludeAllocId).reduce((t, a) => t + a.sqm, 0);
  return st.area - used;
};
export const coexSqm = (s, coexId) => s.allocations.filter((a) => a.coexId === coexId).reduce((t, a) => t + a.sqm, 0);
export const quotaEligibleCoex = (s) => s.coexhibitors.filter((c) => c.type === 'separate' && c.status === 'active');
/* Stall space: only Separate co-exhibitors with completed registration payment */
export const stallEligibleCoex = (s) => s.coexhibitors.filter((c) => c.type === 'separate' && c.status === 'active');
export const catById = (s, id) => s.categories.find((c) => c.id === id);
export const coexById = (s, id) => s.coexhibitors.find((c) => c.id === id);
export const acftById = (s, id) => s.aircraft.find((a) => a.id === id);

/* Pass-context balance check (returns remaining, or -1 = blocked) */
export function passContextBalance(s, catId, coexId) {
  const cat = catById(s, catId);
  if (coexId) return quotaFor(s, coexId, catId) - quotaUsed(s, coexId, catId);
  const bal = exhibitorBalance(s, catId);
  if (bal <= 0 && cat.kind === 'vehicle') return 0; // paid vehicle passes always purchasable
  return bal;
}
