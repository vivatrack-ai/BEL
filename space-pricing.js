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
/* whole days left on the clock (0 = expires today, negative = past) —
   a cart created today with 21-day validity shows "21 days left" */
function sbpDaysLeft(iso, nowMs) {
  return Math.floor((new Date(iso).getTime() - (nowMs || Date.now())) / 864e5);
}

/* ---- Proforma invoice (shared by the exhibitor portal and the admin) ----
   Generated at cart creation; downloadable while the cart is valid,
   under verification and after confirmation (for records). Carries
   DEO's bank details for NEFT / RTGS / SWIFT. Not a tax invoice. */
const DEO_BANK = {
  beneficiary: 'Defence Exhibition Organisation (DEO)',
  bank: 'State Bank of India', branch: 'DRDO Bhawan Branch, Rajaji Marg, New Delhi – 110011',
  account: '40123456789', ifsc: 'SBIN0001234', swift: 'SBININBB104', accountType: 'Current',
  pan: 'AAAGD0123F', gstin: '07AAAGD0123F1Z5',
};
/* r: { piNo, no, type, stalls, pricing, createdAt (text), holdUntil (ISO), status, paidAt (text) }
   who: { billedTo, country, eventName, eventDates } */
function sbpProformaHtml(r, who) {
  const p = r.pricing || { lines: [], base: r.amount, side: 0, subtotal: r.amount, gst: 0, grand: r.amount, credit: 0, payable: r.amount };
  const zone = (h) => (h === 'CH' ? 'Chalet Line 1' : 'Hall ' + h);
  const scheme = { shell: 'Shell Space', raw: 'Raw Space', chalet1: 'Chalet · 1 Floor', chalet2: 'Chalet · 2 Floor' };
  const stamp = r.status === 'confirmed' ? '<span class="stamp">PAID · ' + esc(r.paidAt || '') + '</span>'
    : r.status === 'payment_under_verification' ? '<span class="stamp blue">PAYMENT UNDER VERIFICATION</span>'
    : r.status === 'expired' ? '<span class="stamp red">EXPIRED</span>'
    : r.status === 'released' ? '<span class="stamp red">RELEASED</span>'
    : '<span class="stamp amber">VALID TILL ' + esc(sbpDate(r.holdUntil).toUpperCase()) + '</span>';
  const lines = r.stalls.map((s, i) => {
    const l = p.lines[i] || { base: s.price, side: 0, sidePct: 0 };
    return '<tr><td>' + esc(s.name) + '<br><span class="muted">' + esc(zone(s.hall)) + ' · ' + esc(scheme[s.scheme] || s.scheme) + ' · ' + s.sqm + ' sq.m (' + esc(s.size) + ') · ' + esc(s.sides || '1 Side') + ' open</span></td>' +
      '<td class="right">' + money(l.base) + '</td></tr>' +
      (l.side ? '<tr><td class="sub">Corner / open-side charges — ' + esc(s.name) + ' (' + Math.round(l.sidePct * 100) + '% of base)</td><td class="right">' + money(l.side) + '</td></tr>' : '');
  }).join('');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(r.piNo) + '</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#212B36;margin:0;padding:40px;font-size:14px}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2F62D8;padding-bottom:16px}' +
    '.logo{font-size:26px;font-weight:800;color:#2F62D8}' +
    'h1{font-size:20px;margin:0;text-align:right}.muted{color:#6B7686;font-size:12px}' +
    '.grid{display:flex;justify-content:space-between;margin:24px 0;gap:24px}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px}' +
    'th{background:#F1F4F9;text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}' +
    'td{padding:9px 12px;border-bottom:1px solid #E6EAF2;vertical-align:top}td.sub{color:#6B7686;font-size:12px;padding-left:28px}' +
    'tr.tot td{font-weight:700;border-bottom:none;padding:5px 12px}tr.total td{font-weight:800;font-size:16px;border-top:2px solid #212B36;border-bottom:none;padding-top:10px}' +
    '.right{text-align:right}.stamp{display:inline-block;margin-top:8px;padding:4px 14px;border:2px solid #1E8E5A;color:#1E8E5A;font-weight:800;border-radius:6px;transform:rotate(-4deg)}' +
    '.stamp.amber{border-color:#B97A0F;color:#B97A0F}.stamp.blue{border-color:#2F62D8;color:#2F62D8}.stamp.red{border-color:#C6432E;color:#C6432E}' +
    '.bank{margin-top:28px;border:1px solid #E6EAF2;border-radius:10px;padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px}' +
    '.bank h3{grid-column:1/-1;margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#2F62D8}.bank b{display:inline-block;min-width:150px;color:#6B7686;font-weight:600}' +
    '.terms{margin-top:22px;font-size:12px;color:#4A5568}.terms li{margin:3px 0}' +
    '.foot{margin-top:28px;font-size:11px;color:#6B7686;border-top:1px solid #E6EAF2;padding-top:12px}' +
    '.noprint{margin-top:24px}@media print{.noprint{display:none}}' +
    '</style></head><body>' +
    '<div class="top"><div><div class="logo">evenuefy</div><div class="muted">' + esc(who.eventName) + ' · ' + esc(who.eventDates) + '<br>Organiser: Defence Exhibition Organisation (DEO), Ministry of Defence</div></div>' +
    '<div><h1>PROFORMA INVOICE</h1><div class="muted right">PI No: <b>' + esc(r.piNo) + '</b><br>Cart created: ' + esc(r.createdAt) + '<br>Valid till: <b>' + esc(sbpDate(r.holdUntil)) + '</b> (' + SBP_HOLD_DAYS + ' days)</div></div></div>' +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(who.billedTo) + '</b><br>' + esc(who.country) + '<br><span class="muted">Reservation ' + esc(r.no) + ' · ' + esc(r.type) + '</span></div>' +
    '<div class="right"><div class="muted">STATUS</div>' + stamp + '</div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount (INR)</th></tr>' + lines +
    '<tr class="tot"><td class="right">Subtotal</td><td class="right">' + money(p.subtotal) + '</td></tr>' +
    '<tr class="tot"><td class="right">GST @ 18%</td><td class="right">' + money(p.gst) + '</td></tr>' +
    '<tr class="tot"><td class="right">Grand Total</td><td class="right">' + money(p.grand) + '</td></tr>' +
    (p.credit ? '<tr class="tot"><td class="right">Less: Registration amount already paid (adjusted)</td><td class="right">− ' + money(p.credit) + '</td></tr>' : '') +
    '<tr class="total"><td class="right">Net Payable (100% within validity)</td><td class="right">' + money(p.payable) + '</td></tr></table>' +
    '<div class="bank"><h3>Remit to — DEO bank details (NEFT / RTGS / SWIFT)</h3>' +
      '<div><b>Beneficiary</b>' + esc(DEO_BANK.beneficiary) + '</div><div><b>Bank</b>' + esc(DEO_BANK.bank) + '</div>' +
      '<div><b>Account No.</b>' + esc(DEO_BANK.account) + ' (' + esc(DEO_BANK.accountType) + ')</div><div><b>Branch</b>' + esc(DEO_BANK.branch) + '</div>' +
      '<div><b>IFSC</b>' + esc(DEO_BANK.ifsc) + '</div><div><b>SWIFT (international)</b>' + esc(DEO_BANK.swift) + '</div>' +
      '<div><b>PAN</b>' + esc(DEO_BANK.pan) + '</div><div><b>GSTIN</b>' + esc(DEO_BANK.gstin) + '</div>' +
      '<div style="grid-column:1/-1"><b>Payment reference</b>Quote <b>' + esc(r.piNo) + '</b> in the remittance narration. Cheque / DD in favour of “' + esc(DEO_BANK.beneficiary) + '”, payable at New Delhi.</div></div>' +
    '<ul class="terms">' +
      '<li>The stalls listed above are held in your cart till <b>' + esc(sbpDate(r.holdUntil)) + '</b>. 100% of the Net Payable must reach DEO’s account within this period; part payments are not accepted.</li>' +
      '<li>Payment may be made online through the exhibitor portal or offline by NEFT / RTGS / Cheque / DD / SWIFT. For offline payments, upload the proof in the portal — the validity clock pauses until DEO verifies the receipt.</li>' +
      '<li>If the amount is not received within the validity period the reservation expires and the stalls are released. DEO may extend validity case by case before expiry.</li>' +
      '<li>A tax invoice is issued on confirmation of payment.</li></ul>' +
    '<div class="foot"><b>This is a proforma invoice — not a tax invoice.</b> Computer-generated for the organiser · ' + esc(who.eventName) + ' · ' + esc(r.piNo) + '.</div>' +
    '<div class="noprint"><button onclick="window.print()" style="background:#2F62D8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>' +
    '</body></html>';
  return html;
}
function sbpOpenProforma(r, who) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the proforma invoice.', 'error'); return; }
  w.document.write(sbpProformaHtml(r, who));
  w.document.close();
}

