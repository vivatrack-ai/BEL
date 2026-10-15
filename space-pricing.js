/* ============================================================
   Space Booking — order pricing shared by the exhibitor cart and
   the admin Space Reservations drawer. One place decides every
   rupee of a reservation:

     Base Price (stall / chalet rate)
   + Corner / Open-Side Charges (preferential location, % of base)
   = Subtotal
   + GST 18%
   = Grand Total
   − Registration Amount already paid (adjusted once per exhibitor,
     on its earliest live reservation)
   = Net Payable  → ONE payment, 100% within the 21-day validity
   ============================================================ */

'use strict';

const SBP_GST = 0.18;
const SBP_REG_FEE = 40000;                                   // exhibitor registration (excl. GST)
const SBP_REG_TOTAL = Math.round(SBP_REG_FEE * (1 + SBP_GST)); // ₹47,200 paid at registration
const SBP_SIDE_PCT = { '1 Side': 0, '2 Sides': 0.10, '3 Sides': 0.15, '4 Sides': 0.20 };
const SBP_HOLD_DAYS = 21;                                    // cart validity (AERO-245)

/* Corner charge applies to hall stalls only — a chalet is a standalone
   structure priced flat, so its 4 open sides carry no premium. */
function sbpSidePct(st) {
  if (st.hall === 'CH' || st.chalet) return 0;
  return SBP_SIDE_PCT[st.sides] || 0;
}

/* stalls: [{ name, hall, price, sides, ... }] · withCredit: apply the
   registration amount to this reservation */
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
  return { lines: lines, base: base, side: side, subtotal: subtotal, gst: gst, grand: grand,
    credit: credit, payable: grand - credit };
}

/* ---- validity clock helpers (shared by exhibitor + admin) ----
   holdUntil = creation date + 21 days, 23:59:59 IST. */
const SBP_IST_MS = 5.5 * 3600e3;
function sbpHoldUntil(fromMs, days) {
  const ist = new Date(fromMs + SBP_IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days, 23, 59, 59) - SBP_IST_MS).toISOString();
}
/* 'YYYY-MM-DD' (date input) → 23:59:59 IST of that day, ISO */
function sbpEndOfDayIst(ymd) {
  const p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2], 23, 59, 59) - SBP_IST_MS).toISOString();
}
const sbpDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const sbpDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';
/* whole days left on the clock (0 = expires today, negative = past) */
function sbpDaysLeft(iso, nowMs) {
  return Math.ceil((new Date(iso).getTime() - (nowMs || Date.now())) / 864e5);
}
