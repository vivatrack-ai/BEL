import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useExhibitorState, actions, catById, coexById,
  exhibitorBalance, quotaFor, quotaUsed, quotaEligibleCoex,
} from '../store/exhibitorStore.js';
import { Icon, Field, toast, FooterTools } from '../components/ui.jsx';
import { usePassModals } from './passPages.jsx';

export default function CatCoexPage() {
  const { catId } = useParams();
  const state = useExhibitorState();
  const modals = usePassModals(state);
  const eligible = state ? quotaEligibleCoex(state) : [];
  const [coexId, setCoexId] = useState('');
  const [qty, setQty] = useState('');
  const [err, setErr] = useState('');
  if (!state) return null;

  const cat = catById(state, catId);
  if (!cat) return null;
  const backRoute = cat.kind === 'invitee' ? '/exhibitor/passes/invitee'
    : cat.kind === 'vehicle' ? '/exhibitor/passes/vehicle' : '/exhibitor/passes/badges';
  const backLabel = cat.kind === 'invitee' ? 'Exhibitor Invitee'
    : cat.kind === 'vehicle' ? 'Vehicle Pass Details' : 'Badge Details';

  const selCoex = coexId || (eligible[0] ? eligible[0].id : '');
  const balance = exhibitorBalance(state, catId);
  const nQty = parseInt(qty, 10) || 0;
  const remaining = balance - nQty;

  const assign = async (e) => {
    e.preventDefault();
    if (!selCoex) { setErr('Select a co-exhibitor'); return; }
    const n = parseInt(qty, 10);
    if (isNaN(n) || n <= 0) { setErr('Enter a valid quota'); return; }
    if (n > balance) { setErr('Only ' + balance + ' available in your balance'); return; }
    setErr('');
    await actions.assignQuota({ coexId: selCoex, catId, qty: n });
    setQty('');
    toast(n + ' quota assigned to ' + coexById(state, selCoex).company, 'success');
  };

  const removeQuota = async (q) => {
    const used = quotaUsed(state, q.coexId, catId);
    if (used > 0) {
      toast('Cannot remove: ' + used + ' pass(es) already filled against this quota. You can only reduce unused quota.', 'error');
      return;
    }
    if (!window.confirm('Remove this quota assignment? The quota returns to your balance.')) return;
    await actions.removeQuota(q.id);
    toast('Quota removed', 'success');
  };

  const quotas = state.quotas.filter((q) => q.catId === catId);

  return (
    <>
      <Link className="back-link" to={backRoute}><Icon name="arrow_back" style={{ fontSize: 16 }} />Back to {backLabel}</Link>
      <h1 className="page-title">Co-Exhibitors · {cat.name}</h1>
      <p className="page-sub">Assign {cat.kind === 'vehicle' ? 'vehicle pass' : 'badge'} quota from your balance to co-exhibitors, and manage the passes they fill.</p>

      <div className="card">
        <h2 className="card-title">Assign Quota</h2>
        {eligible.length === 0 ? (
          <div className="note amber">
            <b className="title">No eligible co-exhibitors.</b>
            Quota can be assigned only to <b>Separate</b> co-exhibitors whose registration payment is complete.
            Subsidiary co-exhibitors are not entitled to passes &amp; services.
          </div>
        ) : (
          <form onSubmit={assign} noValidate>
            <div className="form-grid">
              <Field label="Co-Exhibitor" required>
                <select value={selCoex} onChange={(e) => setCoexId(e.target.value)}>
                  {eligible.map((c) => <option key={c.id} value={c.id}>{c.company} — {c.email}</option>)}
                </select>
              </Field>
              <Field label="Allocate Quota" required error={err}>
                <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Enter quota" />
              </Field>
            </div>
            <div className="quota-strip">
              <div>Current quota of selected co-exhibitor: <b>{selCoex ? quotaFor(state, selCoex, catId) : 0}</b></div>
              <div>Available Quota Balance: <b>{balance}</b></div>
              <div>Remaining after assignment: <b className={remaining < 0 ? 'neg' : ''}>{remaining}</b></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit"><Icon name="assignment_turned_in" />Assign Quota</button>
            </div>
          </form>
        )}
      </div>

      <div className="card section-gap">
        <h2 className="card-title">Co-Exhibitor Assigned Quota List</h2>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>Sr.</th><th>Category of Passes</th><th>Co-Exhibitor (Email)</th><th>Quota</th><th>Balance</th><th>Action</th></tr>
          {quotas.length ? quotas.map((q, i) => {
            const c = coexById(state, q.coexId);
            const used = quotaUsed(state, q.coexId, catId);
            return (
              <tr key={q.id}>
                <td className="num">{i + 1}</td>
                <td>{cat.name}</td>
                <td><span className="td-strong">{c.company}</span><span className="td-sub">{c.email}</span></td>
                <td className="num">{q.quota}</td>
                <td className="num">{q.quota - used}</td>
                <td className="td-actions">
                  <button className="btn-link" onClick={() => modals.open('view', cat, q.coexId)}>View Passes</button>
                  <button className="btn-link" onClick={() => modals.open(cat.kind === 'vehicle' ? 'veh' : 'add', cat, q.coexId)}>Add New</button>
                  {cat.kind !== 'vehicle' && (
                    <button className="btn-link" onClick={() => modals.open('link', cat, q.coexId)}>Send Link</button>
                  )}
                  <button className="btn-link danger" onClick={() => removeQuota(q)}>Remove</button>
                </td>
              </tr>
            );
          }) : <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No quota assigned to any co-exhibitor yet.</td></tr>}
        </tbody></table></div>
      </div>

      {modals.node}
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
