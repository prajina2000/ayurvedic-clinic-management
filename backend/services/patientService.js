import { getDb } from '../config/db.js';
import { clinicDate } from './dateService.js';
import { audit } from './auditService.js';
import { makeDocument, toRecord } from './recordUtils.js';

export async function createPatient(data, actorId, db = getDb(), session) {
  const counter = await db.collection('counters').findOneAndUpdate(
    { _id: 'patient_uhid' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session },
  );
  const uhid = 'AY-' + clinicDate().slice(0, 4) + '-' + String(counter.value).padStart(6, '0');
  const phone = data.phone.trim();
  const patient = makeDocument({ uhid, name: data.name.trim(), age: data.age, gender: data.gender, place: data.place.trim(), phone, phone_digits: phone.replace(/\D/g, '') }, actorId);
  await db.collection('patients').insertOne(patient, { session });
  await audit(db, { actorId, action: 'create', entity: 'patient', entityId: patient.id }, session);
  return toRecord(patient);
}
