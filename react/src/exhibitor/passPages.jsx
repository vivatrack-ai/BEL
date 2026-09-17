import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExhibitorState, actions, catTotal, usedByExhibitor, exhibitorBalance } from '../store/exhibitorStore.js';
import { money } from '../lib.js';
import { toast, FooterTools } from '../components/ui.jsx';
import { PassFormModal, SendLinkModal, ViewPassesModal, VehicleFormModal } from './passModals.jsx';

/* One category row — Type · Area-wise (free) · Paid · Total · Balance · Actions */
function CatRow({ state, cat, i, section, coexLabel, onAction }) {
  const total = catTotal(cat);
  const used = usedByExhibitor(state, cat.id) + state.passes.filter((p) => p.catId === cat.id && p.coexId).length;
  const bal = exhibitorBalance(state, cat.id);
  const pct = total ? Math.round((used / total) * 100) : 0;
  return (
    <tr>
      <td className="num">{i + 1}</td>
      <td><span className="td-strong">{cat.name}</span></td>
      <td className="num">{cat.free}</td>
      <td className="num">{cat.paid}</td>
      <td className="num">{total}</td>
      <td><div className="usage"><div className="bar"><i style={{ width: pct + '%' }}></i></div><span>{bal} left</span></div></td>
      <td className="td-actions">
        <button className="btn-link" onClick={() => onAction('view', cat)}>View Passes</button>
        <Link className="btn-link" to={'/exhibitor/passes/' + section + '/coex/' + cat.id}>{coexLabel || 'Co-Exhibitors'}</Link>
        <button className="btn-link" onClick={() => onAction('add', cat)}>Add New</button>
        {cat.kind !== 'vehicle' && (
          <button className="btn-link" onClick={() => onAction('link', cat)}>
            {cat.kind === 'invitee' ? 'Invitee Link' : 'Send Link'}
          </button>
        )}
      </td>
    </tr>
  );
}

/* Modal manager shared by the three listing pages */
export function usePassModals(state) {
  const [modal, setModal] = useState(null); // {kind, catId, coexId}
  const open = (kind, cat, coexId) => setModal({ kind, catId: cat.id || cat, coexId: coexId || null });
  const close = () => setModal(null);
  const node = !modal ? null : (
    modal.kind === 'view' ? <ViewPassesModal state={state} catId={modal.catId} coexId={modal.coexId} onClose={close} /> :
    modal.kind === 'link' ? <SendLinkModal state={state} catId={modal.catId} coexId={modal.coexId} onClose={close} /> :
    modal.kind === 'veh' ? <VehicleFormModal state={state} catId={modal.catId} coexId={modal.coexId} onClose={close} /> :
    <PassFormModal state={state} catId={modal.catId} coexId={modal.coexId} onClose={close}
      onCarPass={() => {
        const vehCat = state.categories.find((c) => c.kind === 'vehicle');
        setModal({ kind: 'veh', catId: vehCat.id, coexId: modal.coexId });
      }} />
  );
  return { open, node };
}

const resetFooter = () => (
  <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
);

/* ================= Badge Details ================= */
export function Badges() {
  const state = useExhibitorState();
  const modals = usePassModals(state);
  if (!state) return null;
  const badgeCats = state.categories.filter((c) => c.kind === 'badge');
  const totals = badgeCats.reduce((a, c) => {
    a.total += catTotal(c);
    a.used += usedByExhibitor(state, c.id) + state.passes.filter((p) => p.catId === c.id && p.coexId).length;
    return a;
  }, { total: 0, used: 0 });

  const onAction = (kind, cat) => {
    if (kind === 'add' && exhibitorBalance(state, cat.id) <= 0) {
      toast('No balance left in this category. Reduce co-exhibitor quota or contact the organiser.', 'error');
      return;
    }
    modals.open(kind, cat);
  };

  return (
    <>
      <h1 className="page-title">Badge Details</h1>
      <p className="page-sub">Category-wise badge quota. Allocate quota to co-exhibitors, register your team, or send e-invitee links.</p>
      <div className="tiles">
        <div className="tile blue"><div className="t-label">Total Quota</div><div className="t-value">{totals.total}</div></div>
        <div className="tile"><div className="t-label">Used</div><div className="t-value">{totals.used}</div></div>
        <div className="tile accent"><div className="t-label">Available</div><div className="t-value">{totals.total - totals.used}</div></div>
      </div>
      <div className="card">
        <div className="card-head-row"><h2 className="card-title">Category-wise List</h2></div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>Sr.</th><th>Type of Category</th><th>Area Wise (Free)</th><th>Paid Badges</th><th>Total Badges</th><th>Balance</th><th>Action</th></tr>
          {badgeCats.map((c, i) => <CatRow key={c.id} state={state} cat={c} i={i} section="badges" onAction={onAction} />)}
        </tbody></table></div>
      </div>
      {modals.node}
      {resetFooter()}
    </>
  );
}

/* ================= Exhibitor Invitee Details ================= */
export function Invitee() {
  const state = useExhibitorState();
  const modals = usePassModals(state);
  if (!state) return null;
  const cats = state.categories.filter((c) => c.kind === 'invitee');

  return (
    <>
      <h1 className="page-title">Exhibitor Invitee Details</h1>
      <p className="page-sub">Invitee passes for your guests. Registration is date-wise for each event day.</p>
      <div className="note green">
        <b className="title">Auto-allocated on space booking</b>
        On confirmation of your space booking, Exhibitor Invitee category passes were automatically allocated to you.
        Badge registrations are <b>date-wise</b> — each invitee selects entry date(s): 11th, 12th &amp; 13th Feb 2027.
      </div>
      <div className="card">
        <div className="card-head-row"><h2 className="card-title">Listing View</h2></div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>No.</th><th>Category Name</th><th>Area Wise (Total)</th><th>Paid</th><th>Total Badges</th><th>Balance</th><th>Action</th></tr>
          {cats.map((c, i) => <CatRow key={c.id} state={state} cat={c} i={i} section="invitee" onAction={(k, cat) => modals.open(k, cat)} />)}
        </tbody></table></div>
      </div>
      {modals.node}
      {resetFooter()}
    </>
  );
}

/* ================= Vehicle Pass Details ================= */
export function Vehicle() {
  const state = useExhibitorState();
  const modals = usePassModals(state);
  if (!state) return null;
  const cats = state.categories.filter((c) => c.kind === 'vehicle');

  return (
    <>
      <h1 className="page-title">Vehicle Pass Details</h1>
      <p className="page-sub">Vehicle parking passes. 6-seater {money(3500)} · 12-seater {money(5000)} when purchased beyond complimentary quota.</p>
      <div className="card">
        <div className="card-head-row"><h2 className="card-title">Vehicle Pass List</h2></div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>No.</th><th>Category Name</th><th>Area Wise (Free)</th><th>Paid</th><th>Total Passes</th><th>Balance</th><th>Action</th></tr>
          {cats.map((c, i) => (
            <CatRow key={c.id} state={state} cat={c} i={i} section="vehicle" coexLabel="Co-Exhibitor"
              onAction={(k, cat) => modals.open(k === 'add' ? 'veh' : k, cat)} />
          ))}
        </tbody></table></div>
      </div>
      {modals.node}
      {resetFooter()}
    </>
  );
}
