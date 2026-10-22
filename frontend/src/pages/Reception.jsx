import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, patch, post } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorNotice, Field, Modal, PageHeader, Panel, SelectField, SuccessNotice, Table, today } from '../components/UI.jsx';

const emptyPatient = { name: '', age: '', gender: '', place: '', phone: '' };
const nextStatus = {
  waiting: ['in-consultation', 'Start consult'],
  'in-consultation': ['done', 'Complete'],
  done: [],
  cancelled: [],
};
const sections = [
  { id: 'dashboard', label: 'Dashboard', title: 'Reception dashboard', description: 'Track today’s queue and move patients through reception.' },
  { id: 'register', label: 'New patient registration', title: 'New patient registration', description: 'Create a patient record before booking a visit.' },
  { id: 'book', label: 'Token booking', title: 'Token booking', description: 'Select a patient and add them to a department or doctor queue.' },
  { id: 'patients', label: 'Patient details', title: 'Patient details', description: 'Search existing patient records and review visit history.' },
];

function LocalDate() {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function Reception() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const canRegister = ['Admin', 'Receptionist'].includes(user?.role);
  const canBook = ['Admin', 'Receptionist'].includes(user?.role);
  const canViewHistory = ['Admin', 'Doctor'].includes(user?.role);
  const visibleSections = sections.filter((section) => section.id === 'dashboard' || section.id === 'patients' || (section.id === 'register' && canRegister) || (section.id === 'book' && canBook));
  const requestedView = searchParams.get('view') || 'dashboard';
  const activeSection = visibleSections.find((section) => section.id === requestedView) || visibleSections[0];

  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [consultation, setConsultation] = useState({ fee: '', paid: '', paymentMode: 'cash' });
  const [form, setForm] = useState(emptyPatient);
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [queue, setQueue] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(async () => {
    try {
      const result = await get(`/reception/patients?search=${encodeURIComponent(search)}&page=${page}&pageSize=10`);
      setPatients(result.data);
      setPagination(result.pagination);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [search, page]);

  const loadQueue = useCallback(async () => {
    try {
      const result = await get(`/reception/tokens?date=${today()}`);
      setQueue(result.data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    get('/reception/departments').then(({ data }) => {
      setDepartments(data);
      if (data.length) setSelectedDepartment(data[0].id);
    }).catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    const timer = setTimeout(loadPatients, 220);
    return () => clearTimeout(timer);
  }, [loadPatients]);
  useEffect(() => {
    loadQueue();
    const timer = setInterval(loadQueue, 12000);
    return () => clearInterval(timer);
  }, [loadQueue]);

  async function register(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { patient } = await post('/reception/patients', { ...form, age: Number(form.age) });
      setSelectedPatient(patient);
      setSuccess(`${patient.name} registered with patient ID ${patient.uhid}.`);
      setForm(emptyPatient);
      setSearch(patient.uhid);
      setPage(1);
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function book() {
    if (!selectedPatient || !selectedDepartment) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { token } = await post('/reception/tokens', {
        patientId: selectedPatient.id,
        departmentId: selectedDepartment,
        doctorId: selectedDoctor || undefined,
        consultationFee: Number(consultation.fee || 0),
        consultationAmountPaid: consultation.paid === '' ? undefined : Number(consultation.paid),
        paymentMode: consultation.paymentMode,
      });
      setSuccess(`Token #${token.token_number} booked for ${selectedPatient.name}.`);
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id, status) {
    setError('');
    try {
      await patch(`/reception/tokens/${id}/status`, { status });
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function viewHistory(patient) {
    setError('');
    setHistory(null);
    try {
      setHistory(await get(`/reception/patients/${patient.id}/history`));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const waiting = queue.filter((token) => token.status === 'waiting').length;
  const inConsultation = queue.filter((token) => token.status === 'in-consultation').length;
  const completed = queue.filter((token) => token.status === 'done').length;
  const filteredQueue = statusFilter ? queue.filter((token) => token.status === statusFilter) : queue;

  const patientTable = <>
    <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row">
      <div className="relative min-w-0 flex-1"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name, phone or UHID" aria-label="Search patients by name, phone or UHID" className="w-full rounded-xl border border-line bg-canvas py-2.5 pl-10 pr-3 text-sm outline-none focus:border-forest-500" /></div>
      <Button variant="secondary" className="shrink-0" onClick={loadPatients}>Search</Button>
    </div>
    <Table columns={[
      { key: 'name', label: 'Patient', render: (patient) => <div><p className="font-semibold">{patient.name}</p><p className="text-[10px] text-muted">{patient.uhid}</p></div> },
      { key: 'age', label: 'Age' },
      { key: 'phone', label: 'Phone' },
      { key: 'place', label: 'Place' },
      ...(canViewHistory ? [{ key: 'actions', label: '', render: (patient) => <button onClick={() => { setSelectedPatient(patient); viewHistory(patient); }} className="text-xs font-semibold text-forest-700 hover:text-forest-900">History →</button> }] : []),
    ]} rows={patients} empty="No patients match your search" />
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <span>Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}</span>
      <div className="flex gap-2"><Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={page * pagination.pageSize >= pagination.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    </div>
  </>;

  const queueTable = (rows, empty) => <Table columns={[
    { key: 'token_number', label: 'Token', render: (token) => <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-forest-50 font-display font-bold text-forest-700">{token.token_number}</span> },
    { key: 'patient_name', label: 'Patient', render: (token) => <div><p className="font-semibold">{token.patient_name}</p><p className="text-[10px] text-muted">{token.uhid} · {token.age} yrs · {token.gender}</p></div> },
    { key: 'department_name', label: 'Department', render: (token) => <div><p>{token.department_name}</p>{token.doctor_name && <p className="text-[10px] text-muted">Dr. {token.doctor_name}</p>}</div> },
    { key: 'created_at', label: 'Booked', render: (token) => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(token.created_at)) },
    { key: 'status', label: 'Status', render: (token) => <Badge tone={token.status === 'waiting' ? 'amber' : token.status === 'in-consultation' ? 'green' : token.status === 'done' ? 'gray' : 'red'}>{token.status}</Badge> },
    { key: 'actions', label: 'Update', render: (token) => nextStatus[token.status]?.length ? <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => changeStatus(token.id, nextStatus[token.status][0])}>{nextStatus[token.status][1]}</Button> : <span className="text-xs text-muted">—</span> },
  ]} rows={rows} empty={empty} />;

  return <>
    <PageHeader eyebrow="Reception · Patient services" title={activeSection.title} description={activeSection.description} action={<div className="rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-semibold text-muted">Today · <LocalDate /></div>} />
    <nav className="no-print mb-5 flex flex-wrap gap-2 rounded-2xl border border-line bg-white p-2" aria-label="Reception submenus">
      {visibleSections.map((section) => <Link key={section.id} to={`/reception?view=${section.id}`} aria-current={activeSection.id === section.id ? 'page' : undefined} className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${activeSection.id === section.id ? 'bg-forest-600 text-white' : 'text-muted hover:bg-canvas hover:text-ink'}`}>{section.label}</Link>)}
    </nav>
    <ErrorNotice error={error} />
    <SuccessNotice>{success}</SuccessNotice>

    {activeSection.id === 'dashboard' && <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Today’s tokens</p><p className="mt-2 font-display text-2xl font-bold">{queue.length}</p></div>
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Waiting</p><p className="mt-2 font-display text-2xl font-bold text-amber-700">{waiting}</p></div>
        <div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">In consultation</p><p className="mt-2 font-display text-2xl font-bold text-forest-700">{inConsultation}</p></div>
      </div>
      <Panel title="Today’s live queue" subtitle="Automatically refreshes every 12 seconds" action={<div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-forest-500" /><SelectField aria-label="Filter queue" className="min-w-36" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="waiting">Waiting</option><option value="in-consultation">In consultation</option><option value="done">Done</option><option value="cancelled">Cancelled</option></SelectField></div>}>
        {queueTable(filteredQueue, 'No tokens booked for today')}
      </Panel>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {visibleSections.filter((section) => section.id !== 'dashboard').map((section) => <Link key={section.id} to={`/reception?view=${section.id}`} className="rounded-2xl border border-line bg-white p-4 text-sm font-semibold transition hover:border-forest-200 hover:bg-forest-50">{section.label}<span className="float-right text-forest-700">→</span></Link>)}
      </div>
    </>}

    {activeSection.id === 'register' && canRegister && <Panel title="New patient" subtitle="A few details to open a patient record">
      <form onSubmit={register} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field required label="Patient name" placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="120" />
        <Field required label="Age" type="number" min="0" max="125" placeholder="Years" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
        <SelectField required label="Gender" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer-not-to-say">Prefer not to say</option></SelectField>
        <Field required label="Place" placeholder="Town or locality" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} maxLength="160" />
        <Field required label="Phone number" type="tel" placeholder="Include country code if needed" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength="30" />
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Register patient'}<span>→</span></Button>{selectedPatient && <Link to="/reception?view=book" className="pb-3 text-xs font-semibold text-forest-700">Book a token for {selectedPatient.name} →</Link>}</div>
      </form>
    </Panel>}

    {activeSection.id === 'book' && canBook && <Panel title="Book a token" subtitle="Find the patient, then select a department and doctor queue">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Find patient" placeholder="Name, phone or UHID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <SelectField label="Patient" value={selectedPatient?.id || ''} onChange={(event) => setSelectedPatient(patients.find((patient) => patient.id === event.target.value) || (selectedPatient?.id === event.target.value ? selectedPatient : null))}>
          <option value="">Choose a patient</option>
          {selectedPatient && !patients.some((patient) => patient.id === selectedPatient.id) && <option value={selectedPatient.id}>{selectedPatient.name} · {selectedPatient.uhid}</option>}
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.uhid}</option>)}
        </SelectField>
        <SelectField label="Department" value={selectedDepartment} onChange={(event) => { setSelectedDepartment(event.target.value); setSelectedDoctor(''); }}><option value="">Choose department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectField>
        <SelectField label="Doctor (optional)" value={selectedDoctor} onChange={(event) => setSelectedDoctor(event.target.value)}><option value="">Department queue</option>{departments.find((department) => department.id === selectedDepartment)?.doctors?.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</SelectField>
        <div className="self-end"><Button className="w-full" onClick={book} disabled={!selectedPatient || !selectedDepartment || saving}>{saving ? 'Booking…' : 'Book token'}</Button></div>
      </div>
      {selectedPatient && <div className="mt-4 rounded-xl bg-forest-50 p-3 text-xs text-forest-800"><span className="font-semibold">{selectedPatient.name}</span> · {selectedPatient.uhid} · {selectedPatient.phone}</div>}
      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-3">
        <Field label="Consultation fee" type="number" min="0" step=".01" placeholder="Optional" value={consultation.fee} onChange={(event) => setConsultation({ ...consultation, fee: event.target.value })} />
        <Field label="Amount received" type="number" min="0" step=".01" placeholder="Defaults to full fee" value={consultation.paid} onChange={(event) => setConsultation({ ...consultation, paid: event.target.value })} />
        <SelectField label="Consultation payment mode" value={consultation.paymentMode} onChange={(event) => setConsultation({ ...consultation, paymentMode: event.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank-transfer">Bank transfer</option><option value="other">Other</option></SelectField>
      </div>
      <p className="mt-4 text-[11px] text-muted">Need to add a new patient? <Link to="/reception?view=register" className="font-semibold text-forest-700">Register patient →</Link></p>
    </Panel>}

    {activeSection.id === 'patients' && <Panel title="Patient details" subtitle="Search by name, phone, or patient ID" action={<span className="text-[10px] font-semibold text-muted">{pagination.total} RECORDS</span>}>
      {patientTable}
    </Panel>}

    {history && <Modal title="Patient visit history" onClose={() => setHistory(null)}>
      <div className="mb-5 rounded-xl bg-canvas p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-lg font-bold">{history.patient.name}</p><p className="mt-1 text-xs text-muted">{history.patient.uhid} · {history.patient.age} yrs · {history.patient.gender} · {history.patient.phone}</p></div><Badge>{history.visits.length} previous visits</Badge></div></div>
      {history.visits.length ? <div className="space-y-3">{history.visits.map((visit) => <article key={visit.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(visit.visit_date))} {visit.doctor_name && <span className="font-normal text-muted">· Dr. {visit.doctor_name}</span>}</p>{visit.icd_code && <Badge tone="blue">{visit.icd_code}</Badge>}</div>{visit.complaints && <p className="mt-2 text-xs text-muted"><span className="font-semibold text-ink">Complaints:</span> {visit.complaints}</p>}{visit.diagnosis && <p className="mt-1 text-xs text-muted"><span className="font-semibold text-ink">Diagnosis:</span> {visit.diagnosis}</p>}{visit.medicines?.length > 0 && <p className="mt-2 text-xs text-muted">{visit.medicines.map((medicine) => medicine.medicineName).join(' · ')}</p>}</article>)}</div> : <div className="py-10 text-center text-sm text-muted">No previous visits recorded.</div>}
    </Modal>}
  </>;
}
