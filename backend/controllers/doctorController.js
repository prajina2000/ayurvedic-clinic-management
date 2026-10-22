import { z } from 'zod';
import { getDb, withTransaction } from '../config/db.js';
import { audit } from '../services/auditService.js';
import { makeDocument, toRecord, toRecords } from '../services/recordUtils.js';
import { clinicDate } from '../services/dateService.js';

const visitSchema = z.object({ patientId: z.string().uuid(), tokenId: z.string().uuid().optional(), complaints: z.string().max(5000).optional().default(''), investigation: z.string().max(5000).optional().default(''), examination: z.object({ bp: z.string().max(30).optional().default(''), pulse: z.string().max(30).optional().default(''), temperature: z.string().max(30).optional().default(''), weight: z.string().max(30).optional().default(''), spo2: z.string().max(30).optional().default('') }).optional().default({}), diagnosis: z.string().max(5000).optional().default(''), icdCode: z.string().max(24).optional().nullable(), medicines: z.array(z.object({ medicineId: z.string().uuid().optional().nullable(), medicineName: z.string().min(1).max(180), dose: z.string().min(1).max(120), frequency: z.string().min(1).max(120), duration: z.string().min(1).max(120), instructions: z.string().max(500).optional().default(''), quantity: z.coerce.number().positive().default(1) })).default([]) });
const escapeRegex = (value) => [...value].map((char) => ('.*+?^${}()|[]'.includes(char) || char === String.fromCharCode(92)) ? String.fromCharCode(92) + char : char).join('');

export async function searchIcd(req, res, next) {
  try {
    const db = getDb(); const term = String(req.query.search || '').trim();
    const filter = term ? { $or: [{ code: { $regex: escapeRegex(term), $options: 'i' } }, { description: { $regex: escapeRegex(term), $options: 'i' } }] } : {};
    const rows = await db.collection('icd_codes').find(filter).sort({ code: 1 }).limit(25).toArray();
    res.json({ data: rows.map(({ code, description }) => ({ code, description })) });
  } catch (error) { next(error); }
}

export async function medicineSuggestions(req, res, next) {
  try {
    const db = getDb(); const term = String(req.query.search || '').trim();
    const filter = { is_active: true };
    if (term) filter.$or = [{ name: { $regex: escapeRegex(term), $options: 'i' } }, { generic_name: { $regex: escapeRegex(term), $options: 'i' } }];
    const medicines = await db.collection('medicine_master').find(filter).sort({ name: 1 }).limit(25).toArray();
    const data = await Promise.all(medicines.map(async (medicine) => {
      const result = await db.collection('medicine_batches').aggregate([
        { $match: { medicine_id: medicine.id, expiry_date: { $gte: clinicDate() }, quantity_remaining: { $gt: 0 } } },
        { $group: { _id: null, stock: { $sum: '$quantity_remaining' } } },
      ]).toArray();
      return { id: medicine.id, name: medicine.name, generic_name: medicine.generic_name, unit: medicine.unit, stock: result[0]?.stock || 0 };
    }));
    res.json({ data });
  } catch (error) { next(error); }
}

export async function saveVisit(req, res, next) {
  try {
    const input = visitSchema.parse(req.body);
    const visit = await withTransaction(async (db, session) => {
      const patient = await db.collection('patients').findOne({ id: input.patientId }, { session });
      if (!patient) throw Object.assign(new Error('Patient not found'), { status: 404 });
      const token = input.tokenId ? await db.collection('queue_tokens').findOne({ id: input.tokenId }, { session }) : null;
      if (input.tokenId && !token) throw Object.assign(new Error('Token not found'), { status: 404 });
      const created = makeDocument({ patient_id: input.patientId, token_id: input.tokenId || null, doctor_id: req.user.sub, visit_date: token?.token_date || new Date().toISOString(), complaints: input.complaints, investigation: input.investigation, examination: input.examination, diagnosis: input.diagnosis, icd_code: input.icdCode || null }, req.user.sub);
      await db.collection('visits').insertOne(created, { session });
      const prescription = makeDocument({ visit_id: created.id, doctor_id: req.user.sub }, req.user.sub);
      await db.collection('prescriptions').insertOne(prescription, { session });
      if (input.medicines.length) {
        const items = input.medicines.map((item, sortOrder) => makeDocument({ prescription_id: prescription.id, medicine_id: item.medicineId || null, medicine_name: item.medicineName, dose: item.dose, frequency: item.frequency, duration: item.duration, instructions: item.instructions, quantity: item.quantity, sort_order: sortOrder }, req.user.sub));
        await db.collection('prescription_items').insertMany(items, { session });
      }
      await audit(db, { actorId: req.user.sub, action: 'create', entity: 'visit', entityId: created.id, details: { prescriptionId: prescription.id } }, session);
      return { ...toRecord(created), prescriptionId: prescription.id };
    });
    res.status(201).json({ visit });
  } catch (error) { next(error); }
}

export async function getPrescription(req, res, next) {
  try {
    const db = getDb(); const prescription = await db.collection('prescriptions').findOne({ id: req.params.id });
    if (!prescription) return res.status(404).json({ error: 'Prescription not found' });
    const visit = await db.collection('visits').findOne({ id: prescription.visit_id });
    if (!visit) return res.status(404).json({ error: 'Prescription visit not found' });
    const [patient, doctor, medicines] = await Promise.all([
      db.collection('patients').findOne({ id: visit.patient_id }),
      db.collection('users').findOne({ id: visit.doctor_id }),
      db.collection('prescription_items').find({ prescription_id: prescription.id }).sort({ sort_order: 1 }).toArray(),
    ]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const { id, ...visitData } = toRecord(visit);
    res.json({ prescription: { prescription_id: prescription.id, created_at: prescription.created_at, ...visitData, ...patientFields(patient), doctor_name: doctor?.name || null,
      medicines: toRecords(medicines).map((item) => ({ medicineId: item.medicine_id, medicineName: item.medicine_name, dose: item.dose, frequency: item.frequency, duration: item.duration, instructions: item.instructions, quantity: item.quantity })) } });
  } catch (error) { next(error); }
}

function patientFields(patient) {
  return { name: patient.name, age: patient.age, gender: patient.gender, place: patient.place, uhid: patient.uhid };
}
