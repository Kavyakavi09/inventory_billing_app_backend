import { askAssistant } from '../services/assistantService.js';
import AssistantChat from '../models/AssistantChat.js';

const PAGE_SIZE = 10;

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
    try {
      await AssistantChat.create({
        userId: req.userId,
        question: message,
        answer: result.answer,
      });
    } catch (saveError) {
      console.error('Assistant history save failed', saveError.message);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Assistant request failed', error.message);
    res.status(502).json({ message: 'Assistant is unavailable' });
  }
};

export const history = async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const before = req.query.before ? new Date(req.query.before) : null;
  if (req.query.before && Number.isNaN(before.getTime())) {
    return res.status(400).json({ message: 'before must be a date' });
  }

  try {
    const filter = { userId: req.userId };
    if (before) filter.createdAt = { $lt: before };

    const chats = await AssistantChat.find(filter)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = chats.length > PAGE_SIZE;
    const page = hasMore ? chats.slice(0, PAGE_SIZE) : chats;
    const oldest = page[page.length - 1];
    const messages = page.reverse().flatMap((chat) => [
      { role: 'user', text: chat.question, createdAt: chat.createdAt },
      { role: 'assistant', text: chat.answer, createdAt: chat.createdAt },
    ]);

    res.status(200).json({
      messages,
      hasMore,
      nextCursor: oldest ? oldest.createdAt : null,
    });
  } catch (error) {
    console.error('Assistant history failed', error.message);
    res.status(500).json({ message: 'Could not load chat history' });
  }
};
