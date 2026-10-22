import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { login, loginSchema, me } from '../controllers/authController.js';
const router=Router();
router.post('/login',validate(loginSchema),login);
router.get('/me',authenticate,me);
export default router;
