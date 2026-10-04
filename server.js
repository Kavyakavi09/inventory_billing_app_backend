// Load env vars first: some modules (e.g. middleware/auth.js) read
// process.env at import time, so this must run before them.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connect from './db/connectDb.js';
import nodemailer from 'nodemailer';
import userRoutes from './routes/userRoutes.js';
import invoiceRoutes from './routes/invoices.js';
import clientRoutes from './routes/clients.js';
import profile from './routes/profile.js';
import pdfTemplate from './documents/index.js';
import emailTemplate from './documents/email.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pdf from 'html-pdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// web server
const app = express();

// CORS_ORIGIN can be a comma-separated list of allowed origins.
// If it is not set, all origins are allowed (fine for local development only).
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*';
app.use(cors({ origin: allowedOrigins }));

// Health check for Docker, load balancers (ALB) and Kubernetes probes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// middlewares

app.use(express.json({ limit: '30mb', extended: true }));

app.use('/invoices', invoiceRoutes);
app.use('/clients', clientRoutes);
app.use('/users', userRoutes);
app.use('/profiles', profile);

// NODEMAILER TRANSPORT FOR SENDING INVOICE VIA EMAIL

// Render the invoice to a PDF buffer in memory (nothing is written to disk,
// so concurrent requests and multiple containers cannot overwrite each other).
const createPdfBuffer = (data) =>
  new Promise((resolve, reject) => {
    pdf
      .create(pdfTemplate(data), { format: 'A4' })
      .toBuffer((err, buffer) => (err ? reject(err) : resolve(buffer)));
  });

//SEND PDF INVOICE VIA EMAIL
app.post('/send-pdf', async (req, res) => {
  const { email, company } = req.body;

  // The sender's business profile (Settings page) is required for the email
  if (!company) {
    return res.status(400).json({
      message: 'Business profile not found. Please fill in Settings first.',
    });
  }

  try {
    const pdfBuffer = await createPdfBuffer(req.body);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mail = {
      // MAIL_FROM can override the sender; Gmail/SES only allow addresses you own
      from: process.env.MAIL_FROM || `Invoicybilly <${process.env.SMTP_USER}>`,
      to: `${email}`, // list of receivers
      replyTo: `${company.email}`,
      subject: `Invoice from ${
        company.businessName ? company.businessName : company.name
      }`, // Subject line
      text: `Invoice from ${
        company.businessName ? company.businessName : company.name
      }`, // plain text body
      html: emailTemplate(req.body), // html body
      attachments: [
        {
          filename: 'invoice.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };
    transporter.sendMail(mail, (err, info) => {
      if (err) {
        console.log(err);
        return res
          .status(500)
          .json({ message: 'Failed to send email', error: err.message });
      }
      console.log('Mail has been sent', info.response);
      res.status(200).json({ message: 'Mail has been sent successfully' });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Failed to send email' });
  }
});

//CREATE PDF INVOICE AND RETURN IT DIRECTLY (used by the Download button)
app.post('/create-pdf', async (req, res) => {
  try {
    const pdfBuffer = await createPdfBuffer(req.body);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="invoice.pdf"',
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Failed to create PDF' });
  }
});

app.get('/', (req, res) => {
  res.send('SERVER IS RUNNING');
});

let port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`The App is running on the port ${port}!`);
  // connect to the database
  connect();
});
