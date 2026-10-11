import mongoose from 'mongoose';

const AssistantChatSchema = mongoose.Schema({
  userId: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

AssistantChatSchema.index({ userId: 1, createdAt: -1 });

const AssistantChat = mongoose.model('AssistantChat', AssistantChatSchema);
export default AssistantChat;
