import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, patch, post } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorNotice, Field, PageHeader, Panel, SelectField, SuccessNotice, Table, money, today } from '../components/UI.jsx';
import ModuleSubnav from '../components/ModuleSubnav.jsx';
import ClinicLetterhead from '../components/ClinicLetterhead.jsx';

const sections = [
  { id: 'today', label: "Today's procedures", roles: ['Admin', 'Therapist', 'Accountant', 'Doctor'] },
  { id: 'schedule', label: 'Schedule a plan', roles: ['Admin', 'Therapist', 'Doctor'] },
  { id: 'billing', label: 'Procedure billing', roles: ['Admin', 'Therapist', 'Accountant'] },
  { id: 'catalog', label: 'Procedure catalog', roles: ['Admin'] },
];

export default function Procedures() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'today';
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [catalog, setCatalog] = useState([]); const [therapists, setTherapists] = useState([]); const [sessions, setSessions] = useState([]); const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState(''); const [selectedPatient, setSelectedPatient] = useState(null); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [lastBill, setLastBill] = useState(null); const [clinic, setClinic] = useState(null);
  const [plan, setPlan] = useState({ procedureId: '', therapistId: '', startDate: today(), sessionCount: 7, intervalDays: 1, packagePrice: '', notes: '' });
  const [bill, setBill] = useState({ planId: '', billingType: 'session', sessionCount: 1, subtotal: '', discount: '0', gstRate: '', amountPaid: '', paymentMode: 'cash' });
  const [newProcedure, setNewProcedure] = useState({ name: '', description: '', defaultSessions: 1, sessionPrice: '', defaultGstRate: '0' });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [cat, staff, day] = await Promise.all([get('/procedures/catalog'), get('/procedures/therapists'), get(`/procedures/sessions?date=${today()}`)]);
    setCatalog(cat.data); setTherapists(staff.data); setSessions(day.data);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    get('/reception/patients?page=1&pageSize=100').then(({ data }) => setPatients(data)).catch(() => {});
    get('/clinic').then(setClinic).catch(() => {});
  }, []);
  useEffect(() => {
    if (!patientSearch) return;
    const timer = setTimeout(() => get(`/reception/patients?search=${encodeURIComponent(patientSearch)}&pageSize=20`).then(({ data }) => setPatients(data)).catch(() => {}), 200);
    return () => clearTimeout(timer);
  }, [patientSearch]);
  async function schedule(event) {
    event.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    try {
      const { plan: created } = await post('/procedures/plans', { patientId: selectedPatient?.id, procedureId: plan.procedureId, therapistId: plan.therapistId || null, startDate: plan.startDate, sessionCount: Number(plan.sessionCount), intervalDays: Number(plan.intervalDays), packagePrice: plan.packagePrice === '' ? null : Number(plan.packagePrice), notes: plan.notes });
      setSuccess(`Therapy plan scheduled across ${created.session_count} sessions.`); setPlan({ ...plan, notes: '' }); await refresh();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function setStatus(session, status) {
    setError('');
    try { await patch(`/procedures/sessions/${session.id}`, { status }); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function createBill(event) {
    event.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    try {
      const { bill: created } = await post('/procedures/bills', { patientId: selectedPatient?.id || bill.patientId, planId: bill.planId || null, billingType: bill.billingType, sessionCount: Number(bill.sessionCount || 1), subtotal: bill.subtotal === '' ? undefined : Number(bill.subtotal), discount: Number(bill.discount || 0), gstRate: bill.gstRate === '' ? undefined : Number(bill.gstRate), amountPaid: Number(bill.amountPaid || 0), paymentMode: bill.paymentMode });
      setLastBill({ ...created, patientName: selectedPatient?.name || '', patientUhid: selectedPatient?.uhid || '' }); setSuccess(`Procedure receipt ${created.receipt_number} saved. Total ${created.total}.`);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function addProcedure(event) {
    event.preventDefault(); setError('');
    try {
      await post('/procedures/catalog', { ...newProcedure, defaultSessions: Number(newProcedure.defaultSessions), sessionPrice: Number(newProcedure.sessionPrice || 0), defaultGstRate: Number(newProcedure.defaultGstRate || 0) });
      setSuccess('Procedure added to the catalog.'); setNewProcedure({ name: '', description: '', defaultSessions: 1, sessionPrice: '', defaultGstRate: '0' }); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function updatePrice(item, sessionPrice, defaultGstRate) {
    try {
      await patch(`/procedures/catalog/${item.id}`, { sessionPrice: Number(sessionPrice), defaultGstRate: Number(defaultGstRate), defaultSessions: item.default_sessions });
      await refresh(); setSuccess(`${item.name} pricing saved.`);
    } catch (e) { setError(e.message); }
  }
  const visiblePatients = patients.filter((item) => !patientSearch || `${item.name} ${item.uhid} ${item.phone}`.toLowerCase().includes(patientSearch.toLowerCase()));

  return <>
    <PageHeader eyebrow="Panchakarma & therapies" title="Therapies" description="Plan care across days, coordinate therapists, and keep each session up to date." action={<Badge>{today()}</Badge>} />
    <ModuleSubnav basePath="/procedures" sections={sections} defaultView="today" />
    <ErrorNotice error={error} /><SuccessNotice>{success}</SuccessNotice>

    {view === 'today' && <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs text-muted">Today’s sessions</p><p className="mt-2 font-display text-2xl font-bold">{sessions.length}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs text-muted">Scheduled / in progress</p><p className="mt-2 font-display text-2xl font-bold text-forest-700">{sessions.filter((item) => item.status === 'scheduled' || item.status === 'in-progress').length}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs text-muted">Completed today</p><p className="mt-2 font-display text-2xl font-bold">{sessions.filter((item) => item.status === 'completed').length}</p></div></div>
      <Panel title="Today’s procedure sessions" subtitle="Status and therapist assignment"><Table columns={[
        { key: 'patient_name', label: 'Patient', render: (item) => <div><p className="font-semibold">{item.patient_name}</p><p className="text-[10px] text-muted">{item.uhid}</p></div> },
        { key: 'procedure_name', label: 'Procedure' }, { key: 'therapist_name', label: 'Therapist', render: (item) => item.therapist_name || 'Unassigned' },
        { key: 'session_date', label: 'Session', render: (item) => new Date(item.session_date).toLocaleDateString('en-IN') },
        { key: 'status', label: 'Status', render: (item) => <Badge tone={item.status === 'completed' ? 'green' : item.status === 'in-progress' ? 'blue' : 'amber'}>{item.status}</Badge> },
        { key: 'action', label: 'Update', render: (item) => item.status === 'scheduled' ? <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => setStatus(item, 'in-progress')}>Start</Button> : item.status === 'in-progress' ? <Button className="px-3 py-1.5 text-xs" onClick={() => setStatus(item, 'completed')}>Complete</Button> : <span className="text-xs text-muted">—</span> },
      ]} rows={sessions} empty="No procedures scheduled for today." /></Panel>
    </>}

    {view === 'schedule' && <Panel title="Schedule a therapy plan" subtitle="Create sessions for one patient across multiple days">
      <div className="mb-4 grid gap-3 sm:grid-cols-2"><Field label="Find patient" placeholder="Name, phone or UHID" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} /><SelectField label="Patient" value={selectedPatient?.id || ''} onChange={(e) => setSelectedPatient(patients.find((item) => item.id === e.target.value) || null)}><option value="">Select patient</option>{visiblePatients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.uhid}</option>)}</SelectField></div>
      {selectedPatient && <p className="mb-4 rounded-xl bg-forest-50 px-3 py-2 text-xs font-semibold text-forest-800">{selectedPatient.name} · {selectedPatient.uhid}</p>}
      <form onSubmit={schedule} className="grid gap-3 sm:grid-cols-2">
        <SelectField required label="Procedure" value={plan.procedureId} onChange={(e) => setPlan({ ...plan, procedureId: e.target.value })}><option value="">Select therapy</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.default_sessions} sessions</option>)}</SelectField>
        <SelectField label="Therapist" value={plan.therapistId} onChange={(e) => setPlan({ ...plan, therapistId: e.target.value })}><option value="">Assign later</option>{therapists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <Field required type="date" label="First session" value={plan.startDate} onChange={(e) => setPlan({ ...plan, startDate: e.target.value })} />
        <Field required type="number" min="1" max="90" label="Number of sessions" value={plan.sessionCount} onChange={(e) => setPlan({ ...plan, sessionCount: e.target.value })} />
        <Field required type="number" min="1" max="90" label="Days between sessions" value={plan.intervalDays} onChange={(e) => setPlan({ ...plan, intervalDays: e.target.value })} />
        <Field type="number" min="0" step=".01" label="Package price (optional)" value={plan.packagePrice} onChange={(e) => setPlan({ ...plan, packagePrice: e.target.value })} />
        <Field className="sm:col-span-2" label="Notes" value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
        <Button className="sm:col-span-2" disabled={!selectedPatient || saving}>{saving ? 'Scheduling…' : 'Schedule plan & sessions'}</Button>
      </form>
    </Panel>}

    {view === 'billing' && <Panel title="Procedure billing" subtitle="Bill an individual session or a full package">
      <div className="mb-4 grid gap-3 sm:grid-cols-2"><Field label="Find patient" placeholder="Name, phone or UHID" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} /><SelectField label="Patient" value={selectedPatient?.id || ''} onChange={(e) => setSelectedPatient(patients.find((item) => item.id === e.target.value) || null)}><option value="">Select patient</option>{visiblePatients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.uhid}</option>)}</SelectField></div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={createBill}>
        <Field label="Plan ID (optional)" placeholder="Plan UUID" value={bill.planId} onChange={(e) => setBill({ ...bill, planId: e.target.value })} />
        <SelectField label="Billing type" value={bill.billingType} onChange={(e) => setBill({ ...bill, billingType: e.target.value })}><option value="session">Per session</option><option value="package">Package</option></SelectField>
        <Field type="number" min="1" label="Sessions billed" value={bill.sessionCount} onChange={(e) => setBill({ ...bill, sessionCount: e.target.value })} />
        <Field type="number" min="0" step=".01" label="Subtotal override (optional)" value={bill.subtotal} onChange={(e) => setBill({ ...bill, subtotal: e.target.value })} />
        <Field type="number" min="0" step=".01" label="Discount" value={bill.discount} onChange={(e) => setBill({ ...bill, discount: e.target.value })} />
        <Field type="number" min="0" max="100" step=".01" label="GST override % (optional)" value={bill.gstRate} onChange={(e) => setBill({ ...bill, gstRate: e.target.value })} />
        <Field type="number" min="0" step=".01" label="Amount received" value={bill.amountPaid} onChange={(e) => setBill({ ...bill, amountPaid: e.target.value })} />
        <SelectField label="Payment mode" value={bill.paymentMode} onChange={(e) => setBill({ ...bill, paymentMode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank-transfer">Bank transfer</option></SelectField>
        {!selectedPatient && <Field className="sm:col-span-2" label="Patient UUID" value={bill.patientId || ''} onChange={(e) => setBill({ ...bill, patientId: e.target.value })} />}
        <Button className="sm:col-span-2" disabled={saving || (!selectedPatient && !bill.patientId)}>{saving ? 'Saving receipt…' : 'Create procedure receipt'}</Button>
      </form>
      {lastBill && <div className="mt-3 flex items-center justify-between rounded-xl bg-forest-50 px-3 py-2.5 text-xs"><span className="font-semibold text-forest-800">{lastBill.receipt_number} · {money(lastBill.total)}</span><Button type="button" variant="soft" className="px-3 py-1.5 text-xs" onClick={() => window.print()}>Print receipt</Button></div>}
    </Panel>}

    {view === 'catalog' && isAdmin && <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
      <Panel title="Procedure catalog" subtitle="Session rates and editable GST"><Table columns={[
        { key: 'name', label: 'Procedure' }, { key: 'default_sessions', label: 'Sessions' },
        { key: 'session_price', label: 'Rate / session', render: (item) => <input key={`${item.id}-${item.session_price}`} type="number" min="0" step=".01" defaultValue={item.session_price} onBlur={(e) => updatePrice(item, e.target.value, item.default_gst_rate)} className="w-24 rounded-lg border border-line px-2 py-1" /> },
        { key: 'default_gst_rate', label: 'GST %', render: (item) => <input key={`${item.id}-${item.default_gst_rate}`} type="number" min="0" max="100" step=".01" defaultValue={item.default_gst_rate} onBlur={(e) => updatePrice(item, item.session_price, e.target.value)} className="w-20 rounded-lg border border-line px-2 py-1" /> },
      ]} rows={catalog} empty="Add a procedure below." /></Panel>
      <Panel title="Add procedure" subtitle="Create a therapy for your catalog"><form onSubmit={addProcedure} className="grid gap-3 sm:grid-cols-2">
        <Field required label="Name" value={newProcedure.name} onChange={(e) => setNewProcedure({ ...newProcedure, name: e.target.value })} />
        <Field label="Description" value={newProcedure.description} onChange={(e) => setNewProcedure({ ...newProcedure, description: e.target.value })} />
        <Field required type="number" min="1" label="Default sessions" value={newProcedure.defaultSessions} onChange={(e) => setNewProcedure({ ...newProcedure, defaultSessions: e.target.value })} />
        <Field required type="number" min="0" step=".01" label="Price per session" value={newProcedure.sessionPrice} onChange={(e) => setNewProcedure({ ...newProcedure, sessionPrice: e.target.value })} />
        <Field required type="number" min="0" max="100" step=".01" label="Default GST %" value={newProcedure.defaultGstRate} onChange={(e) => setNewProcedure({ ...newProcedure, defaultGstRate: e.target.value })} />
        <Button className="sm:col-span-2">Add to catalog</Button>
      </form></Panel>
    </div>}

    {lastBill && <section className="print-only"><ClinicLetterhead clinic={clinic} title="Procedure receipt" /><div className="mt-5 space-y-2 text-sm"><p>Receipt: {lastBill.receipt_number}</p><p>Date: {new Date(lastBill.created_at).toLocaleString('en-IN')}</p><p>Patient: {lastBill.patientName || 'Clinic patient'}</p><p>Patient ID: {lastBill.patientUhid || '—'}</p><p>Billing: {lastBill.billing_type}</p><p>Subtotal: {money(lastBill.subtotal)}</p><p>Discount: {money(lastBill.discount)}</p><p>GST: {money(lastBill.tax)}</p><p className="mt-4 border-t border-slate-300 pt-3 text-lg font-bold">Total: {money(lastBill.total)}</p><p>Received: {money(lastBill.amount_paid)} · Due: {money(lastBill.total - lastBill.amount_paid)}</p></div></section>}
  </>;
}
