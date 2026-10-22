import { getDb, withTransaction } from '../config/db.js';
import { audit } from './auditService.js';
import { clinicDate } from './dateService.js';
import { createPatient } from './patientService.js';
import { findForDay } from '../models/queueTokenModel.js';
import { makeDocument, toRecord } from './recordUtils.js';

export async function bookToken(data, actorId, source = 'reception') {
  return withTransaction(async (db, session) => {
    if (data.doctorId) {
      const profile = await db.collection('doctor_profiles').findOne({ user_id: data.doctorId, department_id: data.departmentId }, { session });
      const doctor = await db.collection('users').findOne({ id: data.doctorId, role: 'Doctor', is_active: true }, { session });
      if (!profile || !doctor) throw Object.assign(new Error('Selected doctor is not active in this department'), { status: 400 });
    }
    let patient;
    if (data.patientId) {
      patient = await db.collection('patients').findOne({ id: data.patientId }, { session });
      if (!patient) throw Object.assign(new Error('Patient not found'), { status: 404 });
    } else patient = await createPatient(data.patient, actorId, db, session);

    const tokenDate = clinicDate();
    const scope = tokenDate + ':' + data.departmentId + ':' + (data.doctorId || 'department');
    const counter = await db.collection('counters').findOneAndUpdate({ _id: 'queue:' + scope }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session });
    const number = counter.value;
    const token = makeDocument({ token_date: tokenDate, token_number: number, patient_id: patient.id, department_id: data.departmentId, doctor_id: data.doctorId || null, notes: data.notes || null, status: 'waiting', booked_via: source }, actorId);
    await db.collection('queue_tokens').insertOne(token, { session });
    if (Number(data.consultationFee || 0) > 0) {
      const invoice = 'CONS-' + tokenDate.replaceAll('-', '') + '-' + String(number).padStart(4, '0');
      const paid = data.consultationAmountPaid ?? data.consultationFee;
      await db.collection('consultation_bills').insertOne(makeDocument({ invoice_number: invoice, patient_id: patient.id, token_id: token.id, amount: data.consultationFee, amount_paid: paid, payment_mode: data.paymentMode || 'cash' }, actorId), { session });
    }
    await audit(db, { actorId, action: 'create', entity: 'queue_token', entityId: token.id, details: { tokenNumber: number, source } }, session);
    return { ...toRecord(token), patient: toRecord(patient) };
  });
}

export async function updateTokenStatus(id, status, actorId) {
  return withTransaction(async (db, session) => {
    const current = await db.collection('queue_tokens').findOne({ id }, { session });
    if (!current) throw Object.assign(new Error('Token not found'), { status: 404 });
    const allowed = { waiting: ['in-consultation', 'cancelled'], 'in-consultation': ['done', 'cancelled'], done: [], cancelled: [] };
    if (!allowed[current.status].includes(status)) throw Object.assign(new Error('Cannot change ' + current.status + ' to ' + status), { status: 409 });
    const updated = { ...current, status, updated_at: new Date().toISOString() };
    await db.collection('queue_tokens').replaceOne({ id, status: current.status }, updated, { session });
    await audit(db, { actorId, action: 'status-change', entity: 'queue_token', entityId: id, details: { from: current.status, to: status } }, session);
    return toRecord(updated);
  });
}

export async function queueForDay({ date = clinicDate(), departmentId, doctorId, status } = {}) {
  return findForDay(getDb(), { date, departmentId, doctorId, status });
}
