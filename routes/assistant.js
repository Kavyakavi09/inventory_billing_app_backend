import express from 'express';
import auth from '../middleware/auth.js';
import { chat, history } from '../controllers/assistant.js';

const router = express.Router();

router.get('/history', auth, history);
router.post('/chat', auth, chat);

export default router;
