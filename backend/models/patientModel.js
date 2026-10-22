export async function findById(db, id, session) { return db.collection('patients').findOne({ id }, { session }); }
export async function findByPhoneDigits(db, digits) {
  const patients = await db.collection('patients').find({ phone_digits: String(digits).replace(/\D/g, '') }).sort({ created_at: -1 }).limit(1).toArray();
  return patients[0] || null;
}
