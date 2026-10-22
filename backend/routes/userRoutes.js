import { Router } from 'express';
import { allowRoles, authenticate } from '../middleware/auth.js';
import { createUser, listUsers } from '../controllers/userController.js';
const router=Router();router.use(authenticate,allowRoles('Admin'));router.get('/',listUsers);router.post('/',createUser);export default router;
