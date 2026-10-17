/* ============================================================
   Space Booking — pricing engine, booking rules & documents.
   Shared by the exhibitor portal and the admin (one place decides
   every rupee / dollar of a stall application).

   Rate card: Aero India 2027 Terms & Conditions, clause 5
   (aeroindia.gov.in/downloads/terms-and-condition.pdf):
     Indoor Raw   ₹43,000 / USD 950   per sq.m
     Indoor Shell ₹55,000 / USD 1,100 per sq.m
     Outdoor      ₹21,000 / USD 550   per sq.m
     Corner stall +3% of space rental per open side beyond the first
     Hospitality chalet (6m × 12m) single ₹31,00,000 / USD 61,000,
       double ₹62,00,000 / USD 1,22,000
     Registration fee ₹40,000 / USD 700 adjusted against space charges
     Minimum area 12 sq.m · GST 18% · 100% within 21 days of PI
   Mezzanine (meeting of 15 Oct 2026, AERO-3.9): stalls above 100 sq.m
     may build up to 50% of the allotted area at mezzanine level,
     ₹21,500 / USD 475 per sq.m, no corner premium on mezzanine.
   Everything below is editable from Admin → Space Booking
   Configuration (stored in localStorage, same origin for both apps).
   ============================================================ */

'use strict';

const SBP_CONFIG_KEY = 'evenuefy_space_config_v1';
const SBP_DEFAULTS = {
  gst: 0.18,
  holdDays: 21,
  minSqm: 12,
  rates: { raw: { inr: 43000, usd: 950 }, shell: { inr: 55000, usd: 1100 }, outdoor: { inr: 21000, usd: 550 } },
  chalet: { chalet1: { inr: 3100000, usd: 61000 }, chalet2: { inr: 6200000, usd: 122000 } },
  cornerPctPerSide: 0.03,
  mezz: { inr: 21500, usd: 475, minSqm: 100, maxPct: 0.5, schemes: ['raw', 'shell'] },
  regFee: { inr: 40000, usd: 700 },
  /* T&C clause 5(f): Startup Zone — concessional pod for Indian startups with valid DPIIT / Udyam certificate;
     clause 9(q): each pod holder gets 2 all-day passes + 2 single-entry one-day passes */
  startup: { podFee: 90000, podSqm: 6, passes: { allDay: 2, oneDay: 2, car: 0 } },
  usdRate: 88,                                          // DEO settlement rate, ₹ per USD
  allowInrSettlement: true,                             // USD-billed exhibitors may pay in INR at that rate
  passes: {
    allDayPer50: 3, oneDayPer4: 1, carPer50: 1,          // clause 9(q)/(r): per 50 sq.m blocks, 1 one-day pass per 4 sq.m
    mediaPartner: { fee: 1000000, sqm: 12, passes: 10 }, // clause 9(o): Associate Media Partner
    coex: { allDay: 2, oneDay: 2, car: 0 },               // co-exhibitor (per company, on top of the main exhibitor's)
    aggregator: { allDay: 2, oneDay: 2, car: 0 },         // aggregator company
  },
  emails: { reserved: true, reminders: true, verification: true, extension: true, expiry: true, allotment: true, shift: true },
};
function sbpConfig() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SBP_CONFIG_KEY)); } catch (e) { /* defaults */ }
  const d = JSON.parse(JSON.stringify(SBP_DEFAULTS));
  if (!saved) return d;
  const merge = (a, b) => { Object.keys(b || {}).forEach((k) => {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
    else a[k] = b[k];
  }); return a; };
  return merge(d, saved);
}
function sbpSaveConfig(cfg) { try { localStorage.setItem(SBP_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
function sbpResetConfig() { try { localStorage.removeItem(SBP_CONFIG_KEY); } catch (e) { /* ignore */ } }

const SBP_GST = 0.18;                                        // kept for older callers
const SBP_HOLD_DAYS = 21;                                    // kept for older callers (cfg.holdDays is authoritative)
const SBP_REG_TOTAL = Math.round(40000 * 1.18);
const sbpHoldDays = () => sbpConfig().holdDays;

/* ---------------- formatting ---------------- */
const sbpFmt = (n, cur) => (cur === 'USD' ? '$' + Number(n).toLocaleString('en-US') : '₹' + Number(n).toLocaleString('en-IN'));
const sbpRateKey = (cur) => (cur === 'USD' ? 'usd' : 'inr');
const sbpIsChalet = (st) => st.hall === 'CH' || st.chalet === true || /^chalet/.test(String(st.scheme));
const sbpIsPod = (st) => st.hall === 'SZ' || st.pod === true || st.scheme === 'pod';
const sbpSidesN = (st) => parseInt(st.sides, 10) || 1;

/* ---------------- mezzanine rules ---------------- */
function sbpMezzEligible(st, cfg) {
  cfg = cfg || sbpConfig();
  return !sbpIsChalet(st) && cfg.mezz.schemes.includes(st.scheme) && Number(st.sqm) > cfg.mezz.minSqm;
}
function sbpMezzMax(st, cfg) { cfg = cfg || sbpConfig(); return Math.floor(Number(st.sqm) * cfg.mezz.maxPct); }

/* ---------------- pricing engine ----------------
   stalls: [{ name, hall, sqm, scheme, sides, mezzSqm }]
   opts: { currency: 'INR' | 'USD', withCredit: bool }  (a boolean 2nd arg = withCredit, INR) */
function sbpPrice(stalls, opts) {
  const cfg = sbpConfig();
  if (typeof opts !== 'object' || opts === null) opts = { withCredit: !!opts };
  const cur = opts.currency === 'USD' ? 'USD' : 'INR';
  const k = sbpRateKey(cur);
  const lines = stalls.map((st) => {
    const chalet = sbpIsChalet(st);
    const pod = sbpIsPod(st);
    const rate = (chalet || pod) ? 0 : (cfg.rates[st.scheme] || cfg.rates.raw)[k];
    const base = pod ? cfg.startup.podFee : chalet ? cfg.chalet[st.scheme][k] : Math.round(Number(st.sqm) * rate);
    const sidePct = (chalet || pod) ? 0 : Math.max(0, sbpSidesN(st) - 1) * cfg.cornerPctPerSide;
    const side = Math.round(base * sidePct);
    const mezzSqm = sbpMezzEligible(st, cfg) ? Math.min(Math.max(0, Math.floor(Number(st.mezzSqm) || 0)), sbpMezzMax(st, cfg)) : 0;
    const mezzRate = cfg.mezz[k];
    const mezz = Math.round(mezzSqm * mezzRate);
    return { name: st.name, hall: st.hall, sqm: Number(st.sqm), scheme: st.scheme, sides: st.sides || '1 Side', chalet: chalet, pod: pod,
      rate: rate, base: base, sidePct: sidePct, side: side, mezzSqm: mezzSqm, mezzRate: mezzRate, mezz: mezz, total: base + side + mezz };
  });
  const base = lines.reduce((a, l) => a + l.base, 0);
  const side = lines.reduce((a, l) => a + l.side, 0);
  const mezz = lines.reduce((a, l) => a + l.mezz, 0);
  const subtotal = base + side + mezz;
  const gst = Math.round(subtotal * cfg.gst);
  const grand = subtotal + gst;
  const regFee = cfg.regFee[k];
  const regTotal = Math.round(regFee * (1 + cfg.gst));
  const credit = opts.withCredit ? Math.min(regTotal, grand) : 0;
  return { currency: cur, lines: lines, base: base, side: side, mezz: mezz, mezzSqm: lines.reduce((a, l) => a + l.mezzSqm, 0),
    subtotal: subtotal, gst: gst, gstPct: cfg.gst, grand: grand, credit: credit, payable: grand - credit };
}
/* base space rental of one stall for a scheme (price pickers) */
function sbpBaseFor(st, scheme, cur) { return sbpPrice([Object.assign({}, st, { scheme: scheme, mezzSqm: 0 })], { currency: cur }).base; }

/* ---------------- settlement of USD invoices in INR ----------------
   The invoice stays in the billing currency (USD); the exhibitor may pay
   the INR equivalent at DEO's settlement rate (T&C 9z: exchange-rate
   variation is borne by the participant). A payment record carries
   settleCurrency / fxRate / settleAmount next to the billed amount. */
const sbpFxRate = () => sbpConfig().usdRate;
const sbpInrSettlementAllowed = (cur) => cur === 'USD' && sbpConfig().allowInrSettlement !== false;
const sbpToInr = (usd, rate) => Math.round(usd * (rate || sbpFxRate()));
/* amount actually payable in the chosen settlement currency */
function sbpSettleAmount(amount, cur, settleCur, rate) {
  return cur === 'USD' && settleCur === 'INR' ? sbpToInr(amount, rate) : amount;
}
/* "Settled in INR ₹x at ₹88/$" for documents, tables and audit */
function sbpSettlementText(pm, cur) {
  if (!pm || cur !== 'USD' || pm.settleCurrency !== 'INR') return '';
  return 'Settled in INR ' + sbpFmt(pm.settleAmount, 'INR') + ' at ₹' + pm.fxRate + ' per USD';
}

/* ---------------- pass / vehicle entitlement (clause 9 q, r) ----------------
   up to 50 sq.m: 3 all-day passes + 1 car pass, pro-rata per further 50 sq.m;
   1 one-day pass per complete 4 sq.m. Mezzanine area counts as booked area. */
function sbpEntitlement(sqm, cfg) {
  cfg = cfg || sbpConfig();
  const p = cfg.passes;
  const blocks = sqm > 0 ? 1 + Math.floor(Math.max(0, sqm - 50) / 50) : 0;
  return { sqm: sqm, blocks: blocks, allDay: p.allDayPer50 * blocks, oneDay: Math.floor(sqm / 4) * p.oneDayPer4, car: p.carPer50 * blocks };
}
/* entitlement for a set of allotted units: hall / chalet area by the sq.m matrix, Startup Zone pods per pod */
function sbpEntitlementFor(units, cfg) {
  cfg = cfg || sbpConfig();
  const isPod = (s) => s.scheme === 'pod' || s.hall === 'SZ' || String(s.hall) === 'Startup Zone';
  const sqm = units.filter((s) => !isPod(s)).reduce((a, s) => a + Number(s.area != null ? s.area : s.sqm || 0) + Number(s.mezzSqm || 0), 0);
  const pods = units.filter(isPod).length;
  const e = sbpEntitlement(sqm, cfg);
  const p = cfg.startup.passes;
  return { sqm: sqm, pods: pods, blocks: e.blocks, allDay: e.allDay + pods * p.allDay, oneDay: e.oneDay + pods * p.oneDay, car: e.car + pods * p.car };
}
/* apply the entitlement of every allotted stall to the exhibitor's quota categories
   (state = exhibitor S / ex: { stalls, categories }) — returns the entitlement */
function sbpApplyEntitlement(state) {
  const e = sbpEntitlementFor(state.stalls || []);
  const set = (id, n) => { const c = (state.categories || []).find((x) => x.id === id); if (c) c.free = Math.max(c.free, n); };
  set('cat_exh', e.allDay); set('cat_invitee', e.oneDay); set('cat_veh', e.car);
  return e;
}

/* ---- validity clock helpers (shared by exhibitor + admin) ----
   holdUntil = creation date + hold days, 23:59:59 IST. */
const SBP_IST_MS = 5.5 * 3600e3;
function sbpHoldUntil(fromMs, days) {
  const ist = new Date(fromMs + SBP_IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (days || sbpHoldDays()), 23, 59, 59) - SBP_IST_MS).toISOString();
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

/* ---------------- audit trail (one record per application) ---------------- */
function sbpAudit(r, by, event, detail) {
  if (!r.audit) r.audit = [];
  r.audit.push({ at: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), atIso: new Date().toISOString(), by: by, event: event, detail: detail || '' });
}

/* ============================================================
   Documents — proforma invoice & tax invoice (print-ready HTML)
   ============================================================ */
const DEO_BANK = {
  beneficiary: 'Defence Exhibition Organisation',
  gstin: '07AAAJD0880H1ZG',
  accounts: [
    { bank: 'State Bank of India', account: '38748006375', ifsc: 'SBIN0000691' },
    { bank: 'Axis Bank', account: '920020060621798', ifsc: 'UTIB0000120' },
  ],
};
const SBP_DOC_CSS =
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
  '.bank{margin-top:28px;border:1px solid #E6EAF2;border-radius:10px;padding:14px 18px;font-size:13px}' +
  '.bank h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#2F62D8}.bank table{margin:0}.bank td{padding:6px 10px;font-size:13px}' +
  '.terms{margin-top:22px;font-size:12px;color:#4A5568}.terms li{margin:3px 0}' +
  '.foot{margin-top:28px;font-size:11px;color:#6B7686;border-top:1px solid #E6EAF2;padding-top:12px}' +
  '.noprint{margin-top:24px}@media print{.noprint{display:none}}';
const SBP_PRINT_BTN = '<div class="noprint"><button onclick="window.print()" style="background:#2F62D8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>';
const sbpZoneName = (h) => (h === 'CH' ? 'Chalet Line 1' : h === 'SZ' ? 'Startup Zone' : 'Hall ' + h);
const SBP_SCHEME_NAME = { shell: 'Indoor Shell Scheme', raw: 'Indoor Raw Space', outdoor: 'Outdoor Area', chalet1: 'Hospitality Chalet · Single Storey', chalet2: 'Hospitality Chalet · Double Storey', pod: 'Startup Zone · Pod' };

/* line items shared by both documents */
function sbpDocLines(r, p) {
  const cur = p.currency || 'INR';
  const f = (n) => sbpFmt(n, cur);
  return r.stalls.map((s, i) => {
    const l = p.lines[i] || { base: 0, side: 0, sidePct: 0, mezz: 0, mezzSqm: 0, rate: 0, chalet: sbpIsChalet(s), pod: sbpIsPod(s) };
    return '<tr><td><b>' + esc(s.name) + '</b> · ' + esc(sbpZoneName(s.hall)) + ' · ' + esc(SBP_SCHEME_NAME[s.scheme] || s.scheme) +
        '<br><span class="muted">' + (l.pod ? 'Startup pod ' + s.sqm + ' sq.m · concessional flat fee · Indian startup' + (s.startup && s.startup.recognitionNo ? ' · DPIIT / Udyam ' + esc(s.startup.recognitionNo) : '')
          : (l.chalet ? '6m × 12m chalet · flat rate' : s.sqm + ' sq.m (' + esc(s.size || '') + ') × ' + f(l.rate) + ' per sq.m') + ' · ' + esc(s.sides || '1 Side') + ' open') + '</span></td>' +
        '<td class="right">' + f(l.base) + '</td></tr>' +
      (l.side ? '<tr><td class="sub">Corner stall fee — ' + Math.round(l.sidePct * 100) + '% of space rental (' + (sbpSidesN(s) - 1) + ' open side' + (sbpSidesN(s) - 1 === 1 ? '' : 's') + ' beyond the first)</td><td class="right">' + f(l.side) + '</td></tr>' : '') +
      (l.mezz ? '<tr><td class="sub">Mezzanine floor — ' + l.mezzSqm + ' sq.m × ' + f(l.mezzRate) + ' per sq.m (no corner premium)</td><td class="right">' + f(l.mezz) + '</td></tr>' : '');
  }).join('');
}
function sbpDocTotals(p, label) {
  const f = (n) => sbpFmt(n, p.currency || 'INR');
  return '<tr class="tot"><td class="right">Subtotal</td><td class="right">' + f(p.subtotal) + '</td></tr>' +
    '<tr class="tot"><td class="right">GST @ ' + Math.round((p.gstPct || 0.18) * 100) + '%</td><td class="right">' + f(p.gst) + '</td></tr>' +
    '<tr class="tot"><td class="right">Grand Total</td><td class="right">' + f(p.grand) + '</td></tr>' +
    (p.credit ? '<tr class="tot"><td class="right">Less: Registration fee already paid (adjusted)</td><td class="right">− ' + f(p.credit) + '</td></tr>' : '') +
    '<tr class="total"><td class="right">' + label + '</td><td class="right">' + f(p.payable) + '</td></tr>';
}
const sbpBankBlock = (piNo) =>
  '<div class="bank"><h3>Remit to — DEO bank details (NEFT / RTGS / Wire transfer)</h3>' +
    '<table>' + DEO_BANK.accounts.map((b) => '<tr><td><b>' + esc(b.bank) + '</b></td><td>Account name: ' + esc(DEO_BANK.beneficiary) + '</td><td>A/c No: <b>' + esc(b.account) + '</b></td><td>IFSC: <b>' + esc(b.ifsc) + '</b></td></tr>').join('') + '</table>' +
    '<div class="muted" style="margin-top:8px">GST No. of DEO: <b>' + esc(DEO_BANK.gstin) + '</b> · Quote <b>' + esc(piNo) + '</b> in the remittance narration. Cheque / DD in favour of “' + esc(DEO_BANK.beneficiary) + '”, payable at New Delhi. Online: credit card, debit card or UPI through the exhibitor portal. Bank / gateway charges, if any, are borne by the exhibitor.</div></div>';
function sbpDocHead(who, title, right) {
  return '<div class="top"><div><div class="logo">evenuefy</div><div class="muted">' + esc(who.eventName) + ' · ' + esc(who.eventDates) + '<br>Organiser: Defence Exhibition Organisation (DEO), Department of Defence Production, Ministry of Defence</div></div>' +
    '<div><h1>' + title + '</h1><div class="muted right">' + right + '</div></div></div>';
}

/* r: { piNo, no, type, stalls, pricing, createdAt (text), holdUntil (ISO), status, paidAt (text), piRev }
   who: { billedTo, country, regNo, eventName, eventDates } */
function sbpProformaHtml(r, who) {
  const p = r.pricing;
  const cur = p.currency || 'INR';
  const f = (n) => sbpFmt(n, cur);
  const stamp = r.status === 'confirmed' ? '<span class="stamp">PAID · ' + esc(r.paidAt || '') + '</span>'
    : r.status === 'payment_under_verification' ? '<span class="stamp blue">PAYMENT UNDER VERIFICATION</span>'
    : r.status === 'expired' ? '<span class="stamp red">EXPIRED</span>'
    : r.status === 'released' ? '<span class="stamp red">RELEASED</span>'
    : '<span class="stamp amber">VALID TILL ' + esc(sbpDate(r.holdUntil).toUpperCase()) + '</span>';
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(r.piNo) + '</title><style>' + SBP_DOC_CSS + '</style></head><body>' +
    sbpDocHead(who, 'PROFORMA INVOICE', 'PI No: <b>' + esc(r.piNo) + (r.piRev ? ' · Rev ' + r.piRev : '') + '</b><br>Cart created: ' + esc(r.createdAt) + '<br>Valid till: <b>' + esc(sbpDate(r.holdUntil)) + '</b> (' + sbpHoldDays() + ' days)') +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(who.billedTo) + '</b>' + (who.regNo ? ' <span class="muted">(' + esc(who.regNo) + ')</span>' : '') + '<br>' + esc(who.country) + '<br><span class="muted">Application ' + esc(r.no) + ' · ' + esc(r.type) + ' · billed in ' + cur + '</span></div>' +
    '<div class="right"><div class="muted">STATUS</div>' + stamp + '</div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount (' + cur + ')</th></tr>' + sbpDocLines(r, p) + sbpDocTotals(p, 'Net Payable (100% within validity)') + '</table>' +
    sbpBankBlock(r.piNo) +
    '<ul class="terms">' +
      '<li>The stall is held in your cart till <b>' + esc(sbpDate(r.holdUntil)) + '</b>. 100% of the Net Payable must reach DEO’s account within ' + sbpHoldDays() + ' days of this proforma invoice (T&amp;C clause 6a); part payments are not accepted.</li>' +
      (cur === 'USD' && sbpInrSettlementAllowed(cur) ? '<li>USD invoices may be settled in INR at DEO’s settlement rate of ₹' + sbpFxRate() + ' per USD (' + sbpFmt(sbpToInr(p.payable), 'INR') + ' today); exchange-rate variation is borne by the exhibitor (T&amp;C clause 9z).</li>' : '') +
      '<li>Payment may be made online through the exhibitor portal or offline by NEFT / RTGS / Cheque / DD / Wire transfer. For offline payments, upload the proof in the portal — the validity clock pauses until DEO verifies the receipt.</li>' +
      '<li>If the amount is not received within the validity period the application is cancelled automatically and the space released for fresh booking. DEO may extend validity case by case before expiry.</li>' +
      '<li>On confirmation of 100% payment the stall is allotted automatically to the exhibitor; no upgrade / downgrade is permitted thereafter. A tax invoice is issued on allotment.</li>' +
      (p.lines.some((l) => l.pod) ? '<li>Startup Zone pods are offered at a concessional fee to Indian startups only, against a valid DPIIT / Udyam recognition certificate (T&amp;C clause 5f). DEO may release the pod if the certificate is found invalid.</li>' : '') +
      (p.mezz ? '<li>Mezzanine floor is permitted up to 50% of the allotted area for stalls above 100 sq.m, charged per sq.m without corner premium, subject to DEO’s approved terms.</li>' : '') +
      '<li>Rates as per Aero India 2027 Terms &amp; Conditions, clause 5; all rates exclusive of GST which is charged at ' + Math.round((p.gstPct || 0.18) * 100) + '%.</li></ul>' +
    '<div class="foot"><b>This is a proforma invoice — not a tax invoice.</b> Computer-generated for the organiser · ' + esc(who.eventName) + ' · ' + esc(r.piNo) + '.</div>' + SBP_PRINT_BTN +
    '</body></html>';
  return html;
}
function sbpOpenProforma(r, who) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the proforma invoice.', 'error'); return; }
  w.document.write(sbpProformaHtml(r, who));
  w.document.close();
}

/* Tax invoice — issued on 100% payment / allotment.
   r as above plus payment { mode, method, ref, txn }, orderNo, allotment */
function sbpTaxInvoiceHtml(r, who) {
  const p = r.pricing;
  const cur = p.currency || 'INR';
  const invNo = 'INV-' + String(r.orderNo || r.piNo).replace(/^(ORD|PI)-/, '');
  const pm = r.payment || {};
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(invNo) + '</title><style>' + SBP_DOC_CSS + '</style></head><body>' +
    sbpDocHead(who, 'TAX INVOICE', 'Invoice No: <b>' + esc(invNo) + '</b><br>Date: ' + esc(r.paidAt || '') + '<br>Against proforma invoice ' + esc(r.piNo) + (r.piRev ? ' Rev ' + r.piRev : '')) +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(who.billedTo) + '</b>' + (who.regNo ? ' <span class="muted">(' + esc(who.regNo) + ')</span>' : '') + '<br>' + esc(who.country) + '<br><span class="muted">Application ' + esc(r.no) + ' · ' + esc(r.type) + ' · billed in ' + cur + '</span></div>' +
    '<div class="right"><div class="muted">PAYMENT</div><b>' + esc(r.orderNo || '') + '</b><br><span class="muted">' + esc((pm.mode === 'offline' ? 'Offline · ' : 'Online · ') + (pm.method || 'Card') + (pm.ref ? ' · Ref ' + pm.ref : '') + (pm.txn ? ' · ' + pm.txn : '')) + '</span>' + (sbpSettlementText(pm, cur) ? '<br><span class="muted">' + esc(sbpSettlementText(pm, cur)) + '</span>' : '') + '<br><span class="stamp">PAID · 100%</span></div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount (' + cur + ')</th></tr>' + sbpDocLines(r, p) + sbpDocTotals(p, 'Total Paid') +
    (sbpSettlementText(pm, cur) ? '<tr class="tot"><td class="right">Received in INR (' + esc(String(pm.method || '')) + ')</td><td class="right">' + sbpFmt(pm.settleAmount, 'INR') + ' @ ₹' + esc(String(pm.fxRate)) + '/$</td></tr>' : '') + '</table>' +
    (r.allotment ? '<div class="bank"><h3>Allotment</h3><div>Stall <b>' + esc(r.stalls.map((s) => s.name).join(', ')) + '</b> (' + esc(r.stalls.map((s) => sbpZoneName(s.hall)).join(', ')) + ') allotted to <b>' + esc(who.billedTo) + '</b> on ' + esc(r.allotment.at || '') + '. ' +
      (r.allotment.entitlement ? 'Entitlement released: ' + r.allotment.entitlement.allDay + ' all-day exhibitor passes, ' + r.allotment.entitlement.oneDay + ' one-day passes, ' + r.allotment.entitlement.car + ' car pass(es).' : '') + '</div></div>' : '') +
    '<div class="foot">GST No. of DEO: ' + esc(DEO_BANK.gstin) + ' · Computer-generated tax invoice for the payment collected by the organiser · ' + esc(who.eventName) + ' · No TDS is to be deducted (DEO is a Central Government organisation).</div>' + SBP_PRINT_BTN +
    '</body></html>';
  return html;
}
function sbpOpenTaxInvoice(r, who) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the invoice.', 'error'); return; }
  w.document.write(sbpTaxInvoiceHtml(r, who));
  w.document.close();
}
