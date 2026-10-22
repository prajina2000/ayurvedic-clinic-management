import bcrypt from 'bcryptjs';
import { closeDB, connectDB } from '../config/db.js';
import { makeDocument } from '../services/recordUtils.js';

const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password, BOOTSTRAP_ADMIN_NAME: name = 'Clinic Administrator' } = process.env;
if (!email || !password || password.length < 12 || password === 'change-this-to-a-unique-12-character-password') {
  console.error('Set BOOTSTRAP_ADMIN_EMAIL and replace the sample with a private BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters before seeding.');
  process.exitCode = 1;
} else {
  try {
    const db = await connectDB();
    const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!existing) {
      const hash = await bcrypt.hash(password, 12);
      await db.collection('users').insertOne(makeDocument({ name, email: email.toLowerCase(), password_hash: hash, role: 'Admin', is_active: true }));
    }
    console.log('Bootstrap Admin is ready (existing email was left unchanged).');
  } finally { await closeDB(); }
}
