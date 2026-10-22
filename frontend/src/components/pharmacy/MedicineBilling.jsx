import { useEffect, useMemo, useState } from 'react';
import { CircleX, Download, FileText, Plus, Printer, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { get, post } from '../../api/client.js';
import { CLINIC_MARK, getClinicName } from '../../config/clinicBrand.js';
import { Badge, Button, ErrorNotice, Field, Modal, Panel, SelectField, Table, money } from '../UI.jsx';

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => { const random = Math.random() * 16 | 0; return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16); });
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '—';
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const statusFor = (paid, total) => Number(total) === 0 || Number(paid) >= Number(total) ? 'Paid' : Number(paid) > 0 ? 'Partially paid' : 'Unpaid';

function InvoiceDocument({ bill, clinic }) {
  const patientId = bill.uhid || bill.patient_id || '—';
  const paymentStatus = bill.payment_status || statusFor(bill.amount_paid, bill.total);
  const due = Math.max(0, Number(bill.total) - Number(bill.amount_paid));
  return <article className="overflow-hidden rounded-2xl border border-[#e1e4d8] bg-[#fbfaf6] text-[#25372e] shadow-sm print:rounded-none print:shadow-none">
    <header className="relative bg-forest-800 px-5 py-6 text-white sm:px-8 sm:py-7 [print-color-adjust:exact]">
      <div className="absolute inset-x-0 bottom-0 h-1 bg-[#c8aa63]" />
      <div className="grid gap-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <img src={CLINIC_MARK} alt={`${getClinicName(clinic)} logo`} className="h-16 w-16 rounded-xl bg-white object-contain p-0.5 sm:h-20 sm:w-20" />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#e6d6a5]">Ayurvedic care · Pharmacy</p>
          <h2 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">{getClinicName(clinic)}</h2>
          {clinic?.address && <p className="mt-2 max-w-lg text-xs leading-5 text-white/75">{clinic.address}</p>}
          {clinic?.phone && <p className="mt-1 text-xs text-white/75">Phone · {clinic.phone}</p>}
        </div>
        <div className="min-w-52 rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#e6d6a5]">Medicine invoice</p>
          <p className="mt-2 break-all font-mono text-sm font-bold">{bill.invoice_number}</p>
          <p className="mt-2 text-[10px] text-white/75">{new Date(bill.created_at).toLocaleString('en-IN')}</p>
        </div>
      </div>
    </header>

    <div className="p-5 sm:p-8">
      <section className="grid overflow-hidden rounded-xl border border-[#e5e7dd] bg-white sm:grid-cols-2">
        <div className="p-4 sm:p-5">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-[.18em] text-forest-700">Patient details</p>
          <p className="text-base font-bold">{bill.patient_name || 'Walk-in customer'}</p>
          <div className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <p><span className="text-slate-500">Patient ID / UHID</span><br/><strong>{patientId}</strong></p>
            <p><span className="text-slate-500">Phone</span><br/><strong>{bill.patient_phone || '—'}</strong></p>
          </div>
        </div>
        <div className="border-t border-[#e5e7dd] bg-[#f4f5ee] p-4 sm:border-l sm:border-t-0 sm:p-5">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-[.18em] text-forest-700">Care details</p>
          <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <p><span className="text-slate-500">Doctor</span><br/><strong>{bill.doctor_name || '—'}</strong></p>
            <p><span className="text-slate-500">Prescription</span><br/><strong>{bill.prescription_id ? `RX-${bill.prescription_id.slice(0, 8).toUpperCase()}` : '—'}</strong></p>
          </div>
        </div>
      </section>

      {bill.cancelled_at && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">Cancelled · {bill.cancellation_reason || 'No reason recorded'} · {new Date(bill.cancelled_at).toLocaleString('en-IN')}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[#e1e4d8] bg-white">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead><tr className="bg-[#edf2e9] text-[9px] uppercase tracking-[.12em] text-forest-800 [print-color-adjust:exact]"><th className="px-3 py-3">Medicine</th><th className="px-2 py-3">Batch</th><th className="px-2 py-3">Qty</th><th className="px-2 py-3">Price</th><th className="px-2 py-3">Discount</th><th className="px-2 py-3">GST</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
          <tbody>{bill.items?.map((item, index) => <tr key={item.id || index} className="border-t border-[#ebede6] align-top">
            <td className="px-3 py-3"><strong>{item.medicine_name || item.medicineName}</strong><div className="mt-1 text-[10px] text-slate-500">{item.medicine_type || item.medicineType || 'Ayurvedic medicine'}</div></td>
            <td className="px-2 py-3">{item.batch_number || item.batchNumber || '—'}</td><td className="px-2 py-3">{item.quantity}</td>
            <td className="px-2 py-3">{money(item.unit_price ?? item.price)}</td><td className="px-2 py-3">{money(item.discount_amount ?? item.discountAmount ?? 0)}</td>
            <td className="px-2 py-3">{item.gst_rate ?? item.rate ?? 0}%<div className="mt-1 text-[10px] text-slate-500">{money(item.tax_amount ?? item.taxAmount ?? 0)}</div></td>
            <td className="px-3 py-3 text-right font-bold">{money(item.line_total ?? item.lineTotal ?? 0)}</td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_290px]">
        <section className="rounded-xl border border-[#e5e7dd] bg-white p-4 sm:p-5">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-[.18em] text-forest-700">Payment details</p>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0e8] pb-3">
            <span className="text-xs text-slate-500">Status</span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${bill.cancelled_at ? 'bg-rose-50 text-rose-700' : paymentStatus === 'Paid' ? 'bg-[#e8f2e9] text-forest-800' : 'bg-[#f8f0dc] text-[#876b26]'}`}>{bill.cancelled_at ? 'Cancelled' : paymentStatus}</span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Method</span><strong className="capitalize">{String(bill.payment_mode || '—').replace('-', ' ')}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Amount paid</span><strong>{money(bill.amount_paid)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Balance due</span><strong>{money(due)}</strong></div>
            {bill.payment_reference && <div className="flex justify-between gap-3"><span className="text-slate-500">Reference</span><strong className="break-all text-right">{bill.payment_reference}</strong></div>}
          </div>
        </section>
        <section className="rounded-xl border border-[#e2e6da] bg-[#f4f5ee] p-4 sm:p-5">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-[.18em] text-forest-700">Bill summary</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-slate-600">Subtotal</span><strong>{money(bill.subtotal)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-600">Discount</span><strong>− {money(bill.discount)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-600">GST / tax</span><strong>{money(bill.tax)}</strong></div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-forest-800 px-3 py-3 text-white [print-color-adjust:exact]">
            <span className="text-xs font-semibold">Final total</span><strong className="text-lg">{money(bill.total)}</strong>
          </div>
        </section>
      </div>

      <footer className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-[#e1e4d8] pt-5 text-[10px] text-slate-500">
        <div><p className="font-semibold text-forest-800">Thank you for choosing us.</p><p className="mt-1">Wishing you good health.</p></div>
        <p className="min-w-40 border-t border-[#aeb9aa] pt-2 text-center">Authorized signature</p>
      </footer>
    </div>
  </article>;
}

export default function MedicineBilling({ clinic, bills, onSaved }) {
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ patientId: '', doctorId: '', prescriptionId: '', paymentMode: 'cash', paymentReference: '' });
  const [line, setLine] = useState({ medicineId: '', quantity: '1' });
  const [items, setItems] = useState([]);
  const [amountPaid, setAmountPaid] = useState('0');
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastBill, setLastBill] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [billToPrint, setBillToPrint] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => { get('/pharmacy/stock').then(({ data }) => setMedicineOptions(data)).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const timer = setTimeout(() => get(`/pharmacy/patients?search=${encodeURIComponent(patientSearch)}`).then(({ data }) => setPatients(data)).catch((e) => setError(e.message)), 180);
    return () => clearTimeout(timer);
  }, [patientSearch]);
  useEffect(() => { get('/pharmacy/prescriptions').then(({ data }) => setPrescriptions(data)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { get('/pharmacy/doctors').then(({ data }) => setDoctors(data)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (billToPrint) window.print(); }, [billToPrint]);

  const selectedMedicine = medicineOptions.find((medicine) => medicine.medicine_id === line.medicineId);
  const matchingMedicines = medicineOptions;
  const selectedPatient = patients.find((patient) => patient.id === form.patientId);
  const totals = useMemo(() => {
    const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0));
    const discount = roundMoney(items.reduce((sum, item) => sum + Number(item.discount || 0), 0));
    const tax = roundMoney(items.reduce((sum, item) => sum + roundMoney(Math.max(0, Number(item.quantity) * Number(item.price) - Number(item.discount || 0)) * Number(item.gstRate || 0) / 100), 0));
    const total = roundMoney(Math.max(0, subtotal - discount + tax));
    const paid = Math.max(0, Number(amountPaid || 0));
    return { subtotal, discount, tax, total, paid, due: Math.max(0, total - paid), status: items.length ? statusFor(paid, total) : 'Unpaid' };
  }, [items, amountPaid]);

  async function choosePrescription(id) {
    const chosen = prescriptions.find((item) => item.prescription_id === id);
    setForm((current) => ({ ...current, prescriptionId: id, patientId: chosen?.patient_id || current.patientId, doctorId: chosen?.doctor_id || (id ? '' : current.doctorId) }));
    if (chosen) {
      setPatientSearch(chosen.patient_name);
      try {
        const { data: currentStock } = await get('/pharmacy/stock');
        setMedicineOptions(currentStock);
        setItems((chosen.medicines || []).filter((medicine) => medicine.medicineId).map((medicine) => {
          const available = currentStock.find((entry) => entry.medicine_id === medicine.medicineId);
          return { medicineId: medicine.medicineId, name: medicine.medicineName, code: available?.medicine_code || '', type: available?.form || '', description: available?.description || available?.generic_name || '', unit: available?.unit || '', batchNumber: available?.batch_number || '', expiry: available?.batch_expiry || '', available: Number(available?.quantity_on_hand || 0), price: Number(available?.sale_price || 0), gstRate: Number(available?.gst_rate || 0), quantity: Number(medicine.quantity), discount: 0 };
        }));
      } catch (e) { setError(e.message); }
    }
  }

  function addMedicine() {
    setError('');
    const quantity = Number(line.quantity);
    if (!selectedMedicine) return setError('Choose a medicine from the search results.');
    if (!Number.isFinite(quantity) || quantity <= 0) return setError('Enter a quantity greater than zero.');
    if (Number(selectedMedicine.quantity_on_hand) <= 0) return setError('This medicine has no unexpired stock available.');
    const existing = items.find((item) => item.medicineId === selectedMedicine.medicine_id);
    const totalQuantity = quantity + Number(existing?.quantity || 0);
    if (totalQuantity > Number(selectedMedicine.quantity_on_hand)) return setError(`Only ${selectedMedicine.quantity_on_hand} unexpired units are available.`);
    if (existing) {
      setItems((current) => current.map((item) => item.medicineId === selectedMedicine.medicine_id ? { ...item, quantity: totalQuantity } : item));
    } else {
      setItems((current) => [...current, { medicineId: selectedMedicine.medicine_id, name: selectedMedicine.name, code: selectedMedicine.medicine_code || '', type: selectedMedicine.form || '', description: selectedMedicine.description || selectedMedicine.generic_name || '', unit: selectedMedicine.unit || '', batchNumber: selectedMedicine.batch_number || '', expiry: selectedMedicine.batch_expiry || '', available: Number(selectedMedicine.quantity_on_hand || 0), price: Number(selectedMedicine.sale_price || 0), gstRate: Number(selectedMedicine.gst_rate || 0), quantity, discount: 0 }]);
    }
    setLine({ medicineId: '', quantity: '1' });
  }

  function updateItem(medicineId, updates) {
    setItems((current) => current.map((item) => item.medicineId === medicineId ? { ...item, ...updates } : item));
  }

  function clearForm() {
    setError(''); setSuccess(''); setItems([]); setLine({ medicineId: '', quantity: '1' }); setPatientSearch('');
    setAmountPaid('0'); setForm({ patientId: '', doctorId: '', prescriptionId: '', paymentMode: 'cash', paymentReference: '' }); setIdempotencyKey(newIdempotencyKey());
  }

  async function saveBill(event) {
    event.preventDefault(); setError(''); setSuccess('');
    if (patientSearch.trim() && !form.patientId) return setError('Select a registered patient, or clear the patient search for a walk-in sale.');
    if (!items.length) return setError('Add at least one medicine to this bill.');
    for (const item of items) {
      const quantity = Number(item.quantity); const unitPrice = Number(item.price); const gstRate = Number(item.gstRate); const base = quantity * unitPrice;
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(item.available)) return setError(`${item.name}: quantity must be between 0 and ${item.available}.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return setError(`${item.name}: unit price cannot be negative.`);
      if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) return setError(`${item.name}: GST must be between 0 and 100%.`);
      if (!Number.isFinite(Number(item.discount)) || Number(item.discount) < 0 || Number(item.discount) > base) return setError(`${item.name}: discount cannot exceed its line amount.`);
    }
    if (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0 || Number(amountPaid) > totals.total) return setError('Amount received must be between ₹0 and the bill total.');
    setSaving(true);
    try {
      const { bill } = await post('/pharmacy/bills', {
        patientId: form.patientId || null, doctorId: form.doctorId || null, prescriptionId: form.prescriptionId || null,
        items: items.map(({ medicineId, quantity, price, gstRate, discount }) => ({ medicineId, quantity: Number(quantity), unitPrice: Number(price), gstRate: Number(gstRate), discount: Number(discount || 0) })),
        amountPaid: Number(amountPaid || 0), paymentMode: form.paymentMode, paymentReference: form.paymentReference.trim() || null, idempotencyKey,
      });
      setLastBill(bill); clearForm(); setSuccess(`Invoice ${bill.invoice_number} saved. Stock was updated.`);
      try { await onSaved?.(); } catch (refreshError) { setError(`Invoice ${bill.invoice_number} was saved, but the sales list could not refresh: ${refreshError.message}`); }
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function loadInvoice(id) {
    setError('');
    try { const { bill } = await get(`/pharmacy/bills/${id}`); setInvoicePreview(bill); }
    catch (e) { setError(e.message); }
  }
  async function printInvoice(id) {
    setError('');
    try { const { bill } = await get(`/pharmacy/bills/${id}`); setInvoicePreview(null); setBillToPrint(bill); }
    catch (e) { setError(e.message); }
  }
  async function downloadInvoicePdf(id) {
    setError(''); setDownloadingPdf(true);
    try {
      const { bill } = await get(`/pharmacy/bills/${id}`);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 14;
      const pdfMoney = (amount) => `INR ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const drawTableHeader = (top) => {
        const columns = [{ label: 'Medicine', width: 62 }, { label: 'Batch', width: 22 }, { label: 'Qty', width: 12 }, { label: 'Price', width: 24 }, { label: 'Discount', width: 20 }, { label: 'GST', width: 18 }, { label: 'Amount', width: 24 }];
        pdf.setFillColor(236, 244, 238); pdf.setDrawColor(207, 220, 211); pdf.rect(margin, top, pageWidth - margin * 2, 8, 'FD');
        let x = margin;
        columns.forEach((column) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(45, 78, 57); pdf.text(column.label, x + 2, top + 5.3); x += column.width; });
        return columns;
      };
      pdf.setProperties({ title: `Medicine Invoice ${bill.invoice_number}`, subject: 'Ayurvedic clinic pharmacy bill' });
      pdf.setFillColor(34, 76, 53); pdf.rect(0, 0, pageWidth, 35, 'F');
      pdf.setFillColor(200, 170, 99); pdf.rect(0, 35, pageWidth, 1.2, 'F');
      const clinicInfoX = margin + 35;
      const clinicInfoWidth = pageWidth - margin - 55 - clinicInfoX;
      pdf.addImage(CLINIC_MARK, 'JPEG', margin, 4, 30, 30);
      pdf.setTextColor(230, 214, 165); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.text('AYURVEDIC CARE  |  PHARMACY', clinicInfoX, 8);
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(12); pdf.text(pdf.splitTextToSize(getClinicName(clinic), clinicInfoWidth).slice(0, 2), clinicInfoX, 15);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
      if (clinic?.address) pdf.text(pdf.splitTextToSize(clinic.address, clinicInfoWidth).slice(0, 1), clinicInfoX, 24);
      if (clinic?.phone) pdf.text(`Phone: ${clinic.phone}`, clinicInfoX, 32);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('MEDICINE INVOICE', pageWidth - margin, 10, { align: 'right' });
      pdf.setFontSize(8); pdf.text(bill.invoice_number, pageWidth - margin, 18, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(new Date(bill.created_at).toLocaleString('en-IN'), pageWidth - margin, 26, { align: 'right' });
      let y = 44;
      const details = [
        [{ label: 'PATIENT', value: bill.patient_name || 'Walk-in customer' }, { label: 'PATIENT ID / UHID', value: bill.uhid || bill.patient_id || '-' }],
        [{ label: 'PHONE', value: bill.patient_phone || '-' }, { label: 'DOCTOR', value: bill.doctor_name || '-' }],
        [{ label: 'PRESCRIPTION', value: bill.prescription_id ? `RX-${bill.prescription_id.slice(0, 8).toUpperCase()}` : '-' }, { label: 'PAYMENT STATUS', value: bill.payment_status || statusFor(bill.amount_paid, bill.total) }],
      ];
      pdf.setFillColor(244, 245, 238); pdf.setDrawColor(225, 228, 216); pdf.roundedRect(margin, y, pageWidth - margin * 2, 27, 2, 2, 'FD');
      details.forEach((row, index) => {
        const rowY = y + 6 + index * 7.5;
        row.forEach((cell, columnIndex) => {
          const x = columnIndex === 0 ? margin + 4 : pageWidth / 2 + 2;
          pdf.setTextColor(103, 119, 106); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.text(cell.label, x, rowY);
          pdf.setTextColor(37, 55, 46); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(pdf.splitTextToSize(String(cell.value), 68).slice(0, 1), x, rowY + 3.4);
        });
      });
      y += 31;
      if (bill.cancelled_at) { pdf.setTextColor(175, 48, 55); pdf.setFont('helvetica', 'bold'); pdf.text(pdf.splitTextToSize(`CANCELLED - ${bill.cancellation_reason || 'No reason recorded'}`, pageWidth - margin * 2), margin, y); y += 8; }
      pdf.setTextColor(35, 45, 39);
      y += 2;
      let columns = drawTableHeader(y); y += 8;
      (bill.items || []).forEach((item, index) => {
        const name = item.medicine_name || item.medicineName || 'Medicine';
        const detail = item.medicine_type || item.medicineType || 'Ayurvedic medicine';
        const medicineLines = pdf.splitTextToSize(`${name}\n${detail}`, columns[0].width - 4);
        const rowHeight = Math.max(8, medicineLines.length * 3.7 + 2);
        if (y + rowHeight > 258) { pdf.addPage(); y = 18; columns = drawTableHeader(y); y += 8; }
        if (index % 2 === 0) { pdf.setFillColor(250, 251, 249); pdf.rect(margin, y, pageWidth - margin * 2, rowHeight, 'F'); }
        pdf.setDrawColor(224, 230, 225); pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
        let x = margin;
        pdf.setTextColor(35, 45, 39); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.4); pdf.text(medicineLines, x + 2, y + 4); x += columns[0].width;
        const values = [item.batch_number || item.batchNumber || '-', String(item.quantity), pdfMoney(item.unit_price ?? item.price), pdfMoney(item.discount_amount ?? item.discountAmount), `${item.gst_rate ?? item.rate ?? 0}%`, pdfMoney(item.line_total ?? item.lineTotal)];
        values.forEach((value, valueIndex) => { const column = columns[valueIndex + 1]; pdf.text(String(value), valueIndex === 0 ? x + 2 : x + column.width - 2, y + rowHeight / 2 + 1.1, valueIndex === 0 ? undefined : { align: 'right' }); x += column.width; });
        y += rowHeight;
      });
      y += 7;
      const summaryHeight = 42 + (bill.payment_reference ? 6 : 0);
      if (y + summaryHeight + 24 > 278) { pdf.addPage(); y = 20; }
      const summaryX = pageWidth - margin - 66;
      const totalRows = [['Subtotal', pdfMoney(bill.subtotal)], ['Discount', `- ${pdfMoney(bill.discount)}`], ['GST / tax', pdfMoney(bill.tax)], ['Final total', pdfMoney(bill.total)], ['Amount paid', pdfMoney(bill.amount_paid)], ['Balance due', pdfMoney(Math.max(0, Number(bill.total) - Number(bill.amount_paid)))], ['Payment method', String(bill.payment_mode || '-').replace('-', ' ')]];
      totalRows.forEach(([label, amount]) => {
        const isTotal = label === 'Final total'; if (isTotal) { pdf.setFillColor(34, 76, 53); pdf.roundedRect(summaryX - 2, y - 0.5, pageWidth - margin - summaryX + 2, 8, 1.5, 1.5, 'F'); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(255, 255, 255); } else { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(45, 60, 49); }
        pdf.text(label, summaryX, y + 2); pdf.text(amount, pageWidth - margin, y + 2, { align: 'right' }); y += isTotal ? 9 : 5.5;
      });
      if (bill.payment_reference) { pdf.setFontSize(8); pdf.text(`Payment reference: ${bill.payment_reference}`, summaryX, y + 1); y += 6; }
      y += 18; pdf.setDrawColor(120, 135, 124); pdf.line(pageWidth - margin - 55, y, pageWidth - margin, y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(90, 100, 92); pdf.text('Authorized signature', pageWidth - margin - 27.5, y + 5, { align: 'center' });
      pdf.setFontSize(8); pdf.text('Thank you for choosing us. Wishing you good health.', margin, y + 5);
      pdf.save(`${bill.invoice_number}.pdf`);
    } catch (e) { setError(e.message || 'Could not download the invoice PDF.'); }
    finally { setDownloadingPdf(false); }
  }
  async function cancelSavedBill(bill) {
    const reason = window.prompt(`Enter a reason to cancel invoice ${bill.invoice_number}:`);
    if (reason === null) return;
    if (reason.trim().length < 3) return setError('Enter a cancellation reason with at least 3 characters.');
    setError(''); setSuccess('');
    try {
      const { bill: cancelled } = await post(`/pharmacy/bills/${bill.id}/cancel`, { reason: reason.trim() });
      setLastBill((current) => current?.id === cancelled.id ? cancelled : current);
      setInvoicePreview((current) => current?.id === cancelled.id ? cancelled : current);
      setSuccess(`Invoice ${cancelled.invoice_number} cancelled and its batch stock restored.`);
      await onSaved?.();
    } catch (e) { setError(e.message); }
  }

  return <div className="space-y-5">
    <ErrorNotice error={error} />
    {success && <div role="status" className="rounded-xl border border-forest-100 bg-forest-50 px-4 py-3 text-sm text-forest-700">{success}</div>}
    <form onSubmit={saveBill} className="space-y-5">
      <Panel title="Invoice and patient details" subtitle="Link a registered patient, doctor, and prescription when applicable.">
        <div className="mb-4 flex flex-wrap gap-2"><Badge tone="green">Invoice number assigned on save</Badge><Badge tone="blue">Billing date · {new Date().toLocaleDateString('en-IN')}</Badge></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="Prescription number (optional)" value={form.prescriptionId} onChange={(event) => choosePrescription(event.target.value)}><option value="">No prescription selected</option>{prescriptions.map((prescription) => <option key={prescription.prescription_id} value={prescription.prescription_id}>RX-{prescription.prescription_id.slice(0, 8).toUpperCase()} · {prescription.patient_name} · {fmtDate(prescription.visit_date)}</option>)}</SelectField>
          <div><Field label="Search patient by name, phone, or Patient ID" placeholder="Type a name, UHID, or phone" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setForm((current) => ({ ...current, patientId: '' })); }} />
            <SelectField className="mt-3" label="Select patient (optional for walk-in)" value={form.patientId} onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}><option value="">Walk-in customer</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.uhid} · {patient.phone}</option>)}</SelectField>
          </div>
          <div className="rounded-xl border border-line bg-canvas/60 p-4 text-xs">
            <p className="mb-2 flex items-center gap-2 font-bold text-ink"><UserRound size={15} aria-hidden="true" />Patient information</p>
            <div className="space-y-1.5 text-muted"><p>Patient ID: <strong className="text-ink">{selectedPatient?.uhid || '—'}</strong></p><p>Name: <strong className="text-ink">{selectedPatient?.name || 'Walk-in customer'}</strong></p><p>Phone: <strong className="text-ink">{selectedPatient?.phone || '—'}</strong></p></div>
          </div>
          <SelectField label="Doctor name" value={form.doctorId} disabled={Boolean(form.prescriptionId)} onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))}><option value="">No doctor selected</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</SelectField>
          {form.prescriptionId && <div className="self-end pb-2 text-[11px] text-muted">Patient, doctor, and prescribed medicines are linked from this prescription.</div>}
        </div>
      </Panel>

      <Panel title="Select medicines" subtitle="Search the current catalog. Saleable stock and expiry are checked again during the stock transaction.">
        <div className="grid gap-3 lg:grid-cols-[1fr_150px_auto] lg:items-end">
          <div>
            <SelectField label={`Select a medicine (${matchingMedicines.length} available)`} value={line.medicineId}
              onChange={(event) => setLine((current) => ({ ...current, medicineId: event.target.value }))}>
              <option value="">Choose a medicine from the list</option>
              {matchingMedicines.map((medicine) => <option key={medicine.medicine_id} value={medicine.medicine_id}>{medicine.name} · {medicine.form || medicine.unit || 'Medicine'} · {Number(medicine.quantity_on_hand)} in stock · {money(medicine.sale_price)}</option>)}
            </SelectField>
          </div>
          <Field label="Quantity" type="number" min=".01" step=".01" max={selectedMedicine?.quantity_on_hand || undefined} value={line.quantity} onChange={(event) => setLine((current) => ({ ...current, quantity: event.target.value }))} />
          <Button type="button" variant="secondary" onClick={addMedicine}><Plus size={16} aria-hidden="true" />Add medicine</Button>
        </div>
        {selectedMedicine && <div className="mt-4 grid gap-3 rounded-xl border border-line bg-canvas/60 p-4 text-xs sm:grid-cols-2 xl:grid-cols-5">
          <p><span className="text-muted">Medicine type</span><br/><strong>{selectedMedicine.form || '—'}</strong></p>
          <p><span className="text-muted">Available stock</span><br/><strong>{selectedMedicine.quantity_on_hand} {selectedMedicine.unit}</strong></p>
          <p><span className="text-muted">Next batch</span><br/><strong>{selectedMedicine.batch_number || '—'}</strong></p>
          <p><span className="text-muted">Expiry / unit price</span><br/><strong>{fmtDate(selectedMedicine.batch_expiry)} · {money(selectedMedicine.sale_price)}</strong></p>
          <p><span className="text-muted">GST rate</span><br/><strong>{Number(selectedMedicine.gst_rate || 0)}%</strong></p>
          {Number(selectedMedicine.quantity_on_hand) <= Number(selectedMedicine.reorder_level) && <p className="sm:col-span-2 xl:col-span-5"><Badge tone="amber">Low stock warning · reorder at {selectedMedicine.reorder_level} {selectedMedicine.unit}</Badge></p>}
          {Number(selectedMedicine.quantity_on_hand) === 0 && <p className="sm:col-span-2 xl:col-span-5"><Badge tone="red">No unexpired batch is available. Expired stock: {selectedMedicine.expired_quantity || 0}.</Badge></p>}
          {Number(selectedMedicine.expired_quantity) > 0 && Number(selectedMedicine.quantity_on_hand) > 0 && <p className="sm:col-span-2 xl:col-span-5"><Badge tone="amber">Expired units are excluded from available stock ({selectedMedicine.expired_quantity}).</Badge></p>}
        </div>}
        {items.length > 0 && <div className="mt-5 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-canvas text-[10px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-3">Medicine</th><th className="px-3 py-3">Batch / expiry</th><th className="px-3 py-3">Price ₹</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Discount ₹</th><th className="px-3 py-3">GST</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Action</th></tr></thead>
            <tbody className="divide-y divide-line">{items.map((item) => {
              const base = Number(item.quantity) * Number(item.price); const lineDiscount = Number(item.discount || 0); const tax = roundMoney(Math.max(0, base-lineDiscount) * Number(item.gstRate || 0) / 100);
              const exceedsStock = Number(item.quantity) > Number(item.available);
              return <tr key={item.medicineId} className="align-middle"><td className="px-3 py-3"><p className="font-semibold">{item.name}</p><p className="mt-1 text-[10px] text-muted">{item.type || item.description || 'Medicine'}</p></td><td className="px-3 py-3">{item.batchNumber || 'FEFO'}<p className="mt-1 text-[10px] text-muted">Exp. {fmtDate(item.expiry)}</p></td>
                <td className="px-3 py-3"><input aria-label={`${item.name} unit price`} className="w-24 rounded-lg border border-line px-2 py-1.5" type="number" min="0" step=".01" value={item.price} onChange={(event) => updateItem(item.medicineId, { price: event.target.value })} /></td><td className="px-3 py-3"><input aria-label={`${item.name} quantity`} className="w-24 rounded-lg border border-line px-2 py-1.5" type="number" min=".01" max={item.available} step=".01" value={item.quantity} onChange={(event) => updateItem(item.medicineId, { quantity: event.target.value })} /><p className={`mt-1 text-[10px] ${exceedsStock ? 'text-rose-700' : 'text-muted'}`}>Available: {item.available}</p></td>
                <td className="px-3 py-3"><input aria-label={`${item.name} discount`} className="w-24 rounded-lg border border-line px-2 py-1.5" type="number" min="0" max={base} step=".01" value={item.discount} onChange={(event) => updateItem(item.medicineId, { discount: event.target.value })} /></td>
                <td className="px-3 py-3"><input aria-label={`${item.name} GST rate`} className="w-20 rounded-lg border border-line px-2 py-1.5" type="number" min="0" max="100" step=".01" value={item.gstRate} onChange={(event) => updateItem(item.medicineId, { gstRate: event.target.value })} /><p className="mt-1 text-[10px] text-muted">{money(tax)} tax</p></td><td className="px-3 py-3 font-bold">{money(Math.max(0,base-lineDiscount)+tax)}</td><td className="px-3 py-3"><button type="button" aria-label={`Remove ${item.name}`} onClick={() => setItems((current) => current.filter((entry) => entry.medicineId !== item.medicineId))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={14} aria-hidden="true" />Remove</button></td></tr>;
            })}</tbody>
          </table>
        </div>}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Panel title="Payment" subtitle="Record payment mode, amount received, and optional reference.">
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Payment method" value={form.paymentMode} onChange={(event) => setForm((current) => ({ ...current, paymentMode: event.target.value }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank-transfer">Bank transfer</option><option value="other">Other</option></SelectField>
            <Field label="Amount received (₹)" type="number" min="0" max={totals.total} step=".01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
            <Field className="sm:col-span-2" label="Payment reference number (optional)" placeholder="UPI transaction ID or card reference" value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} />
          </div>
        </Panel>
        <Panel title="Bill summary" subtitle="Totals update automatically as quantities and discounts change.">
          <div className="space-y-2.5 text-sm"><div className="flex justify-between"><span className="text-muted">Subtotal</span><strong>{money(totals.subtotal)}</strong></div><div className="flex justify-between"><span className="text-muted">Discount</span><strong>− {money(totals.discount)}</strong></div><div className="flex justify-between"><span className="text-muted">Applicable GST / tax</span><strong>{money(totals.tax)}</strong></div><div className="flex justify-between border-t border-line pt-3 text-base"><span className="font-bold">Final total</span><strong className="text-forest-700">{money(totals.total)}</strong></div><div className="flex justify-between"><span className="text-muted">Amount paid</span><strong>{money(totals.paid)}</strong></div><div className="flex justify-between"><span className="text-muted">Balance due</span><strong>{money(totals.due)}</strong></div><div className="flex items-center justify-between pt-1"><span className="text-muted">Payment status</span><Badge tone={totals.status === 'Paid' ? 'green' : totals.status === 'Unpaid' ? 'red' : 'amber'}>{totals.status}</Badge></div></div>
        </Panel>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-[11px] leading-5 text-muted">Medicine stock is deducted only when the bill is saved successfully. Retries use the same invoice request key to prevent duplicate bills.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={clearForm}><RotateCcw size={15} aria-hidden="true" />Clear form</Button><Button disabled={saving || items.length === 0}><FileText size={15} aria-hidden="true" />{saving ? 'Saving bill…' : 'Save bill'}</Button></div></div>
    </form>

    {lastBill && <Panel title="Saved invoice" subtitle="Generate an invoice preview, print it, or save it as a PDF.">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-forest-100 bg-forest-50 p-4"><div><p className="font-mono text-sm font-bold text-forest-800">{lastBill.invoice_number}</p><p className="mt-1 text-xs text-forest-700">{lastBill.patient_name || 'Walk-in customer'} · {money(lastBill.total)} · {lastBill.payment_status || statusFor(lastBill.amount_paid,lastBill.total)}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => loadInvoice(lastBill.id)}><FileText size={14} aria-hidden="true" />Generate invoice</Button><Button type="button" variant="soft" className="px-3 py-2 text-xs" onClick={() => printInvoice(lastBill.id)}><Printer size={14} aria-hidden="true" />Print bill</Button><Button type="button" variant="secondary" className="px-3 py-2 text-xs" disabled={downloadingPdf} onClick={() => downloadInvoicePdf(lastBill.id)}><Download size={14} aria-hidden="true" />{downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}</Button></div></div>
    </Panel>}

    <Panel title="Recent medicine sales" subtitle="Open an invoice or print a saved patient bill.">
      <Table columns={[
        { key: 'invoice_number', label: 'Invoice', render: (bill) => <span className="font-mono text-xs font-semibold">{bill.invoice_number}</span> },
        { key: 'patient_name', label: 'Patient', render: (bill) => bill.patient_name || 'Walk-in' }, { key: 'doctor_name', label: 'Doctor', render: (bill) => bill.doctor_name || '—' },
        { key: 'total', label: 'Total', render: (bill) => <span className="font-semibold">{money(bill.total)}</span> },
        { key: 'payment_status', label: 'Payment', render: (bill) => <Badge tone={bill.payment_status === 'Paid' ? 'green' : bill.payment_status === 'Unpaid' ? 'red' : bill.payment_status === 'Cancelled' ? 'gray' : 'amber'}>{bill.payment_status || statusFor(bill.amount_paid,bill.total)}</Badge> },
        { key: 'created_at', label: 'Date', render: (bill) => fmtDate(bill.created_at) },
        { key: 'actions', label: 'Invoice actions', render: (bill) => <div className="flex items-center gap-3"><button type="button" className="font-semibold text-forest-700 hover:underline" onClick={() => loadInvoice(bill.id)}>View invoice</button>{!bill.cancelled_at && <button type="button" className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline" onClick={() => cancelSavedBill(bill)}><CircleX size={13} aria-hidden="true" />Cancel</button>}</div> },
      ]} rows={bills} empty="No medicine bills have been saved yet." />
    </Panel>

    {invoicePreview && <Modal title={`Invoice · ${invoicePreview.invoice_number}`} onClose={() => setInvoicePreview(null)}><div className="mb-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => printInvoice(invoicePreview.id)}><Printer size={14} aria-hidden="true" />Print bill</Button><Button type="button" variant="soft" className="px-3 py-2 text-xs" disabled={downloadingPdf} onClick={() => downloadInvoicePdf(invoicePreview.id)}><Download size={14} aria-hidden="true" />{downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}</Button></div><InvoiceDocument bill={invoicePreview} clinic={clinic} /></Modal>}
    {billToPrint && <section className="print-only"><InvoiceDocument bill={billToPrint} clinic={clinic} /></section>}
  </div>;
}
