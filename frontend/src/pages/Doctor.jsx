import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { Badge, Button, ErrorNotice, Field, PageHeader, Panel, SelectField, TextArea, today } from '../components/UI.jsx';
import ModuleSubnav from '../components/ModuleSubnav.jsx';

const sections = [
  { id: 'consultation', label: 'Visit notes & vitals' },
  { id: 'prescription', label: 'Prescription' },
  { id: 'history', label: 'Patient history' },
];
const blankMedicine = () => ({ medicineId: '', medicineName: '', dose: '', frequency: '', duration: '', instructions: '', quantity: '1' });
const blankVitals = { bp: '', pulse: '', temperature: '', weight: '', spo2: '' };
function errorMessage(error) {
  const details = error.details?.map((issue) => `${issue.path?.join('.') || 'form'}: ${issue.message}`).join('; ');
  return details ? `${error.message}: ${details}` : error.message;
}

export default function Doctor() {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const view = sections.some((section) => section.id === requestedView) ? requestedView : 'consultation';
  const [tokens, setTokens] = useState([]); const [patients, setPatients] = useState([]); const [patient, setPatient] = useState(null); const [token, setToken] = useState(null); const [history, setHistory] = useState(null);
  const [form, setForm] = useState({ complaints: '', investigation: '', diagnosis: '', icdCode: '', examination: blankVitals, medicines: [blankMedicine()] });
  const [icdSearch, setIcdSearch] = useState(''); const [icdOptions, setIcdOptions] = useState([]); const [medicineOptions, setMedicineOptions] = useState({});
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);

  useEffect(() => {
    get('/reception/tokens').then(({ data }) => setTokens(data.filter((item) => ['waiting', 'in-consultation'].includes(item.status)))).catch((e) => setError(e.message));
    get('/reception/patients?page=1&pageSize=100').then(({ data }) => setPatients(data)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const search = icdSearch.trim();
    if (search.length < 2) { setIcdOptions([]); return; }
    const timer = setTimeout(() => get(`/doctor/icd-codes?search=${encodeURIComponent(search)}`).then(({ data }) => setIcdOptions(data)).catch(() => {}), 180);
    return () => clearTimeout(timer);
  }, [icdSearch]);
  useEffect(() => {
    const patientId = searchParams.get('patientId');
    if (!patientId) return;
    get(`/reception/patients/${patientId}/history`).then((result) => { setPatient(result.patient); setToken(null); setHistory(result.visits); }).catch((e) => setError(errorMessage(e)));
  }, [searchParams]);

  async function selectToken(id) {
    const found = tokens.find((item) => item.id === id) || null; setToken(found);
    if (found) { const result = await get(`/reception/patients/${found.patient_id}/history`); setPatient(result.patient); setHistory(result.visits); }
    else { setPatient(null); setHistory(null); }
  }
  async function selectPatient(id) {
    const found = patients.find((item) => item.id === id) || null; setPatient(found); setToken(null);
    if (found) { const result = await get(`/reception/patients/${found.id}/history`); setHistory(result.visits); }
    else setHistory(null);
  }
  function updateVital(key, value) { setForm((current) => ({ ...current, examination: { ...current.examination, [key]: value } })); }
  function updateMedicine(index, key, value) {
    setForm((current) => ({ ...current, medicines: current.medicines.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
    if (key === 'medicineName' && value.length > 1) {
      const timer = setTimeout(() => get(`/doctor/medicines?search=${encodeURIComponent(value)}`).then(({ data }) => setMedicineOptions((all) => ({ ...all, [index]: data }))).catch(() => {}), 150);
      return () => clearTimeout(timer);
    }
  }
  async function save(event) {
    event.preventDefault();
    if (!patient) { setError('Select a patient to save this visit.'); return; }
    setError(''); setSaving(true);
    try {
      const medicines = form.medicines
        .filter((medicine) => medicine.medicineName && medicine.dose && medicine.frequency && medicine.duration)
        .map((medicine) => ({ ...medicine, medicineId: medicine.medicineId || null }));
      await post('/doctor/visits', { patientId: patient.id, tokenId: token?.id, complaints: form.complaints, investigation: form.investigation, examination: form.examination, diagnosis: form.diagnosis, icdCode: form.icdCode || null, medicines });
      setForm({ complaints: '', investigation: '', diagnosis: '', icdCode: '', examination: blankVitals, medicines: [blankMedicine()] });
      setIcdSearch(''); setIcdOptions([]); setMedicineOptions({});
      try { const historyResult = await get(`/reception/patients/${patient.id}/history`); setHistory(historyResult.visits); }
      catch (historyError) { setError(`Prescription saved, but patient history could not refresh: ${historyError.message}`); }
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  return <>
    <div className="no-print">
      <PageHeader eyebrow="Doctor workspace" title="Consultation" description="Review the patient’s journey, capture today’s findings, and leave a clear plan for care." action={<Badge tone="blue">Clinical notes</Badge>} />
      <ModuleSubnav basePath="/doctor" sections={sections} defaultView="consultation" />
      <ErrorNotice error={error} />
      <div className="mb-5 max-w-2xl rounded-2xl border border-line bg-white p-4">
        <SelectField label="Registered patient" value={patient?.id || ''} onChange={(e) => {
          const id = e.target.value;
          const matchingToken = tokens.find((item) => item.patient_id === id);
          if (matchingToken) selectToken(matchingToken.id);
          else if (id) selectPatient(id);
          else { setToken(null); setPatient(null); setHistory(null); }
        }}>
          <option value="">Select a patient</option>
          {patients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.uhid}</option>)}
        </SelectField>
      </div>
      {patient && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest-100 bg-forest-50 p-4"><div><p className="font-display text-lg font-bold text-forest-800">{patient.name}</p><p className="mt-1 text-xs text-forest-800/70">{patient.uhid} · {patient.age} years · {patient.gender} · {patient.place} · {patient.phone}</p></div><Badge>{token ? `Token #${token.token_number}` : 'Walk-in visit'}</Badge></div>}
    </div>

    {view === 'consultation' && <div className="space-y-5">
      <Panel title="Visit notes" subtitle={`Visit date · ${token?.token_date || today()}`}><div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextArea label="Complaints" placeholder="What brought the patient in today?" value={form.complaints} onChange={(e) => setForm({ ...form, complaints: e.target.value })} />
        <TextArea label="Investigation" placeholder="Tests ordered or reviewed" value={form.investigation} onChange={(e) => setForm({ ...form, investigation: e.target.value })} />
        <TextArea label="Diagnosis" placeholder="Clinical impression and assessment" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
        <div className="relative"><Field label="ICD code" placeholder="Search code or condition" value={icdSearch || form.icdCode} onChange={(e) => { setIcdSearch(e.target.value); setForm({ ...form, icdCode: '' }); }} /><div className="mt-1 text-[10px] text-muted">{form.icdCode && icdOptions.find((option) => option.code === form.icdCode)?.description}</div>{icdOptions.length > 0 && <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl">{icdOptions.map((option) => <button type="button" key={option.code} onClick={() => { setForm({ ...form, icdCode: option.code }); setIcdSearch(''); setIcdOptions([]); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-forest-50"><span className="font-mono text-xs font-bold text-forest-700">{option.code}</span><span className="ml-2 text-xs text-ink">{option.description}</span></button>)}</div>}</div>
      </div></Panel>
      <Panel title="Examination & vitals" subtitle="Record today’s measurements"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['bp', 'Blood pressure', 'mmHg'], ['pulse', 'Pulse', 'bpm'], ['temperature', 'Temperature', '°C'], ['weight', 'Weight', 'kg'], ['spo2', 'SpO₂', '%']].map(([key, label, unit]) => <Field key={key} label={label} placeholder={unit} value={form.examination[key]} onChange={(e) => updateVital(key, e.target.value)} />)}</div></Panel>
    </div>}

    {view === 'prescription' && <form onSubmit={save}><Panel title="Prescription" subtitle="Add medicines and instructions">
      <div className="space-y-4">{form.medicines.map((medicine, index) => <div key={index} className="rounded-xl border border-line p-3.5">
        <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold">Medicine {index + 1}</p>{form.medicines.length > 1 && <button type="button" onClick={() => setForm({ ...form, medicines: form.medicines.filter((_, idx) => idx !== index) })} className="text-xs text-rose-600">Remove</button>}</div>
        <div className="relative"><Field label="Medicine" placeholder="Type a medicine name" value={medicine.medicineName} onChange={(e) => updateMedicine(index, 'medicineName', e.target.value)} />{medicineOptions[index]?.length > 0 && <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl">{medicineOptions[index].map((item) => <button type="button" key={item.id} onClick={() => { const copy = [...form.medicines]; copy[index] = { ...copy[index], medicineId: item.id, medicineName: item.name }; setForm({ ...form, medicines: copy }); setMedicineOptions({ ...medicineOptions, [index]: [] }); }} className="flex w-full justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-forest-50"><span>{item.name}</span><span className="text-muted">Stock {item.stock}</span></button>)}</div>}</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Dose" placeholder="1 tablet" value={medicine.dose} onChange={(e) => updateMedicine(index, 'dose', e.target.value)} /><Field label="Frequency" placeholder="Twice a day" value={medicine.frequency} onChange={(e) => updateMedicine(index, 'frequency', e.target.value)} /><Field label="Duration" placeholder="7 days" value={medicine.duration} onChange={(e) => updateMedicine(index, 'duration', e.target.value)} /><Field label="Quantity to dispense" type="number" min=".01" step=".01" value={medicine.quantity} onChange={(e) => updateMedicine(index, 'quantity', e.target.value)} /><Field className="sm:col-span-2" label="Instructions" placeholder="After food" value={medicine.instructions} onChange={(e) => updateMedicine(index, 'instructions', e.target.value)} /></div>
      </div>)}
        <Button type="button" variant="secondary" onClick={() => setForm({ ...form, medicines: [...form.medicines, blankMedicine()] })}>＋ Add medicine</Button>
        <div className="border-t border-line pt-4"><Button type="submit" className="w-full" disabled={!patient || saving}>{saving ? 'Saving visit…' : 'Save visit & prescription'}<span>→</span></Button></div>
      </div>
    </Panel></form>}

    {view === 'history' && <Panel title="Patient history" subtitle={patient ? `${patient.name} · ${patient.uhid}` : 'Select a patient or queue token to view previous visits'}>
      {history?.length ? <div className="grid gap-3 md:grid-cols-2">{history.map((visit) => <article key={visit.id} className="rounded-xl bg-canvas p-4"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(visit.visit_date))}</p>{visit.icd_code && <Badge tone="blue">{visit.icd_code}</Badge>}</div><p className="mt-2 text-xs text-muted">{visit.complaints || 'No complaints recorded'}</p><p className="mt-1 text-xs"><span className="font-semibold">Diagnosis:</span> {visit.diagnosis || '—'}</p>{visit.prescription_id && <Link to={`/doctor/prescriptions/${visit.prescription_id}?patientId=${patient?.id || ''}`} className="mt-3 inline-block text-xs font-semibold text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-900">View prescription →</Link>}</article>)}</div> : <p className="py-5 text-center text-xs text-muted">{patient ? 'No previous visits are recorded.' : 'Choose a patient above to load their visit history.'}</p>}
    </Panel>}
  </>;
}
