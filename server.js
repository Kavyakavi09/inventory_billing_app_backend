import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
app.use(cors());

// dotenv environment setup
dotenv.config();

// middlewares

app.use(express.json({ limit: '30mb', extended: true }));

app.use('/invoices', invoiceRoutes);
app.use('/clients', clientRoutes);
app.use('/users', userRoutes);
app.use('/profiles', profile);

// NODEMAILER TRANSPORT FOR SENDING INVOICE VIA EMAIL

var options = { format: 'A4' };
//SEND PDF INVOICE VIA EMAIL
app.post('/send-pdf', async (req, res) => {
  const { email, company } = req.body;

  try {
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
      from: `Invoicybilly <hello@invoicybilly.com>`, // sender address
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
          path: `${__dirname}/invoice.pdf`,
        },
      ],
    };
    transporter.sendMail(mail, (err, info) => {
      if (err) {
        console.log(err);
      } else {
        console.log('Mail has been sent', info.response);
        res.status(200).json({ message: 'Mail has been sent successfully' });
      }
    });
  } catch (error) {
    console.log(error);
  }
});

//CREATE AND SEND PDF INVOICE
app.post('/create-pdf', (req, res) => {
  pdf.create(pdfTemplate(req.body), {}).toFile('invoice.pdf', (err) => {
    if (err) {
      res.send(Promise.reject());
    } else {
      res.send(Promise.resolve());
    }
  });
});

//SEND PDF INVOICE
app.get('/fetch-pdf', (req, res) => {
  res.sendFile(`${__dirname}/invoice.pdf`);
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
