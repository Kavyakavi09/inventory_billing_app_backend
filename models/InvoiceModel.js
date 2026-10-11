import mongoose from 'mongoose';

const InvoiceSchema = mongoose.Schema({
  dueDate: Date,
  currency: String,
  items: [
    { itemName: String, unitPrice: String, quantity: String, discount: String },
  ],
  rates: String,
  vat: Number,
  total: Number,
  subTotal: Number,
  notes: String,
  status: String,
  invoiceNumber: String,
  type: String,
  creator: [String],
  totalAmountReceived: Number,
  client: { name: String, email: String, phone: String, address: String },
  paymentRecords: [
    {
      amountPaid: Number,
      datePaid: Date,
      paymentMethod: String,
      note: String,
      paidBy: String,
    },
  ],
  createdAt: {
    type: Date,
    default: new Date(),
  },
  searchText: { type: String, default: '' },
  indexedAt: { type: Date, default: null },
  noteEmbedding: { type: [Number] },
});

InvoiceSchema.index({ searchText: 'text', notes: 'text' });

const InvoiceModel = mongoose.model('InvoiceModel', InvoiceSchema);
export default InvoiceModel;
