import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useExhibitorState, actions, acftById } from '../../store/exhibitorStore.js';
import { COUNTRIES, scrollToFirstError } from '../../lib.js';
import { Icon, Field, toast, FooterTools } from '../../components/ui.jsx';
import { AcftHeader, useDraft, resolveSel, continueWizard, readUpload } from './shared.jsx';

const TEXT_KEYS = ['purpose', 'overfly', 'atsRoutes', 'itinerary', 'timings', 'lastAirport', 'type', 'telephony',
  'pilotName', 'operatorName', 'address', 'permitNo', 'crew', 'passengers', 'goods', 'uplift', 'crew2', 'address2',
  'agentName', 'agentAddr'];

export default function Air7B() {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const list = state ? state.aircraft : [];
  const selId = list.length ? resolveSel(list, params.get('id'), 'air7b') : null;
  const sel = selId ? acftById(state, selId) : null;

  const initial = useMemo(() => {
    const d = sel && sel.air7b ? sel.air7b : {};
    const f = {};
    TEXT_KEYS.forEach((k) => { f[k] = d[k] || ''; });
    f.stateOfRegistry = d.stateOfRegistry || 'India';
    f.pilotNat = d.pilotNat || 'India';
    f.operatorNat = d.operatorNat || 'India';
    f.airdrop = d.airdrop || 'No'; f.seats30 = d.seats30 || 'No'; f.payload3t = d.payload3t || 'No';
    f.acas = d.acas || 'No'; f.noiseCert = d.noiseCert || 'No';
    return f;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, state && sel && sel.air7b && sel.air7b.savedAt]);

  const [form, setForm] = useState(initial);
  const [lastSel, setLastSel] = useState(selId);
  if (selId !== lastSel) { setLastSel(selId); setForm(initial); }

  const [dangerFile, setDangerFile] = useState(null);
  const [specialFile, setSpecialFile] = useState(null);
  const [errs, setErrs] = useState({});
  const draft = useDraft('a7b:' + (selId || 'x'), state ? state.acftDrafts : null, form, setForm);
  if (!state) return null;

  if (list.length === 0) {
    return (
      <>
        <AcftHeader active="air7b" />
        <div className="card"><div className="empty">
          <Icon name="flight" /><h3>Register an aircraft first</h3>
          <p>This form auto-populates from the Aircraft Detail form.</p>
          <Link className="btn btn-primary" to="/exhibitor/aircraft/add"><Icon name="add" />Register Aircraft</Link>
        </div></div>
      </>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ta = (k) => (
    <textarea rows={2} value={form[k]} onChange={set(k)}
      style={{ width: '100%', border: '1px solid #CFD7E4', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '0.9rem' }} />
  );
  const yesNo = (k) => (
    <div className="radio-cards">
      {['Yes', 'No'].map((v) => (
        <label key={v} className={'radio-card' + (form[k] === v ? ' selected' : '')} onClick={() => setForm({ ...form, [k]: v })}>
          <input type="radio" checked={form[k] === v} readOnly /><b>{v}</b>
        </label>
      ))}
    </div>
  );
  const countrySel = (k) => (
    <select value={form[k]} onChange={set(k)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
  );

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!form.purpose.trim()) er.purpose = 'Required';
    if (!form.type.trim()) er.type = 'Required';
    if (!form.pilotName.trim()) er.pilotName = 'Required';
    if (!form.operatorName.trim()) er.operatorName = 'Required';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    await draft.clear();
    const existing = sel.air7b || {};
    const data = { aircraftId: selId };
    TEXT_KEYS.forEach((k) => { data[k] = String(form[k]).trim(); });
    data.stateOfRegistry = form.stateOfRegistry;
    data.pilotNat = form.pilotNat; data.operatorNat = form.operatorNat;
    data.airdrop = form.airdrop; data.seats30 = form.seats30; data.payload3t = form.payload3t;
    data.acas = form.acas; data.noiseCert = form.noiseCert;
    data.dangerPermitFile = dangerFile ? dangerFile.name : existing.dangerPermitFile || '';
    data.dangerPermitData = dangerFile ? await readUpload(dangerFile) : existing.dangerPermitData;
    data.specialPermitFile = specialFile ? specialFile.name : existing.specialPermitFile || '';
    data.specialPermitData = specialFile ? await readUpload(specialFile) : existing.specialPermitData;
    const a = await actions.saveAircraftForm(selId, 'air7b', data);
    toast('AIR 7B & 9 saved for ' + a.model + '.', 'success');
    await continueWizard(a, navigate); // all steps done -> auto-submits for approval
  };

  return (
    <>
      <AcftHeader active="air7b" draftHint={draft.hint} />
      <div className="card">
        <h2 className="card-title">Application for DGCA Approval of Non-Schedule Flights (AIR 7B &amp; AIR 9)</h2>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <Field label="Purpose of Flights (VIP / Tourist / Cargo / Ambulance / Relief etc.)" required full error={errs.purpose}>
              <input type="text" value={form.purpose} onChange={set('purpose')} />
            </Field>
            <Field label="Whether over-flying / technical landing or landing in India for traffic purpose" full>
              <input type="text" value={form.overfly} onChange={set('overfly')} />
            </Field>
            <Field label="ATS Route(s) to be flown (incl. entry and exit points in India with time entering/exiting Indian airspace)" full>
              {ta('atsRoutes')}
            </Field>
            <Field label="Complete route itinerary of the flights with dates and timings (incl. true origin and true destination)" full>
              {ta('itinerary')}
            </Field>
            <Field label="Arrival and departure timings at airports in India, if any">
              <input type="text" value={form.timings} onChange={set('timings')} />
            </Field>
            <Field label="Airport of last departure before entering Indian airspace / first landing after leaving">
              <input type="text" value={form.lastAirport} onChange={set('lastAirport')} />
            </Field>
            <Field label="Select Aircraft" required hint="Model auto-populated from the Aircraft Detail form.">
              <select value={selId} onChange={(e) => setParams({ id: e.target.value })}>
                {list.map((a) => <option key={a.id} value={a.id}>{a.model} ({a.make})</option>)}
              </select>
            </Field>
            <Field label="Registration" hint="Auto-populated from the Aircraft Detail form.">
              <input type="text" value={sel.regNo} readOnly />
            </Field>
            <Field label="Type" required error={errs.type}><input type="text" value={form.type} onChange={set('type')} /></Field>
            <Field label="State of Registry / Nationality" required>{countrySel('stateOfRegistry')}</Field>
            <Field label="Telephony Designator (Flight Number or Call Sign)">
              <input type="text" value={form.telephony} onChange={set('telephony')} />
            </Field>
            <Field label="Whether the aircraft is capable of air-dropping">{yesNo('airdrop')}</Field>
            <Field label="Whether the max certified passenger seating capacity is more than 30 seats">{yesNo('seats30')}</Field>
            <Field label="Whether the maximum pay-load capacity is more than 3 tons">{yesNo('payload3t')}</Field>
            <Field label="Whether the aircraft is fitted with ACAS-II / TCAS-II">{yesNo('acas')}</Field>
            <Field label="Whether noise certificate available">{yesNo('noiseCert')}</Field>
            <Field label="Pilot Name" required error={errs.pilotName}><input type="text" value={form.pilotName} onChange={set('pilotName')} /></Field>
            <Field label="Pilot Nationality">{countrySel('pilotNat')}</Field>
            <Field label="Aircraft Operator Name" required error={errs.operatorName}>
              <input type="text" value={form.operatorName} onChange={set('operatorName')} />
            </Field>
            <Field label="Operator Nationality">{countrySel('operatorNat')}</Field>
            <Field label="Address (with Telephone / Fax No.)" full>{ta('address')}</Field>
          </div>

          <h3 style={{ margin: '22px 0 8px' }}>Onboard Details</h3>
          <div className="form-grid">
            <Field label="Aircraft operator's certificate / permit number, if any">
              <input type="text" value={form.permitNo} onChange={set('permitNo')} />
            </Field>
            <Field label="Number of Crew"><input type="number" min="0" value={form.crew} onChange={set('crew')} /></Field>
            <Field label="Number of passengers, if any"><input type="number" min="0" value={form.passengers} onChange={set('passengers')} /></Field>
            <Field label="General description of goods carried, if any">
              <input type="text" value={form.goods} onChange={set('goods')} />
            </Field>
            <Field full label="Any arms, ammunition, explosives, radioactive material, war equipment or dangerous goods? If so, attach a copy of DGCA permit."
              hint={sel.air7b && sel.air7b.dangerPermitFile ? 'Uploaded: ' + sel.air7b.dangerPermitFile : undefined}>
              <input type="file" accept=".pdf,image/*" onChange={(e) => setDangerFile(e.target.files[0] || null)} />
            </Field>
            <Field full label="Any special equipment like aerial photography, remote sensing cameras, night vision cameras on board? If so, attach a copy of DGCA permit."
              hint={sel.air7b && sel.air7b.specialPermitFile ? 'Uploaded: ' + sel.air7b.specialPermitFile : undefined}>
              <input type="file" accept=".pdf,image/*" onChange={(e) => setSpecialFile(e.target.files[0] || null)} />
            </Field>
            <Field label="Number of passengers or tonnage of cargo to be uplifted from and set down in India">
              <input type="text" value={form.uplift} onChange={set('uplift')} />
            </Field>
            <Field label="Number of Crew (uplift)"><input type="number" min="0" value={form.crew2} onChange={set('crew2')} /></Field>
            <Field label="Address (with Telephone / Fax No.)" full>{ta('address2')}</Field>
          </div>

          <h3 style={{ margin: '22px 0 8px' }}>Travel / Cargo Agent in India</h3>
          <div className="form-grid">
            <Field label="Name"><input type="text" value={form.agentName} onChange={set('agentName')} /></Field>
            <Field label="Address (with Telephone / Fax No.)" full>{ta('agentAddr')}</Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Link className="btn btn-outline" to={'/exhibitor/aircraft/air4?id=' + selId}><Icon name="arrow_back" />Back — Air-4</Link>
            <button className="btn btn-primary" type="submit">
              <Icon name="check_circle" />{sel.air7b ? 'Update & Finish' : 'Save & Submit Application'}
            </button>
          </div>
        </form>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
