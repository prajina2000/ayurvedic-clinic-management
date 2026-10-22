import { Router } from 'express';
import { allowRoles, authenticate } from '../middleware/auth.js';
import { getPrescription, medicineSuggestions, saveVisit, searchIcd } from '../controllers/doctorController.js';
const router=Router();router.use(authenticate,allowRoles('Admin','Doctor'));
router.get('/icd-codes',searchIcd);router.get('/medicines',medicineSuggestions);router.post('/visits',saveVisit);router.get('/prescriptions/:id',getPrescription);
export default router;
