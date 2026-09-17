import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useExhibitorState, actions, acftById } from '../../store/exhibitorStore.js';
import { scrollToFirstError } from '../../lib.js';
import { Icon, Field, toast, FooterTools } from '../../components/ui.jsx';
import { AcftHeader, useDraft, resolveSel, continueWizard } from './shared.jsx';

const dtSplit = (val) => { const p = String(val || '').split(/[T ]/); return [p[0] || '', p[1] || '']; };

export default function Air7A() {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const list = state ? state.aircraft : [];
  const selId = list.length ? resolveSel(list, params.get('id'), 'air7a') : null;
  const sel = selId ? acftById(state, selId) : null;

  const initial = useMemo(() => {
    const d = sel && sel.air7a ? sel.air7a : {};
    const [etaD, etaT] = dtSplit(d.eta);
    const [depD, depT] = dtSplit(d.departure);
    return {
      aircraftType: d.aircraftType || '', lastLanding: d.lastLanding || '',
      etaDate: etaD, etaTime: etaT, depDate: depD, depTime: depT,
      depAirfield: d.depAirfield || '', firstLanding: d.firstLanding || '',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, state && sel && sel.air7a && sel.air7a.savedAt]);

  const [form, setForm] = useState(initial);
  const [lastSel, setLastSel] = useState(selId);
  if (selId !== lastSel) { setLastSel(selId); setForm(initial); }

  const [errs, setErrs] = useState({});
  const draft = useDraft('a7a:' + (selId || 'x'), state ? state.acftDrafts : null, form, setForm);
  if (!state) return null;

  if (list.length === 0) {
    return (
      <>
        <AcftHeader active="air7a" />
        <div className="card"><div className="empty">
          <Icon name="flight" /><h3>Register an aircraft first</h3>
          <p>This form auto-populates from the Aircraft Detail form.</p>
          <Link className="btn btn-primary" to="/exhibitor/aircraft/add"><Icon name="add" />Register Aircraft</Link>
        </div></div>
      </>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    ['aircraftType', 'lastLanding', 'depAirfield', 'firstLanding'].forEach((k) => { if (!form[k].trim()) er[k] = 'Required'; });
    if (!form.etaDate || !form.etaTime) er.eta = 'Select both date and time';
    if (!form.depDate || !form.depTime) er.dep = 'Select both date and time';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    await draft.clear();
    const a = await actions.saveAircraftForm(selId, 'air7a', {
      aircraftId: selId,
      aircraftType: form.aircraftType.trim(), lastLanding: form.lastLanding.trim(),
      eta: form.etaDate + ' ' + form.etaTime, departure: form.depDate + ' ' + form.depTime,
      depAirfield: form.depAirfield.trim(), firstLanding: form.firstLanding.trim(),
    });
    toast('Form Air-7A saved for ' + a.model + ' — next step.', 'success');
    await continueWizard(a, navigate);
  };

  const dtPair = (label, dKey, tKey, errKey) => (
    <Field label={label} required error={errs[errKey]}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input type="date" style={{ flex: 1.3 }} value={form[dKey]} onChange={set(dKey)} />
        <input type="time" style={{ flex: 1 }} value={form[tKey]} onChange={set(tKey)} />
      </div>
    </Field>
  );

  return (
    <>
      <AcftHeader active="air7a" draftHint={draft.hint} />
      <div className="card">
        <h2 className="card-title">Aircraft Arrival Detail (Form Air-7A)</h2>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <Field label="Select Aircraft" required hint="Model auto-populated from the Aircraft Detail form.">
              <select value={selId} onChange={(e) => setParams({ id: e.target.value })}>
                {list.map((a) => <option key={a.id} value={a.id}>{a.model} ({a.make})</option>)}
              </select>
            </Field>
            <Field label="Aircraft Registration No." hint="Auto-populated from the Aircraft Detail form.">
              <input type="text" value={sel.regNo} readOnly />
            </Field>
            <Field label="Aircraft Type" required error={errs.aircraftType}>
              <input type="text" value={form.aircraftType} onChange={set('aircraftType')} />
            </Field>
            <Field label="Last Intermediate Landing Prior to Airbase" required error={errs.lastLanding}>
              <input type="text" value={form.lastLanding} onChange={set('lastLanding')} placeholder="e.g. Jaipur (VIJP)" />
            </Field>
            {dtPair('Date & ETA at Airbase', 'etaDate', 'etaTime', 'eta')}
            {dtPair('Departure Date & Time', 'depDate', 'depTime', 'dep')}
            <Field label="Airfield of Departure" required error={errs.depAirfield}>
              <input type="text" value={form.depAirfield} onChange={set('depAirfield')} />
            </Field>
            <Field label="First Landing in India" required error={errs.firstLanding}>
              <input type="text" value={form.firstLanding} onChange={set('firstLanding')} />
            </Field>
          </div>
          <p style={{ color: 'var(--red)', fontSize: '0.88rem', margin: '18px 0 0', maxWidth: 'none' }}>
            <b>Declaration:</b> We hereby agree to pay the landing &amp; parking fee for the above mentioned aircraft directly to organisers
            who collect these fees on behalf of the Official Ground Handling Agency.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Link className="btn btn-outline" to={'/exhibitor/aircraft/add?edit=' + selId}>
              <Icon name="arrow_back" />Back — Aircraft Detail
            </Link>
            <button className="btn btn-primary" type="submit">
              <Icon name="save" />{sel.air7a ? 'Update & Continue' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
