import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '../config/db.js';
import { env } from '../config/env.js';
import { bookToken } from './receptionService.js';
import { createPatient } from './patientService.js';
import { findByPhoneDigits } from '../models/patientModel.js';
import { audit } from './auditService.js';
import { makeDocument, toRecord } from './recordUtils.js';

function authorizedSignature(rawBody, signature) {
  if (!env.whatsappAppSecret || !signature || !rawBody) return false;
  const expected = createHmac('sha256', env.whatsappAppSecret).update(rawBody).digest();
  const suppliedHex = signature.replace(/^sha256=/i, '');
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  return timingSafeEqual(expected, Buffer.from(suppliedHex, 'hex'));
}

async function sendText(to, body) {
  if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) throw Object.assign(new Error('WhatsApp Cloud API is not configured'), { status: 503 });
  const response = await fetch('https://graph.facebook.com/' + env.whatsappApiVersion + '/' + env.whatsappPhoneNumberId + '/messages', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.whatsappAccessToken, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body } }),
  });
  if (!response.ok) throw new Error('WhatsApp API returned ' + response.status);
}

export async function verifyWebhook(req, res) {
  const mode = req.query['hub.mode']; const token = req.query['hub.verify_token']; const challenge = req.query['hub.challenge'];
  if (!env.whatsappVerifyToken) return res.status(503).send('WhatsApp webhook is not configured');
  if (mode === 'subscribe' && token === env.whatsappVerifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

async function processMessage(sender, body) {
  const db = getDb(); const phone = String(sender).replace(/\D/g, ''); const message = String(body || '').trim(); const normalized = message.toLowerCase();
  let session = await db.collection('whatsapp_sessions').findOne({ phone });
  if (!session) {
    const intent = ['book','token'].includes(normalized) ? 'book' : ['register','registration'].includes(normalized) ? 'register' : null;
    if (!intent) return sendText(phone, 'Welcome to the clinic. Reply BOOK to register and receive today’s token, or REGISTER to register without booking.');
    session = makeDocument({ phone, step: 'name', payload: { intent } }); await db.collection('whatsapp_sessions').insertOne(session);
    return sendText(phone, 'Please reply with the patient’s full name.');
  }
  const payload = session.payload || {};
  if (session.step === 'name') {
    if (message.length < 2 || message.length > 120) return sendText(phone, 'Please enter a name between 2 and 120 characters.');
    payload.name = message; await updateSession(db, session, 'age', payload); return sendText(phone, 'What is the patient’s age in years?');
  }
  if (session.step === 'age') {
    const age = Number(message); if (!Number.isInteger(age) || age < 0 || age > 125) return sendText(phone, 'Please reply with an age from 0 to 125.');
    payload.age = age; await updateSession(db, session, 'gender', payload); return sendText(phone, 'What is the patient’s gender? Reply Female, Male, Other, or Prefer not to say.');
  }
  if (session.step === 'gender') {
    const options = { female: 'female', f: 'female', male: 'male', m: 'male', other: 'other', 'prefer not to say': 'prefer-not-to-say', 'prefer-not-to-say': 'prefer-not-to-say' };
    if (!options[normalized]) return sendText(phone, 'Please reply Female, Male, Other, or Prefer not to say.');
    payload.gender = options[normalized]; await updateSession(db, session, 'place', payload); return sendText(phone, 'What town or place does the patient live in?');
  }
  if (session.step === 'place') {
    if (!message || message.length > 160) return sendText(phone, 'Please enter a place up to 160 characters.');
    payload.place = message; const existing = await findByPhoneDigits(db, phone); let patient;
    if (existing) {
      const updated = { ...existing, name: payload.name, age: payload.age, gender: payload.gender, place: payload.place, updated_at: new Date().toISOString() };
      await db.collection('patients').replaceOne({ id: existing.id }, updated); patient = toRecord(updated);
      await audit(db, { actorId: null, action: 'whatsapp-update', entity: 'patient', entityId: patient.id });
    } else patient = await createPatient({ name: payload.name, age: payload.age, gender: payload.gender, place: payload.place, phone }, null);
    await db.collection('whatsapp_sessions').deleteOne({ phone });
    if (payload.intent === 'register') return sendText(phone, 'Registration complete. Patient ID: ' + patient.uhid + '. Reply BOOK if you would like today’s token.');
    let departmentId = env.whatsappDefaultDepartmentId;
    if (departmentId && !await db.collection('departments').findOne({ id: departmentId, is_active: true })) departmentId = null;
    if (!departmentId) { const departments = await db.collection('departments').find({ is_active: true }).sort({ name: 1 }).toArray(); departmentId = departments.find((item) => item.name === 'General Consultation')?.id || departments[0]?.id; }
    if (!departmentId) return sendText(phone, 'Registration complete (' + patient.uhid + '), but no active department is configured for bookings. Please call the clinic.');
    const token = await bookToken({ patientId: patient.id, departmentId }, null, 'whatsapp');
    return sendText(phone, 'Registration complete, ' + patient.name + '. Your token number is ' + token.token_number + ' for ' + token.token_date + '. Patient ID: ' + patient.uhid + '.');
  }
  await db.collection('whatsapp_sessions').deleteOne({ phone });
  return sendText(phone, 'Your session expired. Reply BOOK or REGISTER to start again.');
}

async function updateSession(db, session, step, payload) {
  await db.collection('whatsapp_sessions').updateOne({ id: session.id }, { $set: { step, payload, updated_at: new Date().toISOString() } });
}

export async function receiveWebhook(req, res, next) {
  try {
    if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId || !env.whatsappAppSecret) return res.status(503).json({ error: 'WhatsApp Cloud API is not configured' });
    if (!authorizedSignature(req.rawBody, req.headers['x-hub-signature-256'])) return res.sendStatus(401);
    const messages = [];
    for (const entry of req.body?.entry || []) for (const change of entry.changes || []) for (const message of change.value?.messages || []) if (message.type === 'text') messages.push({ from: message.from, text: message.text.body });
    for (const message of messages) await processMessage(message.from, message.text);
    res.sendStatus(200);
  } catch (error) { next(error); }
}
