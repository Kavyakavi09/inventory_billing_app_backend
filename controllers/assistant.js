import { askAssistant } from '../services/assistantService.js';

export const chat = async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ message: 'message is required' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ message: 'message is too long' });
  }
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const result = await askAssistant(req.userId, message);
    res.status(200).json(result);
  } catch (error) {
    console.error('Assistant request failed', error.message);
    res.status(502).json({ message: 'Assistant is unavailable' });
  }
};
