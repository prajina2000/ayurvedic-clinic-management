import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { env } from '../config/env.js';
import { audit } from '../services/auditService.js';

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const db = getDb();
    const user = await db.collection('users').findOne({ email: email.toLowerCase(), is_active: true });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect' });
    const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    await audit(db, { actorId: user.id, action: 'login', entity: 'user', entityId: user.id });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { next(error); }
}

export async function me(req, res, next) {
  try {
    const user = await getDb().collection('users').findOne({ id: req.user.sub, is_active: true }, { projection: { password_hash: 0 } });
    if (!user) return res.status(401).json({ error: 'Account is inactive' });
    const { id, name, email, role } = user;
    res.json({ user: { id, name, email, role } });
  } catch (error) { next(error); }
}
