import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { get, post } from '../api/client.js';
import { saveSupplierBillsExcel } from '../api/supplierBillsExcel.js';
import { Badge, Button, ErrorNotice, Field, Modal, PageHeader, Panel, SelectField, SuccessNotice, Table, money, today } from '../components/UI.jsx';
import ModuleSubnav from '../components/ModuleSubnav.jsx';
import MedicineBilling from '../components/pharmacy/MedicineBilling.jsx';

const sections = [
  { id: 'dashboard', label: 'Medicine Dashboard' },
  { id: 'list', label: 'Medicine List' },
  { id: 'add', label: 'Add Medicine' },
  { id: 'inventory', label: 'Medicine Inventory' },
  { id: 'expiry', label: 'Stock & Expiry' },
  { id: 'billing', label: 'Medicine Sales' },
  { id: 'reports', label: 'Medicine Reports' },
];
const supplierSections = [
  { id: 'details', label: 'Supplier details' },
  { id: 'bill', label: 'Bills' },
];

export default function Pharmacy({ supplierWorkspace = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyViews = { stock: 'expiry', medicines: 'list', invoices: 'billing' };
  const supplierViews = { details: 'suppliers', bill: 'purchases' };
  const requestedView = searchParams.get('view') || (supplierWorkspace ? 'details' : 'dashboard');
  const view = supplierWorkspace ? (supplierViews[requestedView] || requestedView) : (legacyViews[requestedView] || requestedView);
  const [stock, setStock] = useState([]); const [alerts, setAlerts] = useState([]); const [bills, setBills] = useState([]); const [inventory, setInventory] = useState([]); const [suppliers, setSuppliers] = useState([]); const [purchases, setPurchases] = useState([]); const [report, setReport] = useState(null);
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [clinic, setClinic] = useState(null);
  const emptyMedicine = { name: '', description: '', genericName: '', form: 'Tablets', category: 'Ayurvedic', manufacturer: '', unit: 'tablet', reorderLevel: '0', defaultGstRate: '0', stockQuantity: '0', supplierName: '', invoiceNumber: '', batchNumber: '', expiryDate: '', purchasePrice: '', salePrice: '', gstRate: '0' };
  const [medicine, setMedicine] = useState(emptyMedicine); const [lastMedicineCode, setLastMedicineCode] = useState('');
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', email: '', address: '' });
  const [purchase, setPurchase] = useState({ medicineId: '', supplierName: '', invoiceNumber: '', batchNumber: '', expiryDate: '', quantity: '', purchasePrice: '', salePrice: '', gstRate: '0', amountPaid: '0' });
  const [paymentBill, setPaymentBill] = useState(null); const [paymentAmount, setPaymentAmount] = useState(''); const [savingPayment, setSavingPayment] = useState(false);
  const [reportRange, setReportRange] = useState({ from: `${today().slice(0, 7)}-01`, to: today() });

  useEffect(() => {
    if (!supplierWorkspace && legacyViews[requestedView]) setSearchParams({ view: legacyViews[requestedView] }, { replace: true });
  }, [requestedView, setSearchParams, supplierWorkspace]);
  async function refresh() {
    const [stockData, billData] = await Promise.all([get(`/pharmacy/stock?search=${encodeURIComponent(search)}`), get('/pharmacy/bills?page=1&pageSize=8')]);
    setStock(stockData.data); setAlerts(stockData.alerts); setBills(billData.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); get('/clinic').then(setClinic).catch(() => {}); }, [search]);
  useEffect(() => {
    const tasks = [];
    if (view === 'dashboard') tasks.push(get(`/pharmacy/reports?from=${today()}&to=${today()}`).then(setReport));
    if (view === 'inventory') tasks.push(get(`/pharmacy/inventory?search=${encodeURIComponent(search)}`).then(({ data }) => setInventory(data)));
    if (view === 'suppliers') tasks.push(get('/pharmacy/suppliers').then(({ data }) => setSuppliers(data)));
    if (view === 'purchases') {
      tasks.push(get('/pharmacy/purchases').then(({ data }) => setPurchases(data)));
      tasks.push(get('/pharmacy/suppliers').then(({ data }) => setSuppliers(data)));
    }
    if (view === 'reports') tasks.push(get(`/pharmacy/reports?from=${reportRange.from}&to=${reportRange.to}`).then(setReport));
    Promise.all(tasks).catch((e) => setError(e.message));
  }, [view, search, reportRange.from, reportRange.to]);

  async function createMedicine(event) {
    event.preventDefault(); setError(''); setSuccess('');
    try {
      const payload = { ...medicine, reorderLevel: Number(medicine.reorderLevel || 0), defaultGstRate: Number(medicine.defaultGstRate || 0), stockQuantity: Number(medicine.stockQuantity || 0), gstRate: Number(medicine.gstRate || 0), purchasePrice: medicine.purchasePrice === '' ? undefined : Number(medicine.purchasePrice), salePrice: medicine.salePrice === '' ? undefined : Number(medicine.salePrice), expiryDate: medicine.expiryDate || undefined };
      const { medicine: created } = await post('/pharmacy/medicines', payload);
      setLastMedicineCode(created.medicine_code); setSuccess(`${created.medicine_code} · ${created.name} added${Number(medicine.stockQuantity) > 0 ? ' with opening stock' : ''}.`); setMedicine({ ...emptyMedicine }); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function receiveStock(event) {
    event.preventDefault(); setError(''); setSuccess('');
    try {
      await post('/pharmacy/purchases', { supplierName: purchase.supplierName, invoiceNumber: purchase.invoiceNumber, purchasedAt: today(), amountPaid: Number(purchase.amountPaid || 0), items: [{ medicineId: purchase.medicineId, batchNumber: purchase.batchNumber, expiryDate: purchase.expiryDate, quantity: Number(purchase.quantity), purchasePrice: Number(purchase.purchasePrice), salePrice: Number(purchase.salePrice), gstRate: Number(purchase.gstRate) }] });
      setSuccess('Supplier bill recorded and batch stock updated.'); setPurchase({ ...purchase, supplierName: '', invoiceNumber: '', batchNumber: '', quantity: '', purchasePrice: '', salePrice: '', amountPaid: '0' });
      const [{ data: latestPurchases }, { data: latestSuppliers }] = await Promise.all([get('/pharmacy/purchases'), get('/pharmacy/suppliers')]);
      setPurchases(latestPurchases); setSuppliers(latestSuppliers); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function receiveSupplierPayment(event) {
    event.preventDefault(); if (!paymentBill) return;
    setError(''); setSuccess(''); setSavingPayment(true);
    try {
      const { purchase: updated } = await post(`/pharmacy/purchases/${paymentBill.id}/payments`, { amount: Number(paymentAmount) });
      const { data } = await get('/pharmacy/purchases'); setPurchases(data);
      const balance = Math.max(0, Number(updated.total) - Number(updated.amount_paid));
      setSuccess(balance === 0 ? `Payment to ${updated.supplier_name} completed${updated.invoice_number ? ` for bill ${updated.invoice_number}` : ''}.` : `Payment to ${updated.supplier_name} recorded. Remaining balance: ${money(balance)}.`);
      setPaymentBill(null); setPaymentAmount('');
    } catch (e) { setError(e.message); }
    finally { setSavingPayment(false); }
  }
  function openSupplierPayment(item) {
    const balance = Math.max(0, Number(item.total || 0) - Number(item.amount_paid || 0));
    setError(''); setSuccess(''); setPaymentBill(item); setPaymentAmount(balance.toFixed(2));
  }
  function downloadSupplierBillsExcel() {
    setError('');
    try {
      saveSupplierBillsExcel(purchases, today());
    } catch (e) { setError(e.message || 'Could not create the Excel file.'); }
  }
  async function createSupplier(event) {
    event.preventDefault(); setError(''); setSuccess('');
    try { const { supplier } = await post('/pharmacy/suppliers', newSupplier); setSuccess(`${supplier.name} saved.`); setNewSupplier({ name: '', phone: '', email: '', address: '' }); const { data } = await get('/pharmacy/suppliers'); setSuppliers(data); }
    catch (e) { setError(e.message); }
  }
  const onHand = stock.reduce((sum, item) => sum + Number(item.quantity_on_hand || 0), 0);
  const purchaseSubtotal = Number(purchase.quantity || 0) * Number(purchase.purchasePrice || 0);
  const purchaseTax = purchaseSubtotal * Number(purchase.gstRate || 0) / 100;
  const purchaseTotal = purchaseSubtotal + purchaseTax;
  const purchaseBalance = Math.max(0, purchaseTotal - Number(purchase.amountPaid || 0));

  return <>
    <PageHeader eyebrow={supplierWorkspace ? 'Supplier management' : 'Pharmacy · Medicine Management'} title={supplierWorkspace ? (view === 'suppliers' ? 'Supplier details' : 'Supplier bills') : view === 'billing' ? 'Medicine Billing' : 'Medicine Management'} description={supplierWorkspace ? (view === 'suppliers' ? 'Manage medicine supplier contact details and review their purchase history.' : 'Record supplier invoices, receive medicine batches, and review bill history.') : view === 'billing' ? 'Create patient medicine bills, record payments, and print invoices.' : 'Manage the Ayurvedic medicine catalog, inventory, expiry, and patient sales.'} action={<Badge tone="blue">{supplierWorkspace ? `${suppliers.length} suppliers` : `${stock.length} medicines`}</Badge>} />
    <ModuleSubnav basePath={supplierWorkspace ? '/suppliers' : '/pharmacy'} sections={supplierWorkspace ? supplierSections : sections} defaultView={supplierWorkspace ? 'details' : 'dashboard'} />
    <ErrorNotice error={error} /><SuccessNotice>{success}</SuccessNotice>

    {view === 'dashboard' && <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Medicine products</p><p className="mt-2 font-display text-2xl font-bold">{stock.length}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Units in stock</p><p className="mt-2 font-display text-2xl font-bold">{onHand.toLocaleString('en-IN')}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Sales today</p><p className="mt-2 font-display text-2xl font-bold">{money(report?.sales?.sales_total)}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Expiring in 30 days</p><p className="mt-2 font-display text-2xl font-bold text-amber-700">{report?.expiry?.near_expiry_batches ?? alerts.length}</p></div></div>
      <div className="grid gap-5 lg:grid-cols-2"><Panel title="Medicine Management" subtitle="Choose a task to continue"><div className="grid gap-3 sm:grid-cols-2">{sections.slice(1).map((section) => <Link key={section.id} to={`/pharmacy?view=${section.id}`} className="rounded-xl border border-line p-4 text-sm font-semibold text-forest-700 transition hover:border-forest-200 hover:bg-forest-50">{section.label}<span className="float-right">→</span></Link>)}</div></Panel><Panel title="Stock watch" subtitle="Current low-stock and expiry indicators"><div className="space-y-3"><div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm"><span>Low stock medicines</span><Badge tone="amber">{stock.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)).length}</Badge></div><div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-sm"><span>Near-expiry batches</span><Badge tone="red">{alerts.length}</Badge></div><div className="flex items-center justify-between rounded-xl bg-forest-50 px-4 py-3 text-sm"><span>Sales today</span><span className="font-bold">{money(report?.sales?.sales_total)}</span></div></div></Panel></div>
    </>}

    {view === 'list' && <Panel title="Medicine List" subtitle="Catalog of registered Ayurvedic medicines" action={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines…" className="w-36 rounded-lg border border-line px-2.5 py-1.5 text-xs sm:w-48" />}><Table columns={[
      { key: 'medicine_code', label: 'Medicine ID', render: (item) => <span className="font-mono text-xs font-semibold">{item.medicine_code || '—'}</span> },
      { key: 'name', label: 'Medicine', render: (item) => <div><p className="font-semibold">{item.name}</p><p className="text-[10px] text-muted">{item.description || item.generic_name || '—'}</p></div> },
      { key: 'form', label: 'Type', render: (item) => item.form || '—' }, { key: 'category', label: 'Category' }, { key: 'manufacturer', label: 'Manufacturer', render: (item) => item.manufacturer || '—' },
      { key: 'quantity_on_hand', label: 'Stock', render: (item) => `${Number(item.quantity_on_hand)} ${item.unit}` },
    ]} rows={stock} empty="No medicines match this search." /></Panel>}

    {view === 'inventory' && <Panel title="Medicine Inventory" subtitle="Batch, supplier, pricing, stock quantity and expiry"><Table columns={[
      { key: 'medicine_code', label: 'Medicine ID', render: (item) => <span className="font-mono text-xs">{item.medicine_code || '—'}</span> }, { key: 'medicine_name', label: 'Medicine' }, { key: 'batch_number', label: 'Batch' },
      { key: 'quantity_remaining', label: 'Available', render: (item) => `${Number(item.quantity_remaining)} ${item.unit}` }, { key: 'purchase_price', label: 'Purchase price', render: (item) => money(item.purchase_price) }, { key: 'sale_price', label: 'Selling price', render: (item) => money(item.sale_price) },
      { key: 'supplier_name', label: 'Supplier', render: (item) => item.supplier_name || '—' }, { key: 'expiry_date', label: 'Expiry', render: (item) => new Date(item.expiry_date).toLocaleDateString('en-IN') },
    ]} rows={inventory} empty="No stock batches yet. Add a medicine with opening stock or record a purchase." /></Panel>}

    {view === 'expiry' && <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Units on hand</p><p className="mt-2 font-display text-2xl font-bold">{onHand.toLocaleString('en-IN')}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Low stock</p><p className="mt-2 font-display text-2xl font-bold text-amber-700">{stock.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)).length}</p></div><div className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">Near expiry · 30 days</p><p className="mt-2 font-display text-2xl font-bold text-rose-700">{alerts.length}</p></div></div>
      <div className="space-y-5"><Panel title="Medicine stock" subtitle="Batch-wise quantities and next expiry" action={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stock…" className="w-36 rounded-lg border border-line px-2.5 py-1.5 text-xs sm:w-48" />}><Table columns={[
        { key: 'name', label: 'Medicine', render: (item) => <div><p className="font-semibold">{item.name}</p><p className="text-[10px] text-muted">{item.generic_name || item.form || item.unit}</p></div> },
        { key: 'quantity_on_hand', label: 'On hand', render: (item) => <span className={Number(item.quantity_on_hand) <= Number(item.reorder_level) ? 'font-bold text-amber-700' : 'font-semibold'}>{Number(item.quantity_on_hand)} {item.unit}</span> },
        { key: 'reorder_level', label: 'Reorder at' },
        { key: 'nearest_expiry', label: 'Next expiry', render: (item) => item.nearest_expiry ? new Date(item.nearest_expiry).toLocaleDateString('en-IN') : '—' },
      ]} rows={stock} empty="Add medicines and receive purchase batches to begin." /></Panel>
        <Panel title="Expiry watch" subtitle="Batches expiring in the next 30 days"><Table columns={[
          { key: 'medicine_name', label: 'Medicine' }, { key: 'batch_number', label: 'Batch' },
          { key: 'expiry_date', label: 'Expiry', render: (item) => new Date(item.expiry_date).toLocaleDateString('en-IN') },
          { key: 'quantity_remaining', label: 'Remaining', render: (item) => <Badge tone="amber">{item.quantity_remaining}</Badge> },
        ]} rows={alerts} empty="No near-expiry batches." /></Panel>
      </div>
    </>}

    {view === 'purchases' && <div className="space-y-5"><Panel className="max-w-3xl" title="Supplier bill entry" subtitle="Record the supplier invoice and receive its medicine batch into stock">
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={receiveStock}>
        <SelectField required label="Medicine" value={purchase.medicineId} onChange={(e) => { const selected = stock.find((item) => item.medicine_id === e.target.value); setPurchase({ ...purchase, medicineId: e.target.value, gstRate: String(selected?.default_gst_rate || 0) }); }}><option value="">Select medicine</option>{stock.map((item) => <option key={item.medicine_id} value={item.medicine_id}>{item.name}</option>)}</SelectField>
        <Field required label="Supplier" value={purchase.supplierName} onChange={(e) => setPurchase({ ...purchase, supplierName: e.target.value })} />
        <Field label="Supplier invoice" value={purchase.invoiceNumber} onChange={(e) => setPurchase({ ...purchase, invoiceNumber: e.target.value })} />
        <Field required label="Batch number" value={purchase.batchNumber} onChange={(e) => setPurchase({ ...purchase, batchNumber: e.target.value })} />
        <Field required type="date" label="Expiry date" min={today()} value={purchase.expiryDate} onChange={(e) => setPurchase({ ...purchase, expiryDate: e.target.value })} />
        <Field required type="number" min=".01" step=".01" label="Quantity" value={purchase.quantity} onChange={(e) => setPurchase({ ...purchase, quantity: e.target.value })} />
        <Field required type="number" min="0" step=".01" label="Purchase price / unit" value={purchase.purchasePrice} onChange={(e) => setPurchase({ ...purchase, purchasePrice: e.target.value })} />
        <Field required type="number" min="0" step=".01" label="Sale price / unit" value={purchase.salePrice} onChange={(e) => setPurchase({ ...purchase, salePrice: e.target.value })} />
        <Field required type="number" min="0" max="100" step=".01" label="GST %" value={purchase.gstRate} onChange={(e) => setPurchase({ ...purchase, gstRate: e.target.value })} />
        <Field type="number" min="0" max={purchaseTotal} step=".01" label="Paid amount (₹)" value={purchase.amountPaid} onChange={(e) => setPurchase({ ...purchase, amountPaid: e.target.value })} />
        <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 text-xs sm:grid-cols-4"><div><p className="text-muted">Bill amount</p><p className="mt-1 font-bold">{money(purchaseSubtotal)}</p></div><div><p className="text-muted">GST / tax</p><p className="mt-1 font-bold">{money(purchaseTax)}</p></div><div><p className="text-muted">Total amount</p><p className="mt-1 font-bold text-forest-700">{money(purchaseTotal)}</p></div><div><p className="text-muted">Balance</p><p className="mt-1 font-bold">{money(purchaseBalance)}</p></div></div>
        <Button className="sm:col-span-2">Record supplier bill</Button>
      </form>
    </Panel><Panel title="Supplier bill payment details" subtitle="Medicine quantities, invoice totals, payments received, and outstanding balance" action={<Button type="button" variant="secondary" className="px-3 py-2 text-xs" disabled={!purchases.length} onClick={downloadSupplierBillsExcel}><Download size={14} aria-hidden="true" />Download Excel</Button>}><Table columns={[
      { key: 'number', label: 'No.', render: (_item, index) => index + 1 },
      { key: 'purchased_at', label: 'Date', render: (item) => new Date(item.purchased_at).toLocaleDateString('en-IN') },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'items', label: 'Medicines', render: (item) => item.items?.map((line) => line.medicineName).filter(Boolean).join(', ') || '—' },
      { key: 'quantity', label: 'Quantity', render: (item) => item.items?.reduce((sum, line) => sum + Number(line.quantity || 0), 0) || 0 },
      { key: 'invoice_number', label: 'Bill no.', render: (item) => item.invoice_number || '—' },
      { key: 'subtotal', label: 'Bill amount', render: (item) => money(item.subtotal ?? item.total) },
      { key: 'total', label: 'Total amount', render: (item) => money(item.total) },
      { key: 'amount_paid', label: 'Paid amount', render: (item) => money(item.amount_paid) },
      { key: 'balance', label: 'Balance', render: (item) => money(Math.max(0, Number(item.total || 0) - Number(item.amount_paid || 0))) },
      { key: 'payment_status', label: 'Status', render: (item) => { const balance = Math.max(0, Number(item.total || 0) - Number(item.amount_paid || 0)); return <Badge tone={balance === 0 ? 'green' : 'amber'}>{balance === 0 ? 'Completed' : 'Balance due'}</Badge>; } },
      { key: 'actions', label: 'Action', render: (item) => { const balance = Math.max(0, Number(item.total || 0) - Number(item.amount_paid || 0)); return balance > 0 ? <Button type="button" variant="soft" className="whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => openSupplierPayment(item)}>Pay supplier</Button> : <span className="whitespace-nowrap text-xs font-semibold text-forest-700">Payment completed</span>; } },
    ]} rows={purchases} empty="No purchases have been recorded." /></Panel></div>}

    {view === 'suppliers' && <div className="space-y-5"><Panel className="max-w-3xl" title="Suppliers" subtitle="Save supplier contact details for purchase records">
      <form onSubmit={createSupplier} className="grid gap-3 sm:grid-cols-2"><Field required label="Supplier name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /><Field label="Phone" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /><Field type="email" label="Email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /><Field label="Address" value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} /><Button className="sm:col-span-2">Save supplier</Button></form>
    </Panel><Panel title="Supplier directory" subtitle="Suppliers saved from the directory and purchase entries"><Table columns={[
      { key: 'name', label: 'Supplier', render: (item) => <span className="font-semibold">{item.name}</span> }, { key: 'phone', label: 'Phone', render: (item) => item.phone || '—' }, { key: 'email', label: 'Email', render: (item) => item.email || '—' },
      { key: 'purchase_count', label: 'Purchases' }, { key: 'purchase_total', label: 'Purchase value', render: (item) => money(item.purchase_total) }, { key: 'last_purchase', label: 'Last purchase', render: (item) => item.last_purchase ? new Date(item.last_purchase).toLocaleDateString('en-IN') : '—' },
    ]} rows={suppliers} empty="No suppliers saved yet." /></Panel></div>}

    {view === 'reports' && <div className="space-y-5"><Panel title="Medicine Reports" subtitle="Sales, purchases, stock valuation, and expiry overview"><div className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field type="date" label="From" value={reportRange.from} onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })} /><Field type="date" label="To" value={reportRange.to} onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })} /><div className="self-end"><Badge tone="blue">{report?.from || reportRange.from} – {report?.to || reportRange.to}</Badge></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Medicine sales</p><p className="mt-2 text-xl font-bold">{money(report?.sales?.sales_total)}</p><p className="text-[10px] text-muted">{report?.sales?.bill_count || 0} bills</p></div><div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Purchases received</p><p className="mt-2 text-xl font-bold">{money(report?.purchases?.purchase_total)}</p><p className="text-[10px] text-muted">{report?.purchases?.purchase_count || 0} purchase records</p></div><div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Stock value at purchase cost</p><p className="mt-2 text-xl font-bold">{money(report?.inventory?.stock_value)}</p><p className="text-[10px] text-muted">{Number(report?.inventory?.units_on_hand || 0).toLocaleString('en-IN')} units on hand</p></div><div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">GST collected</p><p className="mt-2 text-xl font-bold">{money(report?.sales?.gst_total)}</p><p className="text-[10px] text-muted">From pharmacy bills in range</p></div></div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs"><Badge tone="amber">{report?.expiry?.near_expiry_batches || 0} near-expiry batches</Badge><Badge tone="red">{Number(report?.expiry?.expired_units || 0)} expired units</Badge><Badge tone="gray">{report?.inventory?.medicine_count || 0} active medicine records</Badge></div>
    </Panel></div>}

    {view === 'add' && <Panel className="max-w-5xl" title="Add Medicine" subtitle="Create the catalog entry and optionally receive its opening stock">
      <form onSubmit={createMedicine} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Medicine ID" value={lastMedicineCode || 'Generated automatically on save'} readOnly className="opacity-75" />
        <Field required label="Medicine name" placeholder="Ashwagandha Tablets" value={medicine.name} onChange={(e) => setMedicine({ ...medicine, name: e.target.value })} />
        <SelectField required label="Medicine type" value={medicine.form} onChange={(e) => setMedicine({ ...medicine, form: e.target.value })}><option value="">Select type</option><option>Tablets</option><option>Capsules</option><option>Churnam (powder)</option><option>Kashayam</option><option>Arishtam</option><option>Asavam</option><option>Oils</option><option>Lehyam</option><option>Herbal creams</option></SelectField>
        <Field required label="Category" value={medicine.category} onChange={(e) => setMedicine({ ...medicine, category: e.target.value })} />
        <Field label="Manufacturer" placeholder="Company name" value={medicine.manufacturer} onChange={(e) => setMedicine({ ...medicine, manufacturer: e.target.value })} />
        <SelectField required label="Unit" value={medicine.unit} onChange={(e) => setMedicine({ ...medicine, unit: e.target.value })}><option value="tablet">Tablet</option><option value="syrup">Syrup</option><option value="powder">Powder</option><option value="capsule">Capsule</option></SelectField>
        <Field required type="number" min="0" step=".01" label="Stock quantity" value={medicine.stockQuantity} onChange={(e) => setMedicine({ ...medicine, stockQuantity: e.target.value })} />
        <Field required={Number(medicine.stockQuantity) > 0} label="Batch number" placeholder="ASH2026" value={medicine.batchNumber} onChange={(e) => setMedicine({ ...medicine, batchNumber: e.target.value })} />
        <Field required={Number(medicine.stockQuantity) > 0} type="number" min="0" step=".01" label="Purchase price / unit (₹)" value={medicine.purchasePrice} onChange={(e) => setMedicine({ ...medicine, purchasePrice: e.target.value })} />
        <Field required={Number(medicine.stockQuantity) > 0} type="number" min="0" step=".01" label="Selling price / unit (₹)" value={medicine.salePrice} onChange={(e) => setMedicine({ ...medicine, salePrice: e.target.value })} />
        <Field required={Number(medicine.stockQuantity) > 0} type="date" min={today()} label="Expiry date" value={medicine.expiryDate} onChange={(e) => setMedicine({ ...medicine, expiryDate: e.target.value })} />
        <Field required={Number(medicine.stockQuantity) > 0} label="Supplier" placeholder="Supplier name" value={medicine.supplierName} onChange={(e) => setMedicine({ ...medicine, supplierName: e.target.value })} />
        <Field label="Supplier invoice" value={medicine.invoiceNumber} onChange={(e) => setMedicine({ ...medicine, invoiceNumber: e.target.value })} />
        <Field type="number" min="0" max="100" step=".01" label="GST rate %" value={medicine.gstRate} onChange={(e) => setMedicine({ ...medicine, gstRate: e.target.value })} />
        <Field type="number" min="0" label="Low-stock alert at" value={medicine.reorderLevel} onChange={(e) => setMedicine({ ...medicine, reorderLevel: e.target.value })} />
        <Field label="Generic name" value={medicine.genericName} onChange={(e) => setMedicine({ ...medicine, genericName: e.target.value })} />
        <Field className="sm:col-span-2 lg:col-span-3" label="Description" placeholder="Ayurvedic herbal medicine" value={medicine.description} onChange={(e) => setMedicine({ ...medicine, description: e.target.value })} />
        <Button variant="secondary" className="sm:col-span-2 lg:col-span-3">Save medicine{Number(medicine.stockQuantity) > 0 ? ' and opening stock' : ''}</Button>
      </form>
    </Panel>}

    {view === 'billing' && <MedicineBilling clinic={clinic} bills={bills} onSaved={refresh} />}
    {paymentBill && <Modal title="Pay supplier" onClose={() => !savingPayment && setPaymentBill(null)}>
      <form onSubmit={receiveSupplierPayment} className="space-y-4">
        <ErrorNotice error={error} />
        <div className="rounded-xl bg-canvas p-4 text-sm"><p className="font-semibold">{paymentBill.supplier_name}</p><p className="mt-1 text-xs text-muted">Bill {paymentBill.invoice_number || '—'} · Current balance {money(Math.max(0, Number(paymentBill.total || 0) - Number(paymentBill.amount_paid || 0)))}</p></div>
        <Field required type="number" min=".01" max={Math.max(0, Number(paymentBill.total || 0) - Number(paymentBill.amount_paid || 0))} step=".01" label="Amount received (₹)" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={savingPayment} onClick={() => setPaymentBill(null)}>Cancel</Button><Button disabled={savingPayment}>{savingPayment ? 'Saving payment…' : 'Save payment'}</Button></div>
      </form>
    </Modal>}
  </>;
}
