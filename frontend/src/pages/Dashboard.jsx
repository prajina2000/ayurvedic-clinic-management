import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, PageHeader, Panel, StatCard, Table, money, today } from '../components/UI.jsx';

const shortcuts = {
  Admin: [['Reception', '/reception', '⌂'], ['Consultations', '/doctor', '✳'], ['Pharmacy', '/pharmacy', '◈'], ['Accounts', '/accounts', '▤']],
  Receptionist: [['Register patient', '/reception', '⌂'], ['Open today’s queue', '/reception', '↗']],
  Doctor: [['Start consultation', '/doctor', '✳'], ['View reception queue', '/reception', '⌂']],
  Pharmacist: [['Manage pharmacy', '/pharmacy', '◈']],
  Therapist: [['Today’s therapies', '/procedures', '❋']],
  Accountant: [['Open day book', '/accounts', '▤'], ['Outstanding dues', '/accounts', '↗']],
};

function cardsFor(role, data) {
  const loaded = Boolean(data);
  const queue = data?.queue || {};
  const metric = (value) => loaded ? (value ?? 0) : '—';
  const activeQueue = loaded ? (queue.waiting ?? 0) + (queue['in-consultation'] ?? 0) : '—';
  const stockAlerts = loaded ? (data.lowStock ?? 0) + (data.nearExpiry ?? 0) : '—';

  if (role === 'Admin') return [
    { label: 'Patients in queue', value: activeQueue, note: loaded ? `${queue.waiting ?? 0} waiting` : 'Today’s queue', icon: '⌂' },
    { label: 'Patient records', value: metric(data?.patients), note: 'All-time patients', accent: 'sand', icon: '♙' },
    { label: 'Income collected', value: loaded ? money(data.income) : '—', note: 'All clinic services, today', accent: 'blue', icon: '₹' },
    { label: 'Open stock alerts', value: stockAlerts, note: loaded ? `${data.lowStock ?? 0} low stock · ${data.nearExpiry ?? 0} near expiry` : 'Pharmacy stock', accent: 'rose', icon: '!' },
  ];
  if (role === 'Receptionist') return [
    { label: 'Waiting patients', value: metric(queue.waiting), note: 'Ready for care', icon: '⌂' },
    { label: 'In consultation', value: metric(queue['in-consultation']), note: 'With the doctor', accent: 'blue', icon: '✳' },
    { label: 'Queue completed', value: metric(queue.done), note: 'Today', accent: 'sand', icon: '✓' },
    { label: 'Patient records', value: metric(data?.patients), note: 'All-time patients', accent: 'rose', icon: '♙' },
  ];
  if (role === 'Doctor') return [
    { label: 'Waiting patients', value: metric(queue.waiting), note: 'In today’s queue', icon: '⌂' },
    { label: 'In consultation', value: metric(queue['in-consultation']), note: 'Current visits', accent: 'blue', icon: '✳' },
    { label: 'Patient records', value: metric(data?.patients), note: 'History available', accent: 'sand', icon: '♙' },
    { label: 'Therapy sessions', value: metric(data?.procedureSessions?.scheduled), note: 'Scheduled today', accent: 'rose', icon: '❋' },
  ];
  if (role === 'Pharmacist') return [
    { label: 'Medicine types', value: metric(data?.stockItems), note: 'Active medicine master', icon: '◈' },
    { label: 'Low stock', value: metric(data?.lowStock), note: 'At or below reorder level', accent: 'sand', icon: '↓' },
    { label: 'Near expiry', value: metric(data?.nearExpiry), note: 'Expiring in 30 days', accent: 'rose', icon: '!' },
    { label: 'Stock watch', value: stockAlerts, note: 'Items needing attention', accent: 'blue', icon: '⌕' },
  ];
  if (role === 'Therapist') return [
    { label: 'Scheduled sessions', value: metric(data?.procedureSessions?.scheduled), note: 'Today', icon: '❋' },
    { label: 'In progress', value: metric(data?.procedureSessions?.in_progress), note: 'With patients', accent: 'blue', icon: '↗' },
    { label: 'Completed', value: metric(data?.procedureSessions?.completed), note: 'Today', accent: 'sand', icon: '✓' },
  ];
  return [
    { label: 'Income collected', value: loaded ? money(data.income) : '—', note: 'All services, today', icon: '₹' },
    { label: 'Expenses', value: loaded ? money(data.expenses) : '—', note: 'Today', accent: 'rose', icon: '↘' },
    { label: 'Net collected', value: loaded ? money(data.net) : '—', note: 'Income less expenses', accent: 'blue', icon: '∑' },
    { label: 'Outstanding dues', value: loaded ? money(data.outstanding) : '—', note: 'Across all invoices', accent: 'sand', icon: '!' },
  ];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [error, setError] = useState('');
  const isFront = ['Admin', 'Receptionist', 'Doctor'].includes(user?.role);

  useEffect(() => {
    let active = true;
    setData(null);
    setQueue([]);
    setError('');
    get('/dashboard').then((result) => {
      if (active) setData(result);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });

    if (!isFront) {
      setQueueLoading(false);
      return () => { active = false; };
    }

    setQueueLoading(true);
    get('/reception/tokens').then((result) => {
      if (active) setQueue(result.data.filter((item) => item.status === 'waiting').slice(0, 6));
    }).catch(() => {}).finally(() => {
      if (active) setQueueLoading(false);
    });
    return () => { active = false; };
  }, [user?.role, isFront]);

  const cards = cardsFor(user?.role, data);
  const overviewTitle = {
    Admin: 'Today at the clinic',
    Receptionist: 'Reception pulse',
    Doctor: 'Care in progress',
    Pharmacist: 'Pharmacy pulse',
    Therapist: 'Today’s therapies',
    Accountant: 'Daily finance',
  }[user?.role];
  const clinicDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  }).format(new Date());

  return <>
    <PageHeader eyebrow={`${clinicDate} · Kerala`} title={`Good day, ${user?.name || 'there'}.`} description="A clear view of today’s care, people, and practice." action={<Badge>● Workspace ready</Badge>} />
    {error && <div className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className={`grid min-w-0 gap-4 sm:grid-cols-2 ${cards.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}>
      {cards.map((card) => <StatCard key={card.label} {...card} />)}
    </div>

    <div className="mt-6 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]">
      <Panel title={overviewTitle} subtitle="Your role-specific view for today" action={<span className="whitespace-nowrap text-[10px] font-semibold text-forest-700">{today()} · LIVE</span>}>
        {isFront ? <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs text-muted">Waiting for care</p>
              <p className="mt-2 font-display text-2xl font-bold">{data ? (data.queue?.waiting ?? 0) : '—'}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-2/3 rounded-full bg-forest-500" /></div>
            </div>
            <div className="rounded-xl bg-[#f1f7f2] p-4">
              <p className="text-xs text-muted">Therapy sessions</p>
              <p className="mt-2 font-display text-2xl font-bold">{data ? (data.proceduresToday ?? data.procedureSessions?.scheduled ?? 0) : '—'}</p>
              <p className="mt-2 text-[10px] text-forest-700">Scheduled or in progress</p>
            </div>
            <div className="rounded-xl bg-sand p-4">
              <p className="text-xs text-muted">Queue completed</p>
              <p className="mt-2 font-display text-2xl font-bold">{data ? (data.queue?.done ?? 0) : '—'}</p>
              <p className="mt-2 text-[10px] text-amber-900/70">Today’s patient visits</p>
            </div>
          </div>
          <div className="mt-6 min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold">Next in queue</h3><Link to="/reception" className="shrink-0 text-xs font-semibold text-forest-700">Open queue →</Link></div>
            <Table columns={[
              { key: 'token_number', label: 'Token', render: (row) => <span className="font-display font-bold">#{row.token_number}</span> },
              { key: 'patient_name', label: 'Patient', render: (row) => <div><p className="font-semibold">{row.patient_name}</p><p className="text-[10px] text-muted">{row.uhid}</p></div> },
              { key: 'department_name', label: 'Department' },
              { key: 'status', label: 'Status', render: (row) => <Badge tone="amber">{row.status}</Badge> },
            ]} rows={queue} empty={queueLoading ? 'Loading today’s queue…' : 'No patients are waiting.'} />
          </div>
        </> : user?.role === 'Pharmacist' ? <div className="rounded-xl bg-sand p-5">
          <p className="text-sm font-bold">Keep batches moving safely</p>
          <p className="mt-2 max-w-lg text-xs leading-6 text-muted">Review low stock and upcoming expiries, then record each purchase against its batch for accurate dispensing.</p>
          <Link to="/pharmacy" className="mt-4 inline-flex rounded-xl bg-forest-600 px-4 py-2.5 text-xs font-semibold text-white">Open pharmacy →</Link>
        </div> : user?.role === 'Therapist' ? <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Scheduled', data?.procedureSessions?.scheduled],
            ['In progress', data?.procedureSessions?.in_progress],
            ['Completed', data?.procedureSessions?.completed],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-canvas p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-2xl font-bold">{data ? (value ?? 0) : '—'}</p></div>)}
        </div> : <div className="rounded-xl bg-[#f1f7f2] p-5">
          <p className="text-sm font-bold">Service income, one day book</p>
          <p className="mt-2 max-w-lg text-xs leading-6 text-muted">Consultation, pharmacy, and procedure receipts combine with expenses and outstanding invoices in the accounts workspace.</p>
          <Link to="/accounts" className="mt-4 inline-flex rounded-xl bg-forest-600 px-4 py-2.5 text-xs font-semibold text-white">Open accounts →</Link>
        </div>}
      </Panel>

      <Panel title="Quick actions" subtitle="Pick up where your role needs you">
        <div className="space-y-2">{(shortcuts[user?.role] || []).map(([label, href, icon]) => <Link to={href} key={label} className="flex items-center gap-3 rounded-xl border border-line p-3.5 transition hover:border-forest-200 hover:bg-forest-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">{icon}</span><span className="min-w-0 flex-1 text-sm font-semibold">{label}</span><span className="text-muted">→</span></Link>)}</div>
        <div className="mt-5 rounded-xl bg-[#f8f7f2] p-4"><p className="text-xs font-bold">A note for today</p><p className="mt-1.5 text-xs leading-5 text-muted">Keep patient conversations unhurried. The rest of your day is right here.</p></div>
      </Panel>
    </div>
  </>;
}
