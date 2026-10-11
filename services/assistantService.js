import axios from 'axios';
import {
  findInvoicesByClient,
  getClientBalance,
  listOverdueInvoices,
  searchInvoiceNotes,
} from './invoiceSearch.js';
import { getCachedAnswer, setCachedAnswer } from './cache.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const tools = [
  {
    type: 'function',
    function: {
      name: 'listOverdueInvoices',
      description: 'List this user\'s invoices that still have a balance and are past due.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getClientBalance',
      description: 'Return how much one client still owes this user.',
      parameters: {
        type: 'object',
        properties: {
          clientName: { type: 'string', description: 'Client name' },
        },
        required: ['clientName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'findInvoicesByClient',
      description: 'List every invoice for one client, including paid invoices.',
      parameters: {
        type: 'object',
        properties: {
          clientName: { type: 'string', description: 'Client name' },
        },
        required: ['clientName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchInvoiceNotes',
      description: 'Find invoices whose notes mention a phrase, such as a promise or a payment method.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for in the notes' },
        },
        required: ['query'],
      },
    },
  },
];

async function runTool(userId, name, argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { error: 'Invalid tool arguments' };
  }

  if (name === 'listOverdueInvoices') return listOverdueInvoices(userId);
  if (name === 'getClientBalance') return getClientBalance(userId, args.clientName || '');
  if (name === 'findInvoicesByClient') return findInvoicesByClient(userId, args.clientName || '');
  if (name === 'searchInvoiceNotes') return searchInvoiceNotes(userId, args.query || '');
  return { error: `Unknown tool ${name}` };
}

async function completeChat(messages) {
  const response = await axios.post(
    GROQ_URL,
    {
      model: GROQ_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      stream: false,
    },
    {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices?.[0]?.message;
}

export async function askAssistant(userId, question) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const cached = await getCachedAnswer(userId, question);
  if (cached?.answer) {
    return { answer: cached.answer, cache: 'hit' };
  }

  const messages = [
    {
      role: 'system',
      content: [
        'You are an invoice assistant for the signed-in user.',
        'Use a tool for balances, overdue invoices, client invoices, and note searches.',
        'Mention amounts and invoice numbers only when they appear in a tool result.',
        'If a tool returns no rows, say that plainly.',
      ].join(' '),
    },
    { role: 'user', content: question },
  ];

  for (let step = 0; step < 3; step += 1) {
    const message = await completeChat(messages);
    if (!message) throw new Error('Groq returned no message');

    const toolCalls = message.tool_calls || [];
    if (toolCalls.length === 0) {
      const answer = message.content || '';
      await setCachedAnswer(userId, question, answer);
      return { answer, cache: 'miss' };
    }

    messages.push(message);
    for (const call of toolCalls) {
      const output = await runTool(userId, call.function.name, call.function.arguments);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  throw new Error('The assistant took too many steps');
}
