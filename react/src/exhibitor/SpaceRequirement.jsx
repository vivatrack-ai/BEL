import { useState, useEffect } from 'react';
import { useExhibitorState, actions } from '../store/exhibitorStore.js';
import { SR_SETUP_TYPES, SR_SIDES_TYPES, SR_FLOOR_OPTS, SR_SIDE_OPTS, scrollToFirstError } from '../lib.js';
import { Icon, Field, Tile, toast, FooterTools } from '../components/ui.jsx';

const srKey = (t) => t.replace(/\W/g, '');

export default function SpaceRequirement() {
  const state = useExhibitorState();
  const [form, setForm] = useState(null); // {ShellSqm, ShellSides, ... ChaletFloors}
  const [errs, setErrs] = useState({});

  // Prefill from saved requirements (registration-time entries included)
  useEffect(() => {
    if (!state || form) return;
    const f = {};
    SR_SETUP_TYPES.forEach((t) => {
      const k = srKey(t);
      const r = state.spaceRequirements.find((x) => x.setupType === t);
      if (t === 'Chalet') f[k + 'Floors'] = r ? r.floors || '' : '';
      else {
        f[k + 'Sqm'] = r && r.sqm != null ? String(r.sqm) : '';
        if (SR_SIDES_TYPES.includes(t)) f[k + 'Sides'] = r && r.openSides ? r.openSides : SR_SIDE_OPTS[0];
      }
    });
    setForm(f);
  }, [state, form]);

  if (!state || !form) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const er = {};
    const staged = [];
    SR_SETUP_TYPES.forEach((t) => {
      const k = srKey(t);
      if (t === 'Chalet') {
        const floors = form[k + 'Floors'];
        staged.push({ type: t, wanted: !!floors, sqm: null, floors: floors || null, openSides: null });
      } else {
        const raw = (form[k + 'Sqm'] || '').trim();
        if (raw === '') { staged.push({ type: t, wanted: false }); return; }
        const sqm = parseInt(raw, 10);
        if (isNaN(sqm) || sqm <= 0) { er[k] = 'Enter a valid area in sqm'; return; }
        staged.push({
          type: t, wanted: true, sqm, floors: null,
          openSides: SR_SIDES_TYPES.includes(t) ? form[k + 'Sides'] : null,
        });
      }
    });
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    const { added, updated, removed } = await actions.saveSpaceRequirements(staged);
    const parts = [];
    if (added) parts.push(added + ' added');
    if (updated) parts.push(updated + ' updated');
    if (removed) parts.push(removed + ' removed');
    toast(parts.length ? 'Space requirements saved (' + parts.join(', ') + ')' : 'No changes to save', parts.length ? 'success' : undefined);
  };

  const totalSqm = state.spaceRequirements.reduce((a, r) => a + (r.sqm || 0), 0);

  return (
    <>
      <h1 className="page-title">Space Requirement</h1>
      <p className="page-sub">The details you provided <b>during registration</b> are pre-filled below. Fill or update any setup type and press Save — leave a field empty if that type is not required.</p>

      <div className="tiles">
        <Tile variant="blue" label="Total Requirements" value={state.spaceRequirements.length} />
        <Tile label="Total Space Requested" value={totalSqm.toLocaleString('en-IN')} suffix="sqm" />
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: 6 }}>Space Requirements — All Setup Types</h2>
        {SR_SETUP_TYPES.map((t) => {
          const k = srKey(t);
          const r = state.spaceRequirements.find((x) => x.setupType === t);
          const isChalet = t === 'Chalet';
          const hasSides = SR_SIDES_TYPES.includes(t);
          return (
            <div className="sr-row" key={t}>
              <div className="sr-type">
                <b>{t}</b>
                {r
                  ? <span className="td-sub">Submitted: {r.submittedAt}{r.modifiedAt ? ' · Modified: ' + r.modifiedAt : ''}</span>
                  : <span className="td-sub">Leave empty if not required</span>}
              </div>
              <div className="sr-inputs">
                {isChalet ? (
                  <Field label="Number of Floors" error={errs[k]}>
                    <select value={form[k + 'Floors']} onChange={set(k + 'Floors')}>
                      <option value="">Select Floors</option>
                      {SR_FLOOR_OPTS.map((fo) => <option key={fo}>{fo}</option>)}
                    </select>
                  </Field>
                ) : (
                  <Field label="Required Space (Sqm)" error={errs[k]}>
                    <input type="number" min="1" step="1" value={form[k + 'Sqm']} onChange={set(k + 'Sqm')} placeholder="e.g. 100" />
                  </Field>
                )}
                {hasSides && (
                  <Field label="Open Sides">
                    <select value={form[k + 'Sides']} onChange={set(k + 'Sides')}>
                      {SR_SIDE_OPTS.map((so) => <option key={so}>{so}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-primary" onClick={save}><Icon name="save" />Save Requirements</button>
        </div>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); setForm(null); toast('Demo data reset', 'success'); } }} />
    </>
  );
}
