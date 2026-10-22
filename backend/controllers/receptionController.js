import { z } from 'zod';
import { getDb } from '../config/db.js';
import { audit } from '../services/auditService.js';
import { bookToken, queueForDay, updateTokenStatus } from '../services/receptionService.js';
import { makeDocument, toRecord, toRecords } from '../services/recordUtils.js';

export const tokenSchema = z.object({
  patientId: z.string().uuid().optional(),
  patient: z.object({ name: z.string().trim().min(2), age: z.coerce.number().int().min(0).max(125), gender: z.enum(['female','male','other','prefer-not-to-say']), place: z.string().trim().min(1), phone: z.string().trim().min(5) }).optional(),
  departmentId: z.string().uuid(), doctorId: z.string().uuid().optional(), notes: z.string().max(500).optional(),
  consultationFee: z.coerce.number().min(0).optional(), consultationAmountPaid: z.coerce.number().min(0).optional(), paymentMode: z.enum(['cash','upi','card','bank-transfer','other']).optional(),
}).refine((value) => Boolean(value.patientId) !== Boolean(value.patient), { message: 'Provide an existing patient or new patient details' })
  .refine((value) => value.consultationAmountPaid === undefined || value.consultationAmountPaid <= (value.consultationFee || 0), { message: 'Amount received cannot exceed consultation fee' });

export async function listQueue(req, res, next) {
  try { res.json({ data: await queueForDay({ date: req.query.date, departmentId: req.query.departmentId, doctorId: req.query.doctorId, status: req.query.status }) }); }
  catch (error) { next(error); }
}
export async function createToken(req, res, next) {
  try { res.status(201).json({ token: await bookToken(req.body, req.user.sub) }); }
  catch (error) { next(error); }
}
export async function changeTokenStatus(req, res, next) {
  try { const body = z.object({ status: z.enum(['waiting','in-consultation','done','cancelled']) }).parse(req.body); res.json({ token: await updateTokenStatus(req.params.id, body.status, req.user.sub) }); }
  catch (error) { next(error); }
}
export async function departments(req, res, next) {
  try {
    const db = getDb();
    const docs = await db.collection('departments').find({ is_active: true }).sort({ name: 1 }).toArray();
    const data = await Promise.all(docs.map(async (department) => {
      const profiles = await db.collection('doctor_profiles').find({ department_id: department.id }).toArray();
      const doctors = await Promise.all(profiles.map((profile) => db.collection('users').findOne({ id: profile.user_id, is_active: true }, { projection: { id: 1, name: 1 } })));
      return { ...toRecord(department), doctors: doctors.filter(Boolean).map(({ id, name }) => ({ id, name })) };
    }));
    res.json({ data });
  } catch (error) { next(error); }
}
export async function addDepartment(req, res, next) {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body);
    const department = makeDocument({ name: input.name, is_active: true }, req.user.sub);
    await getDb().collection('departments').insertOne(department);
    await audit(getDb(), { actorId: req.user.sub, action: 'create', entity: 'department', entityId: department.id });
    res.status(201).json({ department: toRecord(department) });
  } catch (error) { next(error); }
}
