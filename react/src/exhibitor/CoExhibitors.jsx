import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useExhibitorState, actions, coexSqm, quotaUsed } from '../store/exhibitorStore.js';
import { EVENT, money } from '../lib.js';
import { Icon, Modal, Pill, toast, FooterTools } from '../components/ui.jsx';
import CoExhibitorAdd from './CoExhibitorAdd.jsx';

export const coexTypePill = (c) =>
  c.type === 'subsidiary' ? <Pill color="gray">Subsidiary</Pill> : <Pill color="blue">Separate</Pill>;
export const coexStatusPill = (c) =>
  c.type === 'subsidiary' || c.status === 'active'
    ? <Pill color="green">Active</Pill>
    : <Pill color="amber">Payment Pending</Pill>;

function CoexViewModal({ state, coex, onClose }) {
  const qRows = state.quotas.filter((q) => q.coexId === coex.id);
  const aRows = state.allocations.filter((a) => a.coexId === coex.id);
  return (
    <Modal title={'Co-Exhibitor · ' + coex.company} onClose={onClose}
      footer={<button className="btn btn-outline" onClick={onClose}>Close</button>}>
      <div className="form-grid">
        <div><b>Type:</b> {coexTypePill(coex)}</div>
        <div><b>Status:</b> {coexStatusPill(coex)}</div>
        <div><b>Email:</b> {coex.email}</div>
        <div><b>Reg. No.:</b> {coex.regNo ? <code>{coex.regNo}</code> : '— (subsidiary)'}</div>
        {coex.type === 'separate' && <div className="full"><b>Nodal Officer:</b> {coex.nodalFirst} {coex.nodalLast}</div>}
        <div className="full"><b>Added:</b> {coex.createdAt}</div>
      </div>
      <h3 style={{ margin: '18px 0 6px', fontSize: '0.9rem' }}>Space Allocations</h3>
      <div className="tablewrap"><table className="grid">
        <tbody>
          <tr><th>Hall</th><th>Stall</th><th>Area</th></tr>
          {aRows.length ? aRows.map((a) => {
            const st = state.stalls.find((x) => x.id === a.stallId);
            return <tr key={a.id}><td>{st.hall}</td><td>{st.stall}</td><td className="num">{a.sqm} sqm</td></tr>;
          }) : <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>No space allocated yet</td></tr>}
        </tbody>
      </table></div>
      <h3 style={{ margin: '18px 0 6px', fontSize: '0.9rem' }}>Pass Quotas</h3>
      <div className="tablewrap"><table className="grid">
        <tbody>
          <tr><th>Category</th><th>Quota</th><th>Used</th><th>Balance</th></tr>
          {qRows.length ? qRows.map((q) => {
            const cat = state.categories.find((c) => c.id === q.catId);
            const used = quotaUsed(state, coex.id, q.catId);
            return <tr key={q.id}><td>{cat.name}</td><td className="num">{q.quota}</td><td className="num">{used}</td><td className="num">{q.quota - used}</td></tr>;
          }) : <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No pass quota assigned yet</td></tr>}
        </tbody>
      </table></div>
    </Modal>
  );
}

export default function CoExhibitors() {
  const state = useExhibitorState();
  const { openCart } = useOutletContext();
  const [viewing, setViewing] = useState(null);
  if (!state) return null;

  // Rule: no co-exhibitors yet -> open the Add form directly
  if (state.coexhibitors.length === 0) return <CoExhibitorAdd isFirst />;

  const del = async (c) => {
    const hasAlloc = state.allocations.some((a) => a.coexId === c.id);
    const hasQuota = state.quotas.some((q) => q.coexId === c.id);
    const hasPasses = state.passes.some((p) => p.coexId === c.id);
    if (hasAlloc || hasQuota || hasPasses) {
      toast('Cannot delete: remove this co-exhibitor’s space allocations and pass quotas first.', 'error');
      return;
    }
    if (!window.confirm('Delete this co-exhibitor?')) return;
    await actions.deleteCoExhibitor(c.id);
    toast('Co-exhibitor deleted', 'success');
  };

  const pendingCount = state.coexhibitors.filter((c) => c.status === 'payment_pending').length;

  return (
    <>
      <h1 className="page-title">Co-Exhibitors</h1>
      <p className="page-sub">Add co-exhibitor companies and distribute your booked space and pass quotas to them.</p>

      {pendingCount > 0 && (
        <div className="note amber">
          <b className="title">{pendingCount} registration payment pending</b>
          The Separate co-exhibitor cannot receive pass quotas until the {money(EVENT.coexRegFee)} registration fee is paid.{' '}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={openCart}>
            <Icon name="shopping_cart" style={{ fontSize: 16 }} />Complete Payment
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-head-row">
          <h2 className="card-title">Co-Exhibitor List</h2>
          <Link className="btn btn-primary" to="/exhibitor/co-exhibitors/add"><Icon name="add" />Add New Co-Exhibitor</Link>
        </div>
        <div className="tablewrap"><table className="grid">
          <tbody>
            <tr><th>Sr.</th><th>Company</th><th>Type</th><th>Nodal Officer</th><th>Reg. No.</th><th>Status</th><th>Space</th><th>Action</th></tr>
            {state.coexhibitors.map((c, i) => (
              <tr key={c.id}>
                <td className="num">{i + 1}</td>
                <td><span className="td-strong">{c.company}</span><span className="td-sub">{c.email}</span></td>
                <td>{coexTypePill(c)}</td>
                <td>{c.type === 'separate' ? c.nodalFirst + ' ' + c.nodalLast : '—'}</td>
                <td className="num">{c.regNo ? <code>{c.regNo}</code> : '—'}</td>
                <td>{coexStatusPill(c)}</td>
                <td className="num">{coexSqm(state, c.id) ? coexSqm(state, c.id) + ' sqm' : '—'}</td>
                <td className="td-actions">
                  {c.type === 'separate' && c.status === 'payment_pending' && (
                    <button className="btn-link" style={{ color: 'var(--amber)' }} onClick={openCart}>Complete Payment</button>
                  )}
                  <button className="btn-link" onClick={() => setViewing(c)}>View</button>
                  <button className="btn-link danger" onClick={() => del(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {viewing && <CoexViewModal state={state} coex={viewing} onClose={() => setViewing(null)} />}
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
