import { toRecord } from '../services/recordUtils.js';

export async function findForDay(db, { date, departmentId, doctorId, status }) {
  const filter = { token_date: date };
  if (departmentId) filter.department_id = departmentId;
  if (doctorId) filter.doctor_id = doctorId;
  if (status) filter.status = status;
  const tokens = await db.collection('queue_tokens').find(filter).sort({ department_id: 1, token_number: 1 }).toArray();
  return Promise.all(tokens.map(async (token) => {
    const [patient, department, doctor] = await Promise.all([
      db.collection('patients').findOne({ id: token.patient_id }),
      db.collection('departments').findOne({ id: token.department_id }),
      token.doctor_id ? db.collection('users').findOne({ id: token.doctor_id }) : null,
    ]);
    return { ...toRecord(token), patient_id: token.patient_id, uhid: patient?.uhid, patient_name: patient?.name, age: patient?.age, gender: patient?.gender, place: patient?.place, phone: patient?.phone, department_name: department?.name, doctor_name: doctor?.name || null };
  }));
}
