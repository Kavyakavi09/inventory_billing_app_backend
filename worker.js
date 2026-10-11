import 'dotenv/config';
import connect from './db/connectDb.js';
import { getChannel, INVOICE_QUEUE } from './queues/invoiceQueue.js';
import { indexInvoice, indexPendingInvoices } from './services/invoiceSearch.js';

await connect();

const indexed = await indexPendingInvoices();
console.log(`Indexed ${indexed} pending invoices`);

const queueChannel = await getChannel();
if (!queueChannel) {
  console.error('Set RABBITMQ_URL to a CloudAMQP URL before starting the worker');
  process.exit(1);
}

queueChannel.prefetch(5);
await queueChannel.consume(INVOICE_QUEUE, async (message) => {
  if (!message) return;

  try {
    const job = JSON.parse(message.content.toString());
    if (job.action === 'upsert' && job.invoiceId) {
      const invoiceNumber = await indexInvoice(job.invoiceId);
      console.log('Indexed invoice', invoiceNumber || job.invoiceId);
    }
    queueChannel.ack(message);
  } catch (error) {
    console.error('Invoice job failed', error.message);
    queueChannel.nack(message, false, false);
  }
});

console.log(`Worker listening on ${INVOICE_QUEUE}`);
