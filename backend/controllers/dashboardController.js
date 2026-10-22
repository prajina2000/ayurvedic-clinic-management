import { getDb } from '../config/db.js';
import { clinicDate } from '../services/dateService.js';

export async function dashboard(req, res, next) {
  try {
    const db = getDb(); const date = clinicDate(); const role = req.user.role; const result = { date, role };
    if (['Admin','Receptionist','Doctor'].includes(role)) {
      const [tokens, patientCount, procedures] = await Promise.all([
        db.collection('queue_tokens').find({ token_date: date }).toArray(), db.collection('patients').countDocuments(), db.collection('procedure_sessions').countDocuments({ session_date: date, status: { $in: ['scheduled','in-progress'] } }),
      ]);
      result.queue = tokens.reduce((out, item) => { out[item.status] = (out[item.status] || 0) + 1; return out; }, {}); result.patients = patientCount; result.proceduresToday = procedures;
    }
    if (['Admin','Pharmacist'].includes(role)) {
      const [medicines, batches] = await Promise.all([db.collection('medicine_master').find({ is_active: true }).toArray(), db.collection('medicine_batches').find({ quantity_remaining: { $gt: 0 } }).toArray()]);
      const stock = medicines.map((medicine) => ({ medicine, quantity: batches.filter((batch) => batch.medicine_id === medicine.id && batch.expiry_date >= date).reduce((n, batch) => n + Number(batch.quantity_remaining), 0) }));
      result.lowStock = stock.filter(({ medicine, quantity }) => quantity <= Number(medicine.reorder_level || 0)).length;
      result.nearExpiry = batches.filter((batch) => batch.expiry_date >= date && batch.expiry_date <= shiftDate(date, 30)).length; result.stockItems = medicines.length;
    }
    if (['Admin','Therapist','Doctor'].includes(role)) {
      const sessions = await db.collection('procedure_sessions').find({ session_date: date }).toArray();
      result.procedureSessions = { scheduled: sessions.filter((item) => item.status === 'scheduled').length, in_progress: sessions.filter((item) => item.status === 'in-progress').length, completed: sessions.filter((item) => item.status === 'completed').length };
    }
    if (['Admin','Accountant'].includes(role)) {
      const [consultations, pharmacy, procedures, expenses] = await Promise.all([db.collection('consultation_bills').find({}).toArray(), db.collection('pharmacy_bills').find({ cancelled_at: null }).toArray(), db.collection('procedure_bills').find({}).toArray(), db.collection('expenses').find({ expense_date: date }).toArray()]);
      const dayBills = [...consultations.map((item) => ({ item, total: item.amount })), ...pharmacy.map((item) => ({ item, total: item.total })), ...procedures.map((item) => ({ item, total: item.total }))].filter(({ item }) => clinicDate(new Date(item.created_at)) === date);
      result.income = dayBills.reduce((n, { item }) => n + Number(item.amount_paid), 0); result.outstanding = dayBills.reduce((n, { item, total }) => n + Number(total) - Number(item.amount_paid), 0); result.expenses = expenses.reduce((n, item) => n + Number(item.amount), 0); result.net = result.income - result.expenses;
    }
    res.json(result);
  } catch (error) { next(error); }
}
function shiftDate(date, days) { const value = new Date(date + 'T00:00:00.000Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
