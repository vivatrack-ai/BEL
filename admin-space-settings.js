/* ============================================================
   Evenuefy Admin — Settings › Space Booking Configuration
   Rate card (per sq.m, INR / USD), corner rule, mezzanine rules,
   validity, registration credit, ticket (pass) matrix for the
   exhibitor / co-exhibitor / aggregator / associate media partner,
   and the e-mail notifications the space-booking flow triggers.
   Stored in localStorage (sbpConfig) and read by both portals.
   ============================================================ */

'use strict';

function viewSpaceSettings() {
  const c = sbpConfig();
  const num = (id, v, step, min, w) => '<input type="number" id="' + id + '" value="' + v + '" step="' + (step || 1) + '" min="' + (min != null ? min : 0) + '" style="' + dateInputStyle + ';width:' + (w || 130) + 'px">';
  const rateRow = (label, key) => '<tr><td class="td-strong">' + label + '</td><td>' + num('r_' + key + '_inr', c.rates[key].inr, 100) + '</td><td>' + num('r_' + key + '_usd', c.rates[key].usd, 5) + '</td></tr>';
  const chk = (id, on, label) => '<label class="check-item' + (on ? ' selected' : '') + '" style="display:inline-flex;margin:0 10px 8px 0"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' onchange="this.closest(\'label\').classList.toggle(\'selected\',this.checked)"> ' + label + '</label>';
  const emails = [['reserved', 'Reservation — proforma invoice sent (exhibitor cart or DEO reservation)'], ['reminders', 'Payment reminders at T−7 / T−3 / T−1 days'], ['verification', 'Offline payment verification result (accepted / rejected)'],
    ['extension', 'Validity extended by DEO'], ['expiry', 'Application expired — stall released'], ['allotment', 'Stall allotted — tax invoice & quota released'], ['shift', 'Stall shifted — differential / credit note']];
  const log = ((typeof A !== 'undefined' && A.emailLog) || []).filter((l) => l.kind).slice(0, 12);
  const ent = (sqm) => sbpEntitlement(sqm, c);

  return '<h1 class="page-title">Space Booking Configuration</h1>' +
    '<p class="page-sub">Pricing engine rules used by the exhibitor cart, the admin reservations, proforma / tax invoices and the quota released on allotment. Defaults follow the Aero India 2027 Terms &amp; Conditions (clause 5 rate card, clause 9 pass entitlements).</p>' +
    '<div class="sb-cfg">' +
    '<div class="form-grid">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Rate Card (per sq.m, excl. GST)</h2>' +
        '<div class="tablewrap"><table class="grid"><tr><th>Space type</th><th>Indian participants (INR)</th><th>Foreign participants (USD)</th></tr>' +
          rateRow('Indoor Raw Scheme', 'raw') + rateRow('Indoor Shell Scheme', 'shell') + rateRow('Outdoor Area', 'outdoor') + '</table></div>' +
        '<div class="tablewrap" style="margin-top:12px"><table class="grid"><tr><th>Hospitality chalet (6m × 12m) · flat</th><th>INR</th><th>USD</th></tr>' +
          '<tr><td class="td-strong">Single storey</td><td>' + num('ch1_inr', c.chalet.chalet1.inr, 10000) + '</td><td>' + num('ch1_usd', c.chalet.chalet1.usd, 100) + '</td></tr>' +
          '<tr><td class="td-strong">Double storey</td><td>' + num('ch2_inr', c.chalet.chalet2.inr, 10000) + '</td><td>' + num('ch2_usd', c.chalet.chalet2.usd, 100) + '</td></tr></table></div>' +
        '<div class="form-grid" style="margin-top:12px">' +
          '<div class="field"><label>Corner stall fee — % of space rental per open side beyond the first</label>' + num('corner', Math.round(c.cornerPctPerSide * 100), 0.5, 0, 90) + ' %<div class="hint">2 sides +' + Math.round(c.cornerPctPerSide * 100) + '% · 3 sides +' + Math.round(c.cornerPctPerSide * 200) + '% · 4 sides +' + Math.round(c.cornerPctPerSide * 300) + '% · not on chalets or mezzanine</div></div>' +
          '<div class="field"><label>GST %</label>' + num('gst', Math.round(c.gst * 100), 1, 0, 90) + ' %</div>' +
          '<div class="field"><label>Minimum bookable area (sq.m)</label>' + num('minSqm', c.minSqm, 1, 1, 90) + '</div>' +
          '<div class="field"><label>USD → INR settlement rate (₹ per USD)</label>' + num('usdRate', c.usdRate, 0.5, 1, 90) + '<div class="hint">Used when a USD-billed exhibitor pays in INR (online or offline) and for INR equivalents in reports. Exchange-rate variation is borne by the exhibitor (T&amp;C 9z).</div></div>' +
          '<div class="field full">' + chk('allowInr', c.allowInrSettlement !== false, 'Allow USD-billed (foreign) exhibitors to settle invoices in INR at the rate above') + '</div>' +
        '</div></div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Mezzanine Floor</h2>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Rate — Indian (INR per sq.m)</label>' + num('mz_inr', c.mezz.inr, 100) + '</div>' +
          '<div class="field"><label>Rate — Foreign (USD per sq.m)</label>' + num('mz_usd', c.mezz.usd, 5) + '</div>' +
          '<div class="field"><label>Eligible when stall area is above (sq.m)</label>' + num('mz_min', c.mezz.minSqm, 1) + '</div>' +
          '<div class="field"><label>Maximum mezzanine — % of allotted area</label>' + num('mz_max', Math.round(c.mezz.maxPct * 100), 1, 1, 90) + ' %</div>' +
          '<div class="field full"><label>Applicable space types</label><div>' + chk('mz_raw', c.mezz.schemes.includes('raw'), 'Indoor Raw') + chk('mz_shell', c.mezz.schemes.includes('shell'), 'Indoor Shell') + chk('mz_outdoor', c.mezz.schemes.includes('outdoor'), 'Outdoor') + '</div>' +
            '<div class="hint">Mezzanine is priced per sq.m only — no corner premium. The exhibitor enters the mezzanine area at stall selection; DEO enters it when reserving a stall for a company. Mezzanine area counts towards pass entitlement.</div></div>' +
        '</div>' +
        '<h2 class="card-title" style="margin-top:16px">Cart &amp; Payment</h2>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Cart validity (days from proforma invoice)</label>' + num('hold', c.holdDays, 1, 1, 90) + '</div>' +
          '<div class="field"><label>Registration fee adjusted — INR / USD</label><div style="display:flex;gap:8px">' + num('reg_inr', c.regFee.inr, 1000, 0, 110) + num('reg_usd', c.regFee.usd, 10, 0, 90) + '</div><div class="hint">Adjusted (incl. GST) once, against the company’s earliest live application.</div></div>' +
        '</div></div>' +
    '</div>' +
    '<div class="form-grid section-gap">' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">Ticket Matrix — Passes Released on Allotment</h2>' +
        '<div class="tablewrap"><table class="grid"><tr><th>Entitlement</th><th>Rule</th><th>Value</th></tr>' +
          '<tr><td class="td-strong">Main exhibitor · all-day passes</td><td>per 50 sq.m block (first 50 sq.m, then pro-rata)</td><td>' + num('p_allday', c.passes.allDayPer50, 1, 0, 80) + '</td></tr>' +
          '<tr><td class="td-strong">Main exhibitor · one-day passes</td><td>per complete 4 sq.m</td><td>' + num('p_oneday', c.passes.oneDayPer4, 1, 0, 80) + '</td></tr>' +
          '<tr><td class="td-strong">Main exhibitor · car passes (P-6)</td><td>per 50 sq.m block</td><td>' + num('p_car', c.passes.carPer50, 1, 0, 80) + '</td></tr>' +
          '<tr><td class="td-strong">Co-Exhibitor</td><td>per registered co-exhibitor (all-day / one-day / car)</td><td style="white-space:nowrap">' + num('p_co_a', c.passes.coex.allDay, 1, 0, 60) + ' ' + num('p_co_o', c.passes.coex.oneDay, 1, 0, 60) + ' ' + num('p_co_c', c.passes.coex.car, 1, 0, 60) + '</td></tr>' +
          '<tr><td class="td-strong">Aggregator company</td><td>per approved aggregator (all-day / one-day / car)</td><td style="white-space:nowrap">' + num('p_ag_a', c.passes.aggregator.allDay, 1, 0, 60) + ' ' + num('p_ag_o', c.passes.aggregator.oneDay, 1, 0, 60) + ' ' + num('p_ag_c', c.passes.aggregator.car, 1, 0, 60) + '</td></tr>' +
          '<tr><td class="td-strong">Associate Media Partner</td><td>fee (INR, excl. GST) · space (sq.m) · passes</td><td style="white-space:nowrap">' + num('p_mp_fee', c.passes.mediaPartner.fee, 10000, 0, 110) + ' ' + num('p_mp_sqm', c.passes.mediaPartner.sqm, 1, 0, 60) + ' ' + num('p_mp_pass', c.passes.mediaPartner.passes, 1, 0, 60) + '</td></tr>' +
        '</table></div>' +
        '<p style="font-size:0.76rem;color:var(--muted);margin:10px 0 0">Preview with current values: 36 sq.m → ' + ent(36).allDay + ' / ' + ent(36).oneDay + ' / ' + ent(36).car + ' · 108 sq.m → ' + ent(108).allDay + ' / ' + ent(108).oneDay + ' / ' + ent(108).car + ' · 254 sq.m → ' + ent(254).allDay + ' / ' + ent(254).oneDay + ' / ' + ent(254).car + ' (all-day / one-day / car). Quota is released automatically when a stall is allotted and locked thereafter.</p></div>' +
      '<div class="card" style="margin-top:0"><h2 class="card-title">E-mail Notifications</h2>' +
        '<p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">Triggered automatically by the space-booking flow (demo: logged below and in the exhibitor’s bell).</p>' +
        emails.map(([k, l]) => '<div style="margin-bottom:6px">' + chk('em_' + k, c.emails[k] !== false, l) + '</div>').join('') +
        '<h2 class="card-title" style="margin-top:14px">Recent E-mails</h2>' +
        (log.length ? '<div class="tablewrap"><table class="grid"><tr><th>Sent</th><th>To</th><th>Subject</th></tr>' + log.map((l) => '<tr><td style="white-space:nowrap">' + esc(l.sentAt) + '</td><td>' + esc((l.recipients || []).join(', ')) + '</td><td>' + esc(l.subject) + '</td></tr>').join('') + '</table></div>'
          : '<p style="font-size:0.8rem;color:var(--muted)">No space-booking e-mails sent yet.</p>') + '</div>' +
    '</div>' +
    '<div class="card section-gap" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;align-items:center">' +
      '<span style="flex:1;font-size:0.78rem;color:var(--muted)">Changes apply immediately to new carts, reservations and invoices on both portals; applications already priced keep their proforma figures.</span>' +
      '<button class="btn btn-outline" onclick="if(confirm(\'Reset every value to the Aero India 2027 T&C defaults?\')){sbpResetConfig();render();toast(\'Space booking configuration reset to defaults.\',\'success\')}"><span class="material-symbols-outlined">restart_alt</span>Reset to T&amp;C defaults</button>' +
      '<button class="btn btn-primary" onclick="sbCfgSave()"><span class="material-symbols-outlined">save</span>Save Configuration</button>' +
    '</div></div>' + footerTools();
}
function sbCfgSave() {
  const v = (id) => Number($(id).value);
  const c = sbpConfig();
  const bad = [];
  const pos = (id, label, allowZero) => { const x = v(id); if (isNaN(x) || x < 0 || (!allowZero && x === 0)) bad.push(label); return x; };
  c.rates.raw.inr = pos('r_raw_inr', 'Raw INR'); c.rates.raw.usd = pos('r_raw_usd', 'Raw USD');
  c.rates.shell.inr = pos('r_shell_inr', 'Shell INR'); c.rates.shell.usd = pos('r_shell_usd', 'Shell USD');
  c.rates.outdoor.inr = pos('r_outdoor_inr', 'Outdoor INR'); c.rates.outdoor.usd = pos('r_outdoor_usd', 'Outdoor USD');
  c.chalet.chalet1.inr = pos('ch1_inr', 'Chalet single INR'); c.chalet.chalet1.usd = pos('ch1_usd', 'Chalet single USD');
  c.chalet.chalet2.inr = pos('ch2_inr', 'Chalet double INR'); c.chalet.chalet2.usd = pos('ch2_usd', 'Chalet double USD');
  c.cornerPctPerSide = pos('corner', 'Corner %', true) / 100; c.gst = pos('gst', 'GST', true) / 100; c.minSqm = pos('minSqm', 'Minimum area'); c.usdRate = pos('usdRate', 'USD rate');
  c.mezz.inr = pos('mz_inr', 'Mezzanine INR'); c.mezz.usd = pos('mz_usd', 'Mezzanine USD'); c.mezz.minSqm = pos('mz_min', 'Mezzanine min area', true); c.mezz.maxPct = pos('mz_max', 'Mezzanine max %') / 100;
  c.mezz.schemes = ['raw', 'shell', 'outdoor'].filter((k) => $('mz_' + k).checked);
  c.holdDays = pos('hold', 'Validity days'); c.regFee.inr = pos('reg_inr', 'Registration INR', true); c.regFee.usd = pos('reg_usd', 'Registration USD', true);
  c.passes.allDayPer50 = pos('p_allday', 'All-day passes', true); c.passes.oneDayPer4 = pos('p_oneday', 'One-day passes', true); c.passes.carPer50 = pos('p_car', 'Car passes', true);
  c.passes.coex = { allDay: pos('p_co_a', 'Co-ex all-day', true), oneDay: pos('p_co_o', 'Co-ex one-day', true), car: pos('p_co_c', 'Co-ex car', true) };
  c.passes.aggregator = { allDay: pos('p_ag_a', 'Aggregator all-day', true), oneDay: pos('p_ag_o', 'Aggregator one-day', true), car: pos('p_ag_c', 'Aggregator car', true) };
  c.passes.mediaPartner = { fee: pos('p_mp_fee', 'Media partner fee', true), sqm: pos('p_mp_sqm', 'Media partner sq.m', true), passes: pos('p_mp_pass', 'Media partner passes', true) };
  ['reserved', 'reminders', 'verification', 'extension', 'expiry', 'allotment', 'shift'].forEach((k) => { c.emails[k] = $('em_' + k).checked; });
  c.allowInrSettlement = $('allowInr').checked;
  if (bad.length) { toast('Check these values: ' + bad.join(', '), 'error'); return; }
  if (c.mezz.maxPct > 1) { toast('Mezzanine maximum cannot exceed 100% of the allotted area.', 'error'); return; }
  sbpSaveConfig(c);
  render();
  toast('Space booking configuration saved — applies to both portals.', 'success');
}
