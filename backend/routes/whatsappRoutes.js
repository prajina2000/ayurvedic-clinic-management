import { Router } from 'express';
import { receiveWebhook, verifyWebhook } from '../services/whatsappService.js';
const router=Router();router.get('/',verifyWebhook);router.post('/',receiveWebhook);export default router;
