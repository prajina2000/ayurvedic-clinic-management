import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, withTransaction } from '../config/db.js';
import { audit } from '../services/auditService.js';
import { makeDocument, toRecords } from '../services/recordUtils.js';

const roles = ['Admin','Receptionist','Doctor','Pharmacist','Therapist','Accountant'];
export async function listUsers(req, res, next) {
  try { const rows = await getDb().collection('users').find({}, { projection: { password_hash: 0 } }).sort({ name: 1 }).toArray(); res.json({ data: toRecords(rows) }); }
  catch (error) { next(error); }
}
export async function createUser(req, res, next) {
  try {
    const input = z.object({ name: z.string().min(2).max(120), email: z.string().email(), password: z.string().min(12), role: z.enum(roles), departmentId: z.string().uuid().optional(), registrationNumber: z.string().max(80).optional(), specialization: z.string().max(120).optional() }).parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const user = await withTransaction(async (db, session) => {
      const created = makeDocument({ name: input.name, email: input.email.toLowerCase(), password_hash: hash, role: input.role, is_active: true }, req.user.sub);
      await db.collection('users').insertOne(created, { session });
      if (input.role === 'Doctor' && input.departmentId) {
        if (!await db.collection('departments').findOne({ id: input.departmentId, is_active: true }, { session })) throw Object.assign(new Error('Department not found'), { status: 400 });
        const profile = makeDocument({ user_id: created.id, department_id: input.departmentId, registration_number: input.registrationNumber || null, specialization: input.specialization || null }, req.user.sub);
        await db.collection('doctor_profiles').insertOne(profile, { session });
      }
      await audit(db, { actorId: req.user.sub, action: 'create', entity: 'user', entityId: created.id, details: { role: input.role } }, session);
      const { password_hash, ...safe } = created; return safe;
    });
    res.status(201).json({ user });
  } catch (error) { next(error); }
}
