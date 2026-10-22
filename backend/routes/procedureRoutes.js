import { Router } from 'express';
import { allowRoles, authenticate } from '../middleware/auth.js';
import { addCatalog, changeSession, createProcedureBill, dailySessions, listCatalog, listTherapists, schedulePlan, updateCatalog } from '../controllers/procedureController.js';
const router=Router();router.use(authenticate,allowRoles('Admin','Therapist','Accountant','Doctor'));
router.get('/catalog',listCatalog);router.post('/catalog',allowRoles('Admin'),addCatalog);router.patch('/catalog/:id',allowRoles('Admin'),updateCatalog);router.get('/therapists',listTherapists);router.get('/sessions',dailySessions);router.post('/plans',allowRoles('Admin','Therapist','Doctor'),schedulePlan);router.patch('/sessions/:id',allowRoles('Admin','Therapist'),changeSession);router.post('/bills',allowRoles('Admin','Accountant','Therapist'),createProcedureBill);
export default router;
