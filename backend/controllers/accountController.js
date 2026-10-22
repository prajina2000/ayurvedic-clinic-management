import { z } from 'zod';
import { getDb } from '../config/db.js';
import { env } from '../config/env.js';
import { audit } from '../services/auditService.js';
import { clinicDate } from '../services/dateService.js';
import { makeDocument, toRecord, toRecords } from '../services/recordUtils.js';

const modes = ['cash','upi','card','bank-transfer','other'];
export async function daybook(req, res, next) {
  try {
    const date = req.query.date || clinicDate(); const db = getDb();
    const [consultations, pharmacy, procedures, expenses] = await Promise.all([
      db.collection('consultation_bills').find({}).toArray(), db.collection('pharmacy_bills').find({ cancelled_at: null }).toArray(),
      db.collection('procedure_bills').find({}).toArray(), db.collection('expenses').find({ expense_date: date }).toArray(),
    ]);
    const entries = [];
    for (const bill of consultations) if (clinicDate(new Date(bill.created_at)) === date) entries.push(await ledgerEntry(db, bill, 'consultation', bill.invoice_number, bill.amount, bill.amount_paid));
    for (const bill of pharmacy) if (clinicDate(new Date(bill.created_at)) === date) entries.push(await ledgerEntry(db, bill, 'pharmacy', bill.invoice_number, bill.total, bill.amount_paid));
    for (const bill of procedures) if (clinicDate(new Date(bill.created_at)) === date) entries.push(await ledgerEntry(db, bill, 'procedure', bill.receipt_number, bill.total, bill.amount_paid));
    for (const expense of expenses) entries.push({ created_at: expense.created_at, category: 'expense', reference: expense.category, patient: expense.description, gross: expense.amount, collected: expense.amount, due: 0, payment_mode: expense.payment_mode });
    entries.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const summary = entries.reduce((out, row) => { const isExpense = row.category === 'expense'; out.income += isExpense ? 0 : Number(row.collected); out.expenses += isExpense ? Number(row.collected) : 0; out.outstanding += Number(row.due); return out; }, { income: 0, expenses: 0, outstanding: 0 });
    summary.net = summary.income - summary.expenses; res.json({ date, summary, data: entries });
  } catch (error) { next(error); }
}

export async function createExpense(req, res, next) {
  try {
    const input = z.object({ expenseDate: z.string().date().optional(), category: z.string().min(1).max(100), description: z.string().min(1).max(500), amount: z.coerce.number().positive(), paymentMode: z.enum(modes).default('cash') }).parse(req.body);
    const expense = makeDocument({ expense_date: input.expenseDate || clinicDate(), category: input.category, description: input.description, amount: input.amount, payment_mode: input.paymentMode }, req.user.sub);
    await getDb().collection('expenses').insertOne(expense); await audit(getDb(), { actorId: req.user.sub, action: 'create', entity: 'expense', entityId: expense.id });
    res.status(201).json({ expense: toRecord(expense) });
  } catch (error) { next(error); }
}

export async function reports(req, res, next) {
  try {
    const from = req.query.from || clinicDate().slice(0, 7) + '-01'; const to = req.query.to || clinicDate();
    if (!validRange(from, to)) return res.status(400).json({ error: 'Choose a valid date range' });
    const db = getDb(); const [consultations, pharmacy, procedures, expenses] = await Promise.all([
      db.collection('consultation_bills').find({}).toArray(), db.collection('pharmacy_bills').find({ cancelled_at: null }).toArray(), db.collection('procedure_bills').find({}).toArray(), db.collection('expenses').find({}).toArray(),
    ]);
    const totals = new Map();
    const add = (date, category, collected, due) => { if (date < from || date > to) return; const item = totals.get(date) || { day: date, income: 0, expenses: 0, outstanding: 0 }; if (category === 'expense') item.expenses += Number(collected); else { item.income += Number(collected); item.outstanding += Number(due); } totals.set(date, item); };
    for (const item of consultations) add(clinicDate(new Date(item.created_at)), 'consultation', item.amount_paid, Number(item.amount) - Number(item.amount_paid));
    for (const item of pharmacy) add(clinicDate(new Date(item.created_at)), 'pharmacy', item.amount_paid, Number(item.total) - Number(item.amount_paid));
    for (const item of procedures) add(clinicDate(new Date(item.created_at)), 'procedure', item.amount_paid, Number(item.total) - Number(item.amount_paid));
    for (const item of expenses) add(item.expense_date, 'expense', item.amount, 0);
    res.json({ from, to, data: [...totals.values()].sort((a, b) => a.day.localeCompare(b.day)) });
  } catch (error) { next(error); }
}

export async function outstanding(req, res, next) {
  try {
    const db = getDb(); const data = [];
    for (const [collection, category, referenceKey, totalKey] of [['consultation_bills','consultation','invoice_number','amount'], ['pharmacy_bills','pharmacy','invoice_number','total'], ['procedure_bills','procedure','receipt_number','total']]) {
      const filter = category === 'pharmacy' ? { cancelled_at: null } : {};
      const bills = await db.collection(collection).find(filter).toArray();
      for (const bill of bills) if (Number(bill[totalKey]) > Number(bill.amount_paid)) {
        const patient = await db.collection('patients').findOne({ id: bill.patient_id });
        data.push({ category, reference: bill[referenceKey], patient: patient?.name || 'Walk-in', due: Number(bill[totalKey]) - Number(bill.amount_paid), created_at: bill.created_at });
      }
    }
    data.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); res.json({ data });
  } catch (error) { next(error); }
}

async function ledgerEntry(db, bill, category, reference, gross, collected) {
  const patient = await db.collection('patients').findOne({ id: bill.patient_id });
  return { created_at: bill.created_at, category, reference, patient: patient?.name || 'Walk-in', gross, collected, due: Number(gross) - Number(collected), payment_mode: bill.payment_mode };
}
function validRange(from, to) { return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to; }
