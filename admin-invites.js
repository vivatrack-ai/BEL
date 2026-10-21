/* ============================================================
   Admin · Inaugural Function & Dinner Invites (T&C clause 9(y))
   Consolidated guest list across every exhibitor portal: entitlement
   per company (space + co-exhibitors + sponsorship) and the nominations
   their nodal officers approved — for protocol, seating and printing.
   ============================================================ */
'use strict';

window.__aciType = window.__aciType || '';
window.__aciStatus = window.__aciStatus || 'issued';
window.__aciQ = window.__aciQ || '';

/* every main exhibitor portal with its 9(y) entitlement (computed in memory, nothing is written) */
function aciCompanies() {
  return SB_EXHIBITORS.map((p) => {
    const st = sbReadState(p.lsKey);
    if (!st) return null;
    const e = sbCeremonySync(st);
    return { profile: p, state: st, ent: e };
  }).filter(Boolean);
}
function aciNominations(list) {
  const out = [];
  list.forEach((c) => (c.state.passes || []).forEach((p) => {
    if (p.catId !== 'cat_inaug' && p.catId !== 'cat_dinner') return;
    const co = p.coexId ? (c.state.coexhibitors || []).find((x) => x.id === p.coexId) : null;
    out.push({ p: p, exhibitor: c.profile.company, company: co ? co.company : c.profile.company, role: co ? (co.type === 'aggregator' ? 'Aggregator' : 'Co-Exhibitor') : 'Exhibitor' });
  }));
  return out;
}
const aciTypeName = (catId) => (catId === 'cat_inaug' ? 'Inaugural Function' : 'Dinner');
const aciStatusText = (st) => (st === 'issued' ? 'Approved' : st === 'pending_approval' ? 'Pending nodal approval' : st === 'rejected' ? 'Rejected' : st);
function aciFiltered(noms) {
  const q = window.__aciQ.toLowerCase();
  return noms.filter((n) => (!window.__aciType || n.p.catId === window.__aciType) && (!window.__aciStatus || n.p.status === window.__aciStatus) &&
    (!q || (n.p.data.firstName + ' ' + n.p.data.lastName + ' ' + n.company + ' ' + (n.p.data.email || '') + ' ' + (n.p.inviteNo || '')).toLowerCase().includes(q)));
}

function viewCeremonyInvites() {
  const list = aciCompanies();
  const noms = aciNominations(list);
  const count = (cat, st) => noms.filter((n) => n.p.catId === cat && (!st || n.p.status === st)).length;
  const sum = (k) => list.reduce((a, c) => a + c.ent[k], 0);
  const tile = (label, val, sub) => '<div class="card" style="margin:0;padding:16px 18px"><div class="result-count" style="text-transform:uppercase;letter-spacing:.08em">' + label + '</div>' +
    '<div style="font-size:1.6rem;font-weight:800;margin-top:4px">' + val + '</div><div class="result-count">' + sub + '</div></div>';
  const tiles = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px">' +
    tile('Inaugural entitlement', sum('inaug'), count('cat_inaug', 'issued') + ' approved · ' + count('cat_inaug', 'pending_approval') + ' pending') +
    tile('Dinner entitlement', sum('dinner'), count('cat_dinner', 'issued') + ' approved · ' + count('cat_dinner', 'pending_approval') + ' pending') +
    tile('Companies', list.length, list.reduce((a, c) => a + c.ent.coex.length, 0) + ' co-exhibitor / aggregator compan(ies) with 1 + 1') + '</div>';

  const entRows = list.map((c, i) => {
    const e = c.ent;
    const used = (cat) => (c.state.passes || []).filter((p) => p.catId === cat && p.status !== 'rejected').length;
    return '<tr><td class="num">' + (i + 1) + '</td><td class="td-strong">' + esc(c.profile.company) + '<span class="td-sub">' + esc(c.profile.regNo || '') + '</span></td>' +
      '<td>' + (e.sqm ? e.sqm + ' sq.m · ' + e.blocks + ' block(s)' : '—') + (e.pods ? '<span class="td-sub">' + e.pods + ' Startup Zone pod(s)</span>' : '') + '</td>' +
      '<td class="num">' + e.space.inaug + ' + ' + e.space.dinner + '</td>' +
      '<td class="num">' + e.coexEnt.inaug + ' + ' + e.coexEnt.dinner + '<span class="td-sub">' + e.coex.length + ' compan' + (e.coex.length === 1 ? 'y' : 'ies') + '</span></td>' +
      '<td class="num">' + e.sponsor.inaug + ' + ' + e.sponsor.dinner + (e.sponsor.names.length ? '<span class="td-sub">' + esc(e.sponsor.names.join(', ')) + '</span>' : '') + '</td>' +
      '<td class="num td-strong">' + e.inaug + ' + ' + e.dinner + '</td>' +
      '<td class="num">' + used('cat_inaug') + ' + ' + used('cat_dinner') + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="color:var(--muted)">No exhibitor portal has been opened yet.</td></tr>';

  const rows = aciFiltered(noms).map((n, i) => {
    const d = n.p.data;
    return '<tr><td class="num">' + (i + 1) + '</td>' +
      '<td class="td-strong">' + esc((d.salutation ? d.salutation + ' ' : '') + d.firstName + ' ' + d.lastName) + '<span class="td-sub">' + esc(d.designation || '') + '</span></td>' +
      '<td>' + esc(n.company) + '<span class="td-sub">' + n.role + (n.role !== 'Exhibitor' ? ' of ' + esc(n.exhibitor) : '') + '</span></td>' +
      '<td>' + aciTypeName(n.p.catId) + '</td>' +
      '<td>' + esc(d.email || '') + '<span class="td-sub">' + esc(d.mobile || '') + '</span></td>' +
      '<td>' + esc(d.nationality || '') + '<span class="td-sub">' + esc(d.idType || '') + ' ' + esc(cerMaskIdA(d.idNo)) + '</span></td>' +
      '<td><span class="pill ' + (n.p.status === 'issued' ? 'green' : n.p.status === 'rejected' ? 'red' : 'amber') + '">' + aciStatusText(n.p.status) + '</span>' +
        (n.p.approvedBy ? '<span class="td-sub">' + esc(n.p.approvedBy) + '</span>' : '') + '</td>' +
      '<td class="num">' + esc(n.p.inviteNo || '—') + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="color:var(--muted)">No nominations in this view.</td></tr>';

  const sel = (onchange, cur, opts) => '<select onchange="' + onchange + '" style="border:1px solid #CFD7E4;border-radius:9px;padding:8px 12px;font-family:inherit;font-size:0.86rem">' +
    opts.map(([v, l]) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';

  return '<h1 class="page-title">Inaugural &amp; Dinner Invites</h1>' +
    '<p class="page-sub">T&amp;C clause 9(y): 2 inaugural + 1 dinner invite per 50 sq.m booked (pro-rata), 1 + 1 per Startup Zone pod and 1 + 1 complimentary for each indirect / co-exhibitor. Nominations are approved by each exhibitor’s nodal officer; approved nominees form the guest list below.</p>' +
    tiles +
    '<div class="card"><div class="card-head-row"><h2 class="card-title">Entitlement by Exhibitor</h2><span class="result-count">inaugural + dinner</span></div>' +
    '<div class="tablewrap"><table class="grid"><tr><th>Sr.</th><th>Exhibitor</th><th>Space booked</th><th>Space invites</th><th>Co-exhibitors</th><th>Sponsorship</th><th>Total</th><th>Nominated</th></tr>' + entRows + '</table></div></div>' +
    '<div class="card section-gap"><div class="card-head-row" style="flex-wrap:wrap;gap:10px"><h2 class="card-title" style="margin:0">Guest List</h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<input type="text" value="' + esc(window.__aciQ) + '" placeholder="Search name, company, invite no." onchange="window.__aciQ=this.value;render()" style="border:1px solid #CFD7E4;border-radius:9px;padding:8px 12px;font-family:inherit;font-size:0.86rem;min-width:220px">' +
        sel('window.__aciType=this.value;render()', window.__aciType, [['', 'All invites'], ['cat_inaug', 'Inaugural Function'], ['cat_dinner', 'Dinner']]) +
        sel('window.__aciStatus=this.value;render()', window.__aciStatus, [['issued', 'Approved'], ['pending_approval', 'Pending'], ['rejected', 'Rejected'], ['', 'All statuses']]) +
        '<button class="btn btn-outline btn-sm" onclick="aciExport()"><span class="material-symbols-outlined" style="font-size:16px">download</span>Export</button>' +
      '</div></div>' +
    '<div class="tablewrap"><table class="grid"><tr><th>Sr.</th><th>Nominee</th><th>Company</th><th>Invite</th><th>Email / Mobile</th><th>Nationality / Photo ID</th><th>Status</th><th>Invite No.</th></tr>' + rows + '</table></div></div>' +
    footerTools();
}
const cerMaskIdA = (v) => { v = String(v || ''); return v.length > 4 ? '••••' + v.slice(-4) : v; };

function aciExport() {
  const list = aciFiltered(aciNominations(aciCompanies()));
  if (!list.length) { toast('No nominations to export.', 'error'); return; }
  exportWorkbook('Inaugural-Dinner-Invites-' + exportStamp(), [{
    name: 'Guest List',
    headers: ['Sr.', 'Invite', 'Invite No', 'Salutation', 'First Name', 'Last Name', 'Designation', 'Company', 'Role', 'Main Exhibitor', 'Nationality', 'Photo ID Type', 'Photo ID No', 'Email', 'Mobile', 'Status', 'Approved By', 'Approved At'],
    rows: list.map((n, i) => {
      const d = n.p.data;
      return [i + 1, aciTypeName(n.p.catId), n.p.inviteNo || '-', d.salutation || '', d.firstName, d.lastName, d.designation || '', n.company, n.role, n.exhibitor,
        d.nationality || '', d.idType || '', d.idNo || '', d.email || '', d.mobile || '', aciStatusText(n.p.status), n.p.approvedBy || '-', n.p.approvedAt || '-'];
    }),
  }]);
}
