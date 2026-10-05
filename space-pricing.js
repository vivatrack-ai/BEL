/* ============================================================
   Space Booking — order pricing used by the admin Space
   Applications drawer. One place decides every rupee of a booking:

     Base Price (stall / chalet rate)
   + Corner / Open-Side Charges (preferential location, % of base)
   = Subtotal
   + GST 18%
   = Grand Total  → split into Slab 1 25% · Slab 2 50% · Slab 3 25%
   − Registration Amount already paid (adjusted from Slab 1 onwards,
     once per exhibitor — on its earliest live application)
   = Net Payable
   ============================================================ */

'use strict';

const SBP_GST = 0.18;
const SBP_REG_FEE = 40000;                                   // exhibitor registration (excl. GST)
const SBP_REG_TOTAL = Math.round(SBP_REG_FEE * (1 + SBP_GST)); // ₹47,200 paid at registration
const SBP_SIDE_PCT = { '1 Side': 0, '2 Sides': 0.10, '3 Sides': 0.15, '4 Sides': 0.20 };
const SBP_SLABS = [
  ['Slab 1 — 25% Advance', 0.25, '15 Oct 2026'],
  ['Slab 2 — 50%', 0.5, '15 Dec 2026'],
  ['Slab 3 — 25% Balance', 0.25, '15 Jan 2027'],
];

/* Corner charge applies to hall stalls only — a chalet is a standalone
   structure priced flat, so its 4 open sides carry no premium. */
function sbpSidePct(st) {
  if (st.hall === 'CH' || st.chalet) return 0;
  return SBP_SIDE_PCT[st.sides] || 0;
}

/* stalls: [{ name, hall, price, sides, ... }] · withCredit: apply the
   registration amount to this order */
function sbpPrice(stalls, withCredit) {
  const lines = stalls.map((st) => {
    const pct = sbpSidePct(st);
    return { name: st.name, hall: st.hall, base: st.price, sides: st.sides || '1 Side', sidePct: pct, side: Math.round(st.price * pct) };
  });
  const base = lines.reduce((a, l) => a + l.base, 0);
  const side = lines.reduce((a, l) => a + l.side, 0);
  const subtotal = base + side;
  const gst = Math.round(subtotal * SBP_GST);
  const grand = subtotal + gst;
  const credit = withCredit ? Math.min(SBP_REG_TOTAL, grand) : 0;

  let left = credit;
  let allocated = 0;
  const slabs = SBP_SLABS.map(([label, pct, due], i) => {
    // last slab absorbs rounding so the slabs always add up to the grand total
    const gross = i === SBP_SLABS.length - 1 ? grand - allocated : Math.round(grand * pct);
    allocated += gross;
    const adj = Math.min(left, gross);
    left -= adj;
    return { label: label, pct: pct, due: due, gross: gross, credit: adj, amount: gross - adj };
  });
  return { lines: lines, base: base, side: side, subtotal: subtotal, gst: gst, grand: grand,
    credit: credit, payable: grand - credit, slabs: slabs };
}
