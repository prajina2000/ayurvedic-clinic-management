import { closeDB, connectDB } from '../config/db.js';
import { makeDocument } from '../services/recordUtils.js';

const db = await connectDB();
const departments = ['General Consultation', 'Panchakarma'];
const icdCodes = [
  ['J06.9','Acute upper respiratory infection, unspecified'], ['M54.5','Low back pain'], ['K29.7','Gastritis, unspecified'],
  ['E11.9','Type 2 diabetes mellitus without complications'], ['I10','Essential (primary) hypertension'], ['R51.9','Headache, unspecified'],
  ['L20.9','Atopic dermatitis, unspecified'], ['M25.561','Pain in right knee'],
];
const medicines = [
  ['MED001','Triphala Churna','Triphala','Powder','100 g pack',10], ['MED002','Ashwagandha Tablets','Withania somnifera','Tablet','30 tablet bottle',10],
  ['MED003','Chyawanprash','Herbal formulation','Paste','500 g jar',5], ['MED004','Brahmi Oil','Bacopa monnieri','Oil','100 ml bottle',5],
];
const procedures = [
  ['Abhyanga','Ayurvedic full-body oil massage',7], ['Shirodhara','Warm oil stream therapy',7], ['Basti','Medicated enema therapy',5], ['Swedana','Herbal steam therapy',7],
];
for (const name of departments) await db.collection('departments').updateOne({ name }, { $setOnInsert: makeDocument({ name, is_active: true }) }, { upsert: true });
for (const [code, description] of icdCodes) await db.collection('icd_codes').updateOne({ code }, { $setOnInsert: makeDocument({ code, description, search_text: (code + ' ' + description).toLowerCase() }) }, { upsert: true });
for (const [code, name, generic_name, form, unit, reorder_level] of medicines) await db.collection('medicine_master').updateOne({ medicine_code: code }, { $setOnInsert: makeDocument({ medicine_code: code, name, generic_name, form, unit, category: 'Ayurvedic', reorder_level, default_gst_rate: 0, is_active: true }) }, { upsert: true });
for (const [name, description, default_sessions] of procedures) await db.collection('procedure_catalog').updateOne({ name }, { $setOnInsert: makeDocument({ name, description, default_sessions, session_price: 0, default_gst_rate: 0, is_active: true }) }, { upsert: true });
await db.collection('counters').updateOne({ _id: 'medicine_code' }, { $max: { value: medicines.length } }, { upsert: true });
console.log('Prisma PostgreSQL schema and clinic reference data are ready.');
await closeDB();
