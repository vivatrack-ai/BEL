import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useExhibitorState, actions, acftById } from '../../store/exhibitorStore.js';
import { ROLL_TYPES, MANOEUVRES, scrollToFirstError } from '../../lib.js';
import { Icon, Field, toast, FooterTools } from '../../components/ui.jsx';
import { AcftHeader, useDraft, resolveSel, continueWizard, readUpload } from './shared.jsx';

const HRS = Array.from({ length: 13 }, (_, i) => String(i));
const MINS = ['0', '15', '30', '45'];

export default function Air4() {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const list = state ? state.aircraft : [];
  const selId = list.length ? resolveSel(list, params.get('id'), 'air4') : null;
  const sel = selId ? acftById(state, selId) : null;

  const initial = useMemo(() => {
    const d = sel && sel.air4 ? sel.air4 : {};
    return {
      rollsAllowed: d.rollsAllowed || 'No',
      rollTypes: d.rollTypes || [],
      certType: d.certType || 'Normal',
      issuedBy: d.issuedBy || '', restrictions: d.restrictions || '',
      certNo: d.certNo || '', validUpto: d.validUpto || '', callSign: d.callSign || '',
      endHrs: d.endHrs != null ? String(d.endHrs) : '0', endMin: d.endMin != null ? String(d.endMin) : '0',
      manoeuvres: d.manoeuvres || [],
      fineDesc: d.fineDesc || '', fineBase: d.fineBase || '', fineVis: d.fineVis || '',
      badDesc: d.badDesc || '', badBase: d.badBase || '', badVis: d.badVis || '',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, state && sel && sel.air4 && sel.air4.savedAt]);

  const [form, setForm] = useState(initial);
  const [lastSel, setLastSel] = useState(selId);
  if (selId !== lastSel) { setLastSel(selId); setForm(initial); }

  const [manFile, setManFile] = useState(null);
  const [errs, setErrs] = useState({});
  const draft = useDraft('a4:' + (selId || 'x'), state ? state.acftDrafts : null, form, setForm);
  if (!state) return null;

  if (list.length === 0) {
    return (
      <>
        <AcftHeader active="air4" />
        <div className="card"><div className="empty">
          <Icon name="flight" /><h3>Register an aircraft first</h3>
          <p>This form auto-populates from the Aircraft Detail form.</p>
          <Link className="btn btn-primary" to="/exhibitor/aircraft/add"><Icon name="add" />Register Aircraft</Link>
        </div></div>
      </>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleIn = (k, v) => setForm({
    ...form,
    [k]: form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v],
  });
  const ta = (k) => (
    <textarea rows={k === 'restrictions' ? 3 : 2} value={form[k]} onChange={set(k)}
      style={{ width: '100%', border: '1px solid #CFD7E4', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '0.9rem' }} />
  );

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    ['issuedBy', 'restrictions', 'certNo', 'validUpto', 'callSign'].forEach((k) => { if (!String(form[k]).trim()) er[k] = 'Required'; });
    if (!manFile && !(sel.air4 && sel.air4.manoeuvresFile)) er.manoeuvres = 'Upload the manoeuvres document';
    if (form.manoeuvres.length === 0) er.man = 'Select at least one manoeuvre';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    await draft.clear();
    const existing = sel.air4 || {};
    const a = await actions.saveAircraftForm(selId, 'air4', {
      aircraftId: selId,
      rollsAllowed: form.rollsAllowed,
      rollTypes: form.rollsAllowed === 'Yes' ? form.rollTypes : [],
      manoeuvresFile: manFile ? manFile.name : existing.manoeuvresFile,
      manoeuvresData: manFile ? await readUpload(manFile) : existing.manoeuvresData,
      certType: form.certType, issuedBy: form.issuedBy.trim(), restrictions: form.restrictions.trim(),
      certNo: form.certNo.trim(), validUpto: form.validUpto, callSign: form.callSign.trim(),
      endHrs: form.endHrs, endMin: form.endMin, manoeuvres: form.manoeuvres,
      fineDesc: form.fineDesc.trim(), fineBase: form.fineBase.trim(), fineVis: form.fineVis.trim(),
      badDesc: form.badDesc.trim(), badBase: form.badBase.trim(), badVis: form.badVis.trim(),
    });
    toast('Form Air-4 saved for ' + a.model + ' — next step.', 'success');
    await continueWizard(a, navigate);
  };

  const radio = (name, value, label) => (
    <label className={'radio-card' + (form[name] === value ? ' selected' : '')} onClick={() => setForm({ ...form, [name]: value })}>
      <input type="radio" checked={form[name] === value} readOnly /><b>{label}</b>
    </label>
  );
  const selStyle = { flex: 1, border: '1px solid #CFD7E4', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit' };

  return (
    <>
      <AcftHeader active="air4" draftHint={draft.hint} />
      <div className="card">
        <h2 className="card-title">Flying Display (Form Air-4)</h2>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <Field label="Select Aircraft" required hint="Model auto-populated from the Aircraft Detail form.">
              <select value={selId} onChange={(e) => setParams({ id: e.target.value })}>
                {list.map((a) => <option key={a.id} value={a.id}>{a.model} ({a.make})</option>)}
              </select>
            </Field>
            <Field label="Reg No." required hint="Auto-populated from the Aircraft Detail form.">
              <input type="text" value={sel.regNo} readOnly />
            </Field>
            <div className="field full">
              <label>Are consecutive rolls allowed? <span className="req">*</span></label>
              <div className="radio-cards">
                {radio('rollsAllowed', 'Yes', 'Yes')}
                {radio('rollsAllowed', 'No', 'No')}
              </div>
            </div>
            {form.rollsAllowed === 'Yes' && (
              <div className="field full">
                <label>If yes, please select which one(s)</label>
                <div className="checks">
                  {ROLL_TYPES.map((rt) => (
                    <label key={rt} className={'check-item' + (form.rollTypes.includes(rt) ? ' selected' : '')}>
                      <input type="checkbox" checked={form.rollTypes.includes(rt)} onChange={() => toggleIn('rollTypes', rt)} />{rt}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Field label="Upload Manoeuvres" required error={errs.manoeuvres}
              hint={sel.air4 && sel.air4.manoeuvresFile ? 'Uploaded: ' + sel.air4.manoeuvresFile : undefined}>
              <input type="file" accept=".pdf,image/*" onChange={(e) => setManFile(e.target.files[0] || null)} />
            </Field>
            <div className="field">
              <label>Certificate Type <span className="req">*</span></label>
              <div className="radio-cards">
                {radio('certType', 'Normal', 'Normal')}
                {radio('certType', 'Restricted', 'Restricted')}
              </div>
            </div>
            <Field label="Issued By" required error={errs.issuedBy}><input type="text" value={form.issuedBy} onChange={set('issuedBy')} /></Field>
            <Field label="Stated Restrictions" required full error={errs.restrictions}>{ta('restrictions')}</Field>
            <Field label="Certificate No." required error={errs.certNo}><input type="text" value={form.certNo} onChange={set('certNo')} /></Field>
            <Field label="Valid Upto" required error={errs.validUpto}><input type="date" value={form.validUpto} onChange={set('validUpto')} /></Field>
            <Field label="Call Sign" required error={errs.callSign}><input type="text" value={form.callSign} onChange={set('callSign')} /></Field>
            <div className="field">
              <label>Estimated Safe Endurance at Take Off Display <span className="req">*</span></label>
              <div style={{ display: 'flex', gap: 10 }}>
                <select style={selStyle} value={form.endHrs} onChange={set('endHrs')}>{HRS.map((h) => <option key={h}>{h}</option>)}</select>
                <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>Hrs</span>
                <select style={selStyle} value={form.endMin} onChange={set('endMin')}>{MINS.map((m) => <option key={m}>{m}</option>)}</select>
                <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>Min</span>
              </div>
            </div>
            <Field label="Air Display Manoeuvres" required full error={errs.man}>
              <div className="checks">
                {MANOEUVRES.map((m) => (
                  <label key={m} className={'check-item' + (form.manoeuvres.includes(m) ? ' selected' : '')}>
                    <input type="checkbox" checked={form.manoeuvres.includes(m)} onChange={() => toggleIn('manoeuvres', m)} />{m}
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <h3 style={{ margin: '22px 0 8px' }}>Fine Weather</h3>
          <div className="form-grid">
            <Field label="Description" full>{ta('fineDesc')}</Field>
            <Field label="Minimum Required Cloud Base"><input type="text" value={form.fineBase} onChange={set('fineBase')} placeholder="e.g. 1500 ft" /></Field>
            <Field label="Minimum Required Cloud Visibility"><input type="text" value={form.fineVis} onChange={set('fineVis')} placeholder="e.g. 5 km" /></Field>
          </div>
          <h3 style={{ margin: '22px 0 8px' }}>Bad Weather</h3>
          <div className="form-grid">
            <Field label="Description" full>{ta('badDesc')}</Field>
            <Field label="Minimum Required Cloud Base"><input type="text" value={form.badBase} onChange={set('badBase')} /></Field>
            <Field label="Minimum Required Cloud Visibility"><input type="text" value={form.badVis} onChange={set('badVis')} /></Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Link className="btn btn-outline" to={'/exhibitor/aircraft/air7a?id=' + selId}><Icon name="arrow_back" />Back — Air-7A</Link>
            <button className="btn btn-primary" type="submit">
              <Icon name="save" />{sel.air4 ? 'Update & Continue' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
