import { Router } from 'express';
import { allowRoles, authenticate } from '../middleware/auth.js';
import { createExpense, daybook, outstanding, reports } from '../controllers/accountController.js';
const router=Router();router.use(authenticate,allowRoles('Admin','Accountant'));
router.get('/daybook',daybook);router.get('/reports',reports);router.get('/outstanding',outstanding);router.post('/expenses',createExpense);
export default router;
