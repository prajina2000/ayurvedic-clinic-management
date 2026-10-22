import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { Badge, Button, ErrorNotice, Field, PageHeader, Panel, SelectField, SuccessNotice, Table } from '../components/UI.jsx';
import ModuleSubnav from '../components/ModuleSubnav.jsx';

const roles = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist', 'Therapist', 'Accountant'];
const sections = [
  { id: 'team', label: 'Team members' },
  { id: 'invite', label: 'Invite staff' },
  { id: 'departments', label: 'Departments' },
];

export default function Users() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'team';
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentName, setDepartmentName] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Receptionist', departmentId: '', registrationNumber: '', specialization: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [team, depts] = await Promise.all([get('/users'), get('/reception/departments')]);
    setUsers(team.data);
    setDepartments(depts.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function create(event) {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true);
    try {
      await post('/users', { ...form, departmentId: form.role === 'Doctor' && form.departmentId ? form.departmentId : undefined });
      setSuccess(`${form.name} added as ${form.role}.`);
      setForm({ name: '', email: '', password: '', role: 'Receptionist', departmentId: '', registrationNumber: '', specialization: '' });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function createDepartment(event) {
    event.preventDefault(); setError('');
    try {
      await post('/reception/departments', { name: departmentName });
      setDepartmentName(''); setSuccess('Department added to token booking.'); await refresh();
    } catch (e) { setError(e.message); }
  }

  return <>
    <PageHeader eyebrow="Administration" title="Team access" description="Create staff accounts, set up departments, and assign the right role for each part of the clinic." action={<Badge>{users.length} team members</Badge>} />
    <ModuleSubnav basePath="/users" sections={sections} defaultView="team" />
    <ErrorNotice error={error} /><SuccessNotice>{success}</SuccessNotice>

    {view === 'team' && <Panel title="Clinic team" subtitle="Role-based access is applied across modules">
      <Table columns={[
        { key: 'name', label: 'Team member', render: (item) => <div><p className="font-semibold">{item.name}</p><p className="text-[10px] text-muted">{item.email}</p></div> },
        { key: 'role', label: 'Role', render: (item) => <Badge tone={item.role === 'Admin' ? 'blue' : 'green'}>{item.role}</Badge> },
        { key: 'is_active', label: 'Access', render: (item) => <span className={item.is_active ? 'text-forest-700' : 'text-rose-700'}>{item.is_active ? 'Active' : 'Inactive'}</span> },
        { key: 'created_at', label: 'Added', render: (item) => new Date(item.created_at).toLocaleDateString('en-IN') },
      ]} rows={users} empty="No staff accounts found." />
    </Panel>}

    {view === 'invite' && <Panel className="max-w-2xl" title="Invite a team member" subtitle="New users sign in with these credentials">
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
        <Field required className="sm:col-span-2" label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field required type="email" className="sm:col-span-2" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field required type="password" minLength="12" className="sm:col-span-2" label="Temporary password" hint="At least 12 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</SelectField>
        {form.role === 'Doctor' && <>
          <SelectField label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}><option value="">Choose a department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
          <Field label="Medical registration no." value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          <Field label="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
        </>}
        <Button className="sm:col-span-2" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </Panel>}

    {view === 'departments' && <Panel className="max-w-2xl" title="Departments" subtitle="Departments appear in Reception token booking">
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={createDepartment}>
        <Field className="min-w-[220px] flex-1" required label="Add department" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="e.g. General consultation" />
        <Button>Add</Button>
      </form>
      <div className="flex flex-wrap gap-2">{departments.map((item) => <span key={item.id} className="rounded-full bg-forest-50 px-3 py-1.5 text-xs font-semibold text-forest-700">{item.name}</span>)}</div>
    </Panel>}
  </>;
}
