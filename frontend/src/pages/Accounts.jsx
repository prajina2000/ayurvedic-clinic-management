import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { downloadBrandedExcel } from '../api/brandedExcel.js';
import { Button, ErrorNotice, Field, PageHeader, Panel, SelectField, StatCard, SuccessNotice, Table, money, today } from '../components/UI.jsx';
import ModuleSubnav from '../components/ModuleSubnav.jsx';
import ClinicLetterhead from '../components/ClinicLetterhead.jsx';

const sections = [
  { id: 'daybook', label: 'Day book' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'reports', label: 'Reports' },
  { id: 'dues', label: 'Outstanding dues' },
];

export default function Accounts() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'daybook';
  const [date, setDate] = useState(today());
  const [daybook, setDaybook] = useState(null);
  const [outstanding, setOutstanding] = useState([]);
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [reports, setReports] = useState([]);
  const [expense, setExpense] = useState({ expenseDate: today(), category: '', description: '', amount: '', paymentMode: 'cash' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [clinic, setClinic] = useState(null);

  async function loadDay() { setDaybook(await get(`/accounts/daybook?date=${date}`)); }
  async function loadReports() {
    const [report, dues] = await Promise.all([get(`/accounts/reports?from=${from}&to=${to}`), get('/accounts/outstanding')]);
    setReports(report.data); setOutstanding(dues.data);
  }
  useEffect(() => { loadDay().catch((e) => setError(e.message)); }, [date]);
  useEffect(() => { loadReports().catch((e) => setError(e.message)); get('/clinic').then(setClinic).catch(() => {}); }, []);
  async function addExpense(event) {
    event.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    try {
      await post('/accounts/expenses', { ...expense, amount: Number(expense.amount) });
      setSuccess('Expense added to the day book.'); setExpense({ ...expense, description: '', amount: '' });
      await Promise.all([loadDay(), loadReports()]);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  const maxValue = Math.max(1, ...reports.flatMap((item) => [Number(item.income), Number(item.expenses)]));
  const exportRows = useMemo(() => daybook?.data.map((row) => ({ Date: new Date(row.created_at).toLocaleString('en-IN'), Category: row.category, Reference: row.reference, Patient: row.patient, Gross: Number(row.gross), Collected: Number(row.collected), Due: Number(row.due), Payment: row.payment_mode })) || [], [daybook]);
  function downloadDaybook() {
    downloadBrandedExcel({ filename: `kariyil-daybook-${date}.xlsx`, sheetName: 'Day Book', subtitle: `Day Book · ${date}`, headers: ['Date', 'Category', 'Reference', 'Patient', 'Gross (INR)', 'Collected (INR)', 'Due (INR)', 'Payment'], rows: exportRows.map((row) => Object.values(row)), widths: [22, 17, 23, 28, 18, 18, 18, 16], currencyColumns: [4, 5, 6] });
  }
  function downloadReport() {
    downloadBrandedExcel({ filename: `kariyil-accounts-report-${from}-${to}.xlsx`, sheetName: 'Accounts Report', subtitle: `Income and expense report · ${from} to ${to}`, headers: ['Date', 'Income (INR)', 'Expenses (INR)', 'Outstanding (INR)'], rows: reports.map((row) => [row.day, Number(row.income), Number(row.expenses), Number(row.outstanding)]), widths: [18, 22, 22, 24], currencyColumns: [1, 2, 3] });
  }

  return <>
    <PageHeader eyebrow="Finance workspace" title="Accounts" description="See money collected, expenses, and outstanding balances across clinic services." action={<Button variant="secondary" onClick={() => window.print()}>Print / save PDF</Button>} />
    <ModuleSubnav basePath="/accounts" sections={sections} defaultView="daybook" />
    <ErrorNotice error={error} /><SuccessNotice>{success}</SuccessNotice>

    {view === 'daybook' && <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3"><Field label="Day book date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Button variant="secondary" onClick={() => loadDay().catch((e) => setError(e.message))}>Refresh</Button></div>
        <Button variant="soft" onClick={downloadDaybook}>Export for Excel ↓</Button>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected today" value={money(daybook?.summary.income)} note="Consultation, pharmacy and procedure" accent="forest" icon="₹" />
        <StatCard label="Expenses" value={money(daybook?.summary.expenses)} note="Recorded clinic expenses" accent="rose" icon="↘" />
        <StatCard label="Net collected" value={money(daybook?.summary.net)} note="Collections minus expenses" accent="blue" icon="∑" />
        <StatCard label="Outstanding dues" value={money(daybook?.summary.outstanding)} note={`${outstanding.length} open invoices`} accent="sand" icon="!" />
      </div>
      <Panel title="Day book" subtitle={date}><Table columns={[
        { key: 'category', label: 'Type', render: (row) => <span className="capitalize">{row.category}</span> },
        { key: 'reference', label: 'Reference', render: (row) => <span className="font-mono text-[11px]">{row.reference}</span> },
        { key: 'patient', label: 'Patient / note', render: (row) => <span className="text-xs">{row.patient || '—'}</span> },
        { key: 'gross', label: 'Amount', render: (row) => <span className={row.category === 'expense' ? 'text-rose-700' : 'font-semibold'}>{row.category === 'expense' ? '−' : ''}{money(row.gross)}</span> },
        { key: 'collected', label: 'Received', render: (row) => money(row.collected) },
        { key: 'due', label: 'Due', render: (row) => Number(row.due) > 0 ? <span className="font-semibold text-amber-700">{money(row.due)}</span> : '—' },
      ]} rows={daybook?.data || []} empty="No income or expense entries for this day." /></Panel>
    </>}

    {view === 'expenses' && <Panel className="max-w-2xl" title="Record an expense" subtitle="Add clinic spending by category">
      <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" type="date" value={expense.expenseDate} onChange={(e) => setExpense({ ...expense, expenseDate: e.target.value })} />
        <Field required label="Category" placeholder="Rent, supplies, utilities…" value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })} />
        <Field required className="sm:col-span-2" label="Description" placeholder="What was this payment for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} />
        <Field required type="number" min=".01" step=".01" label="Amount" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} />
        <SelectField label="Payment mode" value={expense.paymentMode} onChange={(e) => setExpense({ ...expense, paymentMode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank-transfer">Bank transfer</option><option value="other">Other</option></SelectField>
        <Button className="sm:col-span-2" disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</Button>
      </form>
    </Panel>}

    {view === 'reports' && <Panel title="Income & expense trend" subtitle="Daily totals for the selected period" action={<div className="flex flex-wrap items-end gap-2">
      <Field aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Field aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button className="px-3 py-2" onClick={() => loadReports().catch((e) => setError(e.message))}>Go</Button>
      <Button variant="secondary" className="px-3 py-2" onClick={downloadReport}>Excel</Button>
    </div>}>
      <div className="space-y-4">{reports.map((row) => <div key={row.day}><div className="mb-1.5 flex justify-between text-[11px]"><span className="font-semibold">{new Date(row.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><span className="text-muted">{money(row.income)} in · {money(row.expenses)} out</span></div><div className="flex h-2 gap-1"><div className="rounded-full bg-forest-500" style={{ width: `${Math.max(2, Number(row.income) / maxValue * 100)}%` }} /><div className="rounded-full bg-rose-300" style={{ width: `${Math.max(1, Number(row.expenses) / maxValue * 100)}%` }} /></div></div>)}
        {!reports.length && <p className="py-5 text-center text-xs text-muted">No report entries for this period.</p>}
        <div className="flex gap-4 border-t border-line pt-3 text-[10px] text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-forest-500" />Income</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-300" />Expenses</span></div>
      </div>
    </Panel>}

    {view === 'dues' && <Panel title="Outstanding dues" subtitle="Part-paid or unpaid invoices"><Table columns={[
      { key: 'category', label: 'Service', render: (row) => <span className="capitalize">{row.category}</span> },
      { key: 'reference', label: 'Reference', render: (row) => <span className="font-mono text-[11px]">{row.reference}</span> },
      { key: 'patient', label: 'Patient' },
      { key: 'due', label: 'Balance', render: (row) => <span className="font-semibold text-amber-700">{money(row.due)}</span> },
      { key: 'created_at', label: 'Date', render: (row) => new Date(row.created_at).toLocaleDateString('en-IN') },
    ]} rows={outstanding} empty="No outstanding balances." /></Panel>}

    <section className="print-only"><ClinicLetterhead clinic={clinic} title="Day Book" /><p className="mt-2 text-sm">Date: {date}</p><div className="my-5 grid grid-cols-1 gap-3 border-y border-slate-300 py-4 text-sm sm:grid-cols-3"><p>Income: {money(daybook?.summary.income)}</p><p>Expenses: {money(daybook?.summary.expenses)}</p><p>Net: {money(daybook?.summary.net)}</p></div><table className="w-full text-left text-xs"><thead><tr><th>Type</th><th>Reference</th><th>Patient / note</th><th>Gross</th><th>Received</th><th>Due</th></tr></thead><tbody>{daybook?.data.map((row, index) => <tr key={index}><td>{row.category}</td><td>{row.reference}</td><td>{row.patient}</td><td>{money(row.gross)}</td><td>{money(row.collected)}</td><td>{money(row.due)}</td></tr>)}</tbody></table><h2 className="mt-12 font-display text-xl font-bold">Income & expense report</h2><p className="mt-1 text-xs">{from} to {to}</p><table className="mt-4 w-full text-left text-xs"><thead><tr><th>Date</th><th>Income</th><th>Expenses</th><th>Outstanding</th></tr></thead><tbody>{reports.map((row) => <tr key={row.day}><td>{row.day}</td><td>{money(row.income)}</td><td>{money(row.expenses)}</td><td>{money(row.outstanding)}</td></tr>)}</tbody></table></section>
  </>;
}
