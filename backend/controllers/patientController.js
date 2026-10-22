import { z } from 'zod';
import { getDb } from '../config/db.js';
import { createPatient } from '../services/patientService.js';
import { toRecords } from '../services/recordUtils.js';

export const patientSchema = z.object({ name: z.string().trim().min(2).max(120), age: z.coerce.number().int().min(0).max(125), gender: z.enum(['female','male','other','prefer-not-to-say']), place: z.string().trim().min(1).max(160), phone: z.string().trim().min(5).max(30) });
const escapeRegex = (value) => [...value].map((char) => ('.*+?^${}()|[]'.includes(char) || char === String.fromCharCode(92)) ? String.fromCharCode(92) + char : char).join('');

export async function listPatients(req, res, next) {
  try {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const term = String(req.query.search || '').trim();
    const digits = term.replace(/\D/g, '');
    const alternatives = term ? [
      { name: { $regex: escapeRegex(term), $options: 'i' } },
      { phone: { $regex: escapeRegex(term), $options: 'i' } },
      { uhid: { $regex: escapeRegex(term), $options: 'i' } },
    ] : [];
    if (digits) alternatives.push({ phone_digits: { $regex: escapeRegex(digits), $options: 'i' } });
    const filter = term ? { $or: alternatives } : {};
    const [docs, total] = await Promise.all([
      db.collection('patients').find(filter).sort({ created_at: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      db.collection('patients').countDocuments(filter),
    ]);
    res.json({ data: toRecords(docs), pagination: { page, pageSize, total } });
  } catch (error) { next(error); }
}

export async function addPatient(req, res, next) {
  try { res.status(201).json({ patient: await createPatient(req.body, req.user.sub) }); }
  catch (error) { next(error); }
}

export async function patientHistory(req, res, next) {
  try {
    const db = getDb();
    const patient = await db.collection('patients').findOne({ id: req.params.id });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const docs = await db.collection('visits').find({ patient_id: req.params.id }).sort({ visit_date: -1 }).toArray();
    const visits = await Promise.all(docs.map(async (doc) => {
      const [doctor, token, prescription] = await Promise.all([
        db.collection('users').findOne({ id: doc.doctor_id }, { projection: { name: 1 } }),
        doc.token_id ? db.collection('queue_tokens').findOne({ id: doc.token_id }, { projection: { token_number: 1 } }) : null,
        db.collection('prescriptions').findOne({ visit_id: doc.id }),
      ]);
      const medicines = prescription ? await db.collection('prescription_items').find({ prescription_id: prescription.id }).sort({ sort_order: 1 }).toArray() : [];
      return { ...toRecord(doc), doctor_name: doctor?.name || null, token_number: token?.token_number || null, prescription_id: prescription?.id || null,
        medicines: medicines.map((item) => ({ medicineName: item.medicine_name, dose: item.dose, frequency: item.frequency, duration: item.duration, instructions: item.instructions })) };
    }));
    res.json({ patient: toRecord(patient), visits });
  } catch (error) { next(error); }
}
