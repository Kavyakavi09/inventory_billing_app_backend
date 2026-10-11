import express from 'express';
import auth from '../middleware/auth.js';
import { chat } from '../controllers/assistant.js';

const router = express.Router();

router.post('/chat', auth, chat);

export default router;
