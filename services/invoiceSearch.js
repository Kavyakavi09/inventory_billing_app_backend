import InvoiceModel from '../models/InvoiceModel.js';
import { invalidateUserCache } from './cache.js';
import { embedText } from './embeddingService.js';

export function buildSearchText(invoice) {
  const itemNames = (invoice.items || [])
    .map((item) => item.itemName)
    .filter(Boolean)
    .join(' ');

  return [
    invoice.invoiceNumber,
    invoice.client?.name,
    invoice.notes,
    invoice.status,
    itemNames,
  ]
    .filter(Boolean)
    .join(' ');
}

export function summarizeInvoice(invoice) {
  const total = Number(invoice.total) || 0;
  const received = Number(invoice.totalAmountReceived) || 0;

  return {
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.client?.name || '',
    dueDate: invoice.dueDate,
    total,
    amountReceived: received,
    balance: total - received,
    status: invoice.status,
    notes: invoice.notes || '',
  };
}

function ownedBy(userId) {
  return { creator: userId };
}

export async function listOverdueInvoices(userId) {
  const invoices = await InvoiceModel.find(ownedBy(userId)).lean();
  const today = new Date();

  return invoices
    .map(summarizeInvoice)
    .filter((invoice) => invoice.balance > 0 && invoice.dueDate && new Date(invoice.dueDate) < today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

export async function findInvoicesByClient(userId, clientName) {
  const needle = (clientName || '').trim();
  if (!needle) return [];

  const invoices = await InvoiceModel.find({
    ...ownedBy(userId),
    'client.name': new RegExp(`^${escapeRegex(needle)}$`, 'i'),
  }).lean();

  return invoices.map(summarizeInvoice);
}

export async function getClientBalance(userId, clientName) {
  const invoices = await findInvoicesByClient(userId, clientName);
  const openInvoices = invoices.filter((invoice) => invoice.balance > 0);

  return {
    clientName,
    invoiceCount: invoices.length,
    openInvoiceCount: openInvoices.length,
    totalBilled: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    totalReceived: invoices.reduce((sum, invoice) => sum + invoice.amountReceived, 0),
    balance: openInvoices.reduce((sum, invoice) => sum + invoice.balance, 0),
  };
}

export async function searchInvoiceNotes(userId, query) {
  const text = (query || '').trim();
  if (!text) return [];

  const queryVector = await embedText(text);
  if (queryVector) {
    const vectorMatches = await searchByVector(userId, queryVector);
    if (vectorMatches.length > 0) return vectorMatches;
  }

  try {
    const matches = await InvoiceModel.find(
      { ...ownedBy(userId), $text: { $search: text } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(5)
      .lean();

    if (matches.length > 0) return matches.map(summarizeInvoice);
  } catch (error) {
    console.error('Text search unavailable, using note match', error.message);
  }

  const matches = await InvoiceModel.find({
    ...ownedBy(userId),
    $or: [
      { notes: new RegExp(escapeRegex(text), 'i') },
      { searchText: new RegExp(escapeRegex(text), 'i') },
    ],
  })
    .limit(5)
    .lean();

  return matches.map(summarizeInvoice);
}

async function searchByVector(userId, queryVector) {
  const index = process.env.VECTOR_INDEX_NAME || 'invoice_note_vector';

  try {
    const matches = await InvoiceModel.aggregate([
      {
        $vectorSearch: {
          index,
          path: 'noteEmbedding',
          queryVector,
          numCandidates: 100,
          limit: 5,
          filter: { creator: userId },
        },
      },
      {
        $project: {
          invoiceNumber: 1,
          client: 1,
          dueDate: 1,
          total: 1,
          totalAmountReceived: 1,
          status: 1,
          notes: 1,
        },
      },
    ]);

    if (matches.length > 0) return matches.map(summarizeInvoice);
  } catch (error) {
    console.error('Atlas vector index unavailable, comparing stored embeddings', error.message);
  }

  const docs = await InvoiceModel.find({
    ...ownedBy(userId),
    noteEmbedding: { $exists: true },
  })
    .select('invoiceNumber client dueDate total totalAmountReceived status notes noteEmbedding')
    .limit(500)
    .lean();

  return docs
    .map((invoice) => ({ invoice, score: cosine(queryVector, invoice.noteEmbedding) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => summarizeInvoice(row.invoice));
}

async function applyIndex(invoice) {
  invoice.searchText = buildSearchText(invoice);
  const vector = await embedText(invoice.searchText);
  if (vector) invoice.noteEmbedding = vector;
  invoice.indexedAt = new Date();
  await invoice.save();

  for (const userId of invoice.creator || []) {
    await invalidateUserCache(userId);
  }
}

export async function indexInvoice(invoiceId) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) return null;
  await applyIndex(invoice);
  return invoice.invoiceNumber;
}

export async function indexPendingInvoices(limit = 200) {
  const missingVector = process.env.GEMINI_API_KEY ? [{ noteEmbedding: { $exists: false } }] : [];
  const pending = await InvoiceModel.find({
    $or: [{ indexedAt: null }, { searchText: '' }, ...missingVector],
  }).limit(limit);

  for (const invoice of pending) {
    await applyIndex(invoice);
  }

  return pending.length;
}

function cosine(left, right) {
  if (!Array.isArray(right) || left.length !== right.length) return 0;
  let dot = 0;
  let leftSize = 0;
  let rightSize = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftSize += left[index] * left[index];
    rightSize += right[index] * right[index];
  }
  const scale = Math.sqrt(leftSize) * Math.sqrt(rightSize);
  return scale === 0 ? 0 : dot / scale;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
