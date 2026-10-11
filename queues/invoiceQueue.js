import amqp from 'amqplib';

export const INVOICE_QUEUE = 'invoice_index';

let connection;
let channel;
let connecting;

async function connect() {
  const url = process.env.RABBITMQ_URL;
  if (!url) return null;

  connection = await amqp.connect(url);
  connection.on('error', (error) => {
    console.error('RabbitMQ connection error', error.message);
  });
  connection.on('close', () => {
    connection = null;
    channel = null;
    connecting = null;
  });

  channel = await connection.createChannel();
  await channel.assertQueue(INVOICE_QUEUE, { durable: true });
  return channel;
}

export async function getChannel() {
  if (!process.env.RABBITMQ_URL) return null;
  if (channel) return channel;
  if (!connecting) {
    connecting = connect().catch((error) => {
      connecting = null;
      channel = null;
      connection = null;
      console.error('RabbitMQ connection failed', error.message);
      return null;
    });
  }
  return connecting;
}

export async function publishInvoiceJob(invoiceId, action) {
  try {
    const queueChannel = await getChannel();
    if (!queueChannel) return;

    queueChannel.sendToQueue(
      INVOICE_QUEUE,
      Buffer.from(JSON.stringify({ invoiceId, action })),
      { persistent: true }
    );
  } catch (error) {
    channel = null;
    connecting = null;
    console.error('Failed to publish invoice job', error.message);
  }
}
