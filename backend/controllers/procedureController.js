import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb, withTransaction } from '../config/db.js';
import { audit } from '../services/auditService.js';
import { clinicDate } from '../services/dateService.js';
import { makeDocument, toRecord, toRecords } from '../services/recordUtils.js';

export async function listCatalog(req, res, next) { try { const rows = await getDb().collection('procedure_catalog').find({ is_active: true }).sort({ name: 1 }).toArray(); res.json({ data: toRecords(rows) }); } catch (error) { next(error); } }
export async function listTherapists(req, res, next) { try { const rows = await getDb().collection('users').find({ role: 'Therapist', is_active: true }, { projection: { id: 1, name: 1 } }).sort({ name: 1 }).toArray(); res.json({ data: rows.map(({ id, name }) => ({ id, name })) }); } catch (error) { next(error); } }
export async function addCatalog(req, res, next) {
  try {
    const data = z.object({ name: z.string().min(1).max(180), description: z.string().max(1000).optional(), defaultSessions: z.coerce.number().int().positive().default(1), sessionPrice: z.coerce.number().min(0).default(0), defaultGstRate: z.coerce.number().min(0).max(100).default(0) }).parse(req.body);
    const procedure = makeDocument({ name: data.name, description: data.description || null, default_sessions: data.defaultSessions, session_price: data.sessionPrice, default_gst_rate: data.defaultGstRate, is_active: true }, req.user.sub);
    await getDb().collection('procedure_catalog').insertOne(procedure); await audit(getDb(), { actorId: req.user.sub, action: 'create', entity: 'procedure_catalog', entityId: procedure.id }); res.status(201).json({ procedure: toRecord(procedure) });
  } catch (error) { next(error); }
}
export async function updateCatalog(req, res, next) {
  try {
    const input = z.object({ sessionPrice: z.coerce.number().min(0), defaultGstRate: z.coerce.number().min(0).max(100), defaultSessions: z.coerce.number().int().positive() }).parse(req.body); const db = getDb();
    const current = await db.collection('procedure_catalog').findOne({ id: req.params.id }); if (!current) return res.status(404).json({ error: 'Procedure not found' });
    const updated = { ...current, session_price: input.sessionPrice, default_gst_rate: input.defaultGstRate, default_sessions: input.defaultSessions, updated_at: new Date().toISOString() }; await db.collection('procedure_catalog').replaceOne({ id: current.id }, updated);
    await audit(db, { actorId: req.user.sub, action: 'update', entity: 'procedure_catalog', entityId: current.id, details: { sessionPrice: updated.session_price, defaultGstRate: updated.default_gst_rate } }); res.json({ procedure: toRecord(updated) });
  } catch (error) { next(error); }
}
export async function dailySessions(req, res, next) {
  try {
    const date = req.query.date || clinicDate(); const db = getDb(); const sessions = await db.collection('procedure_sessions').find({ session_date: date }).sort({ status: 1 }).toArray();
    const data = await Promise.all(sessions.map(async (session) => {
      const plan = await db.collection('procedure_plans').findOne({ id: session.plan_id }); const [patient, catalog, therapist] = await Promise.all([plan && db.collection('patients').findOne({ id: plan.patient_id }), plan && db.collection('procedure_catalog').findOne({ id: plan.procedure_id }), plan?.therapist_id ? db.collection('users').findOne({ id: plan.therapist_id }) : null]);
      return { ...toRecord(session), patient_name: patient?.name, uhid: patient?.uhid, procedure_name: catalog?.name, therapist_name: therapist?.name || null, patient_id: plan?.patient_id, procedure_id: plan?.procedure_id };
    }));
    res.json({ date, data });
  } catch (error) { next(error); }
}
export async function schedulePlan(req, res, next) {
  try {
    const input = z.object({ patientId: z.string().uuid(), procedureId: z.string().uuid(), therapistId: z.string().uuid().optional().nullable(), startDate: z.string().date(), sessionCount: z.coerce.number().int().min(1).max(90), intervalDays: z.coerce.number().int().min(1).max(90).default(1), sessionDates: z.array(z.string().date()).optional(), packagePrice: z.coerce.number().min(0).optional().nullable(), notes: z.string().max(1000).optional() }).parse(req.body);
    const plan = await withTransaction(async (db, session) => {
      if (!await db.collection('patients').findOne({ id: input.patientId }, { session })) throw Object.assign(new Error('Patient not found'), { status: 404 });
      if (!await db.collection('procedure_catalog').findOne({ id: input.procedureId }, { session })) throw Object.assign(new Error('Procedure not found'), { status: 404 });
      const created = makeDocument({ patient_id: input.patientId, procedure_id: input.procedureId, therapist_id: input.therapistId || null, start_date: input.startDate, session_count: input.sessionCount, package_price: input.packagePrice ?? null, notes: input.notes || null }, req.user.sub);
      await db.collection('procedure_plans').insertOne(created, { session });
      const sessions = Array.from({ length: input.sessionCount }, (_, index) => makeDocument({ plan_id: created.id, session_date: input.sessionDates?.[index] || shiftDate(input.startDate, index * input.intervalDays), status: 'scheduled', notes: null, completed_at: null }, req.user.sub));
      await db.collection('procedure_sessions').insertMany(sessions, { session }); await audit(db, { actorId: req.user.sub, action: 'create', entity: 'procedure_plan', entityId: created.id, details: { sessions: input.sessionCount } }, session); return toRecord(created);
    });
    res.status(201).json({ plan });
  } catch (error) { next(error); }
}
export async function changeSession(req, res, next) {
  try {
    const input = z.object({ status: z.enum(['scheduled','in-progress','completed','cancelled']), notes: z.string().max(500).optional() }).parse(req.body); const db = getDb(); const current = await db.collection('procedure_sessions').findOne({ id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Session not found' });
    const updated = { ...current, status: input.status, notes: input.notes || current.notes, completed_at: input.status === 'completed' ? new Date().toISOString() : current.completed_at, updated_at: new Date().toISOString() };
    await db.collection('procedure_sessions').replaceOne({ id: current.id }, updated); await audit(db, { actorId: req.user.sub, action: 'status-change', entity: 'procedure_session', entityId: current.id, details: { status: updated.status } }); res.json({ session: toRecord(updated) });
  } catch (error) { next(error); }
}
export async function createProcedureBill(req, res, next) {
  try {
    const input = z.object({ patientId: z.string().uuid(), planId: z.string().uuid().optional().nullable(), billingType: z.enum(['session','package']), sessionCount: z.coerce.number().int().positive().optional(), subtotal: z.coerce.number().min(0).optional(), discount: z.coerce.number().min(0).default(0), gstRate: z.coerce.number().min(0).max(100).optional(), amountPaid: z.coerce.number().min(0).default(0), paymentMode: z.enum(['cash','upi','card','bank-transfer','other']).default('cash') }).parse(req.body);
    const bill = await withTransaction(async (db, session) => {
      let plan = null; let catalog = null;
      if (input.planId) {
        plan = await db.collection('procedure_plans').findOne({ id: input.planId }, { session }); if (!plan) throw Object.assign(new Error('Procedure plan not found'), { status: 404 });
        if (plan.patient_id !== input.patientId) throw Object.assign(new Error('Procedure plan belongs to a different patient'), { status: 400 });
        catalog = await db.collection('procedure_catalog').findOne({ id: plan.procedure_id }, { session });
      }
      const subtotal = input.subtotal ?? (input.billingType === 'package' ? (plan?.package_price ?? Number(catalog?.session_price || 0) * Number(plan?.session_count || 1)) : Number(catalog?.session_price || 0) * Number(input.sessionCount || 1));
      const rate = input.gstRate ?? Number(catalog?.default_gst_rate || 0); if (input.discount > subtotal) throw Object.assign(new Error('Discount cannot exceed subtotal'), { status: 400 });
      const tax = roundMoney((subtotal - input.discount) * rate / 100); const total = roundMoney(subtotal - input.discount + tax); if (input.amountPaid > total) throw Object.assign(new Error('Amount paid cannot exceed bill total'), { status: 400 });
      const receipt = 'PR-' + clinicDate().replaceAll('-', '') + '-' + randomUUID().slice(0, 8).toUpperCase();
      const created = makeDocument({ receipt_number: receipt, patient_id: input.patientId, plan_id: input.planId || null, billing_type: input.billingType, subtotal, discount: input.discount, tax, total, amount_paid: input.amountPaid, payment_mode: input.paymentMode }, req.user.sub);
      await db.collection('procedure_bills').insertOne(created, { session }); await audit(db, { actorId: req.user.sub, action: 'create', entity: 'procedure_bill', entityId: created.id, details: { receipt, total } }, session); return toRecord(created);
    });
    res.status(201).json({ bill });
  } catch (error) { next(error); }
}
function shiftDate(date, days) { const value = new Date(date + 'T00:00:00.000Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
