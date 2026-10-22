import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb, withTransaction } from '../config/db.js';
import { audit } from '../services/auditService.js';
import { clinicDate } from '../services/dateService.js';
import { makeDocument, toRecord, toRecords } from '../services/recordUtils.js';

const purchaseSchema = z.object({ supplierName: z.string().min(1).max(180), invoiceNumber: z.string().max(80).optional(), purchasedAt: z.string().date().optional(), amountPaid: z.coerce.number().min(0).default(0), items: z.array(z.object({ medicineId: z.string().uuid(), batchNumber: z.string().min(1).max(80), expiryDate: z.string().date(), quantity: z.coerce.number().positive(), purchasePrice: z.coerce.number().min(0), salePrice: z.coerce.number().min(0), gstRate: z.coerce.number().min(0).max(100) })).min(1) });
const purchasePaymentSchema = z.object({ amount: z.coerce.number().positive() });
const billSchema = z.object({ patientId: z.string().uuid().optional().nullable(), doctorId: z.string().uuid().optional().nullable(), prescriptionId: z.string().uuid().optional().nullable(), items: z.array(z.object({ medicineId: z.string().uuid(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().min(0).optional(), gstRate: z.coerce.number().min(0).max(100).optional(), discount: z.coerce.number().min(0).default(0) })).optional(), discount: z.coerce.number().min(0).default(0), amountPaid: z.coerce.number().min(0).optional(), paymentMode: z.enum(['cash','upi','card','bank-transfer','other']).default('cash'), paymentReference: z.string().max(120).optional().nullable(), idempotencyKey: z.string().uuid().optional() });
const cancellationSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const contains = (value, term) => String(value || '').toLocaleLowerCase().includes(String(term || '').toLocaleLowerCase());
const escapeRegex = (value) => [...value].map((char) => ('.*+?^${}()|[]'.includes(char) || char === String.fromCharCode(92)) ? String.fromCharCode(92) + char : char).join('');
const paymentStatus = (bill) => bill.cancelled_at ? 'Cancelled' : Number(bill.total) === 0 || Number(bill.amount_paid) >= Number(bill.total) ? 'Paid' : Number(bill.amount_paid) > 0 ? 'Partially paid' : 'Unpaid';
const pageOf = (items, page, pageSize) => ({ data: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: items.length } });

async function loadPharmacyBill(db, id, session) {
  const bill = await db.collection('pharmacy_bills').findOne({ id }, { session });
  if (!bill) return null;
  const patient = bill.patient_id ? await db.collection('patients').findOne({ id: bill.patient_id }, { session }) : null;
  const doctor = bill.doctor_id ? await db.collection('users').findOne({ id: bill.doctor_id }, { session }) : null;
  return { ...toRecord(bill), patient_name: patient?.name || null, uhid: patient?.uhid || null, patient_phone: patient?.phone || null, doctor_name: doctor?.name || null, payment_status: paymentStatus(bill) };
}

export async function stock(req, res, next) {
  try {
    const db = getDb(); const term = String(req.query.search || '').trim(); const today = clinicDate();
    const [medicines, batches] = await Promise.all([
      db.collection('medicine_master').find({ is_active: true }).sort({ name: 1 }).toArray(),
      db.collection('medicine_batches').find({ quantity_remaining: { $gt: 0 } }).toArray(),
    ]);
    const data = medicines.map((medicine) => {
      const all = batches.filter((batch) => batch.medicine_id === medicine.id);
      const active = all.filter((batch) => batch.expiry_date >= today).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      const next = active[0];
      return { id: medicine.id, medicine_id: medicine.id, name: medicine.name, medicine_code: medicine.medicine_code, generic_name: medicine.generic_name, unit: medicine.unit, reorder_level: medicine.reorder_level,
        quantity_on_hand: active.reduce((sum, batch) => sum + Number(batch.quantity_remaining), 0), sale_price: next?.sale_price || 0, gst_rate: next?.gst_rate || 0, batch_number: next?.batch_number || null,
        batch_expiry: next?.expiry_date || null, expired_quantity: all.filter((batch) => batch.expiry_date < today).reduce((sum, batch) => sum + Number(batch.quantity_remaining), 0),
        form: medicine.form, description: medicine.description, category: medicine.category, manufacturer: medicine.manufacturer, default_gst_rate: medicine.default_gst_rate };
    }).filter((item) => !term || [item.name, item.medicine_code, item.category, item.manufacturer].some((value) => contains(value, term))).slice(0, 200);
    const alerts = await Promise.all(batches.filter((batch) => batch.expiry_date <= shiftDate(today, 30)).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)).slice(0, 100).map(async (batch) => {
      const medicine = medicines.find((item) => item.id === batch.medicine_id) || await db.collection('medicine_master').findOne({ id: batch.medicine_id });
      return { id: batch.id, batch_number: batch.batch_number, expiry_date: batch.expiry_date, quantity_remaining: batch.quantity_remaining, medicine_name: medicine?.name || 'Unknown medicine' };
    }));
    res.json({ data, alerts });
  } catch (error) { next(error); }
}

export async function addMedicine(req, res, next) {
  try {
    const input = z.object({ name: z.string().min(1).max(180), description: z.string().max(500).optional(), genericName: z.string().max(180).optional(), form: z.string().max(80).optional(), category: z.string().max(100).default('Ayurvedic'), manufacturer: z.string().max(180).optional(), unit: z.string().min(1).max(80), reorderLevel: z.coerce.number().min(0).default(0), defaultGstRate: z.coerce.number().min(0).max(100).default(0), stockQuantity: z.coerce.number().min(0).default(0), supplierName: z.string().max(180).optional(), invoiceNumber: z.string().max(80).optional(), batchNumber: z.string().max(80).optional(), expiryDate: z.string().date().optional().nullable(), purchasePrice: z.coerce.number().min(0).optional(), salePrice: z.coerce.number().min(0).optional(), gstRate: z.coerce.number().min(0).max(100).default(0) }).refine((data) => data.stockQuantity === 0 || Boolean(data.supplierName?.trim() && data.batchNumber?.trim() && data.expiryDate && data.purchasePrice !== undefined && data.salePrice !== undefined), { message: 'Supplier, batch, expiry, purchase price and selling price are required when initial stock is added' }).parse(req.body);
    const medicine = await withTransaction(async (db, session) => {
      const counter = await db.collection('counters').findOneAndUpdate({ _id: 'medicine_code' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session });
      const medicineCode = 'MED' + String(counter.value).padStart(3, '0');
      const created = makeDocument({ medicine_code: medicineCode, name: input.name, description: input.description || null, generic_name: input.genericName || null, form: input.form || null, category: input.category, manufacturer: input.manufacturer || null, unit: input.unit, reorder_level: input.reorderLevel, default_gst_rate: input.defaultGstRate, is_active: true }, req.user.sub);
      await db.collection('medicine_master').insertOne(created, { session });
      if (input.stockQuantity > 0) {
        if (input.expiryDate < clinicDate()) throw Object.assign(new Error('Expiry date must be today or later'), { status: 400 });
        await upsertSupplier(db, input.supplierName.trim(), req.user.sub, session);
        const subtotal = roundMoney(input.stockQuantity * input.purchasePrice); const tax = roundMoney(subtotal * input.gstRate / 100);
        const purchase = makeDocument({ supplier_name: input.supplierName.trim(), invoice_number: input.invoiceNumber || null, purchased_at: clinicDate(), subtotal, tax, total: roundMoney(subtotal + tax), amount_paid: 0, items: [] }, req.user.sub);
        await db.collection('purchases').insertOne(purchase, { session });
        const batch = makeDocument({ medicine_id: created.id, purchase_id: purchase.id, batch_number: input.batchNumber.trim(), expiry_date: input.expiryDate, quantity_received: input.stockQuantity, quantity_remaining: input.stockQuantity, purchase_price: input.purchasePrice, sale_price: input.salePrice, gst_rate: input.gstRate }, req.user.sub);
        await db.collection('medicine_batches').insertOne(batch, { session });
        purchase.items = [{ medicineCode, medicineName: input.name, batchNumber: batch.batch_number, expiryDate: batch.expiry_date, quantity: input.stockQuantity, purchasePrice: input.purchasePrice, salePrice: input.salePrice }];
        await db.collection('purchases').updateOne({ id: purchase.id }, { $set: { items: purchase.items } }, { session });
        await audit(db, { actorId: req.user.sub, action: 'create', entity: 'purchase', entityId: purchase.id, details: { medicineId: created.id, initialStock: input.stockQuantity } }, session);
      }
      await audit(db, { actorId: req.user.sub, action: 'create', entity: 'medicine', entityId: created.id, details: { medicineCode, initialStock: input.stockQuantity } }, session);
      return toRecord(created);
    });
    res.status(201).json({ medicine });
  } catch (error) { next(error); }
}

export async function createPurchase(req, res, next) {
  try {
    const data = purchaseSchema.parse(req.body);
    const subtotal = roundMoney(data.items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0));
    const tax = roundMoney(data.items.reduce((sum, item) => sum + item.quantity * item.purchasePrice * item.gstRate / 100, 0)); const total = roundMoney(subtotal + tax);
    if (data.amountPaid > total) return res.status(400).json({ error: 'Paid amount cannot be greater than the supplier bill total' });
    const purchase = await withTransaction(async (db, session) => {
      await upsertSupplier(db, data.supplierName.trim(), req.user.sub, session);
      const items = []; const newBatches = [];
      for (const item of data.items) {
        const medicine = await db.collection('medicine_master').findOne({ id: item.medicineId, is_active: true }, { session });
        if (!medicine) throw Object.assign(new Error('Selected medicine was not found'), { status: 404 });
        const batch = makeDocument({ medicine_id: medicine.id, purchase_id: null, batch_number: item.batchNumber, expiry_date: item.expiryDate, quantity_received: item.quantity, quantity_remaining: item.quantity, purchase_price: item.purchasePrice, sale_price: item.salePrice, gst_rate: item.gstRate }, req.user.sub);
        newBatches.push(batch);
        items.push({ medicineCode: medicine.medicine_code, medicineName: medicine.name, batchNumber: item.batchNumber, expiryDate: item.expiryDate, quantity: item.quantity, purchasePrice: item.purchasePrice, salePrice: item.salePrice, batch_id: batch.id });
      }
      const header = makeDocument({ supplier_name: data.supplierName.trim(), invoice_number: data.invoiceNumber || null, purchased_at: data.purchasedAt || clinicDate(), subtotal, tax, total, amount_paid: data.amountPaid, items }, req.user.sub);
      await db.collection('purchases').insertOne(header, { session });
      for (const batch of newBatches) batch.purchase_id = header.id;
      if (newBatches.length) await db.collection('medicine_batches').insertMany(newBatches, { session });
      await audit(db, { actorId: req.user.sub, action: 'create', entity: 'purchase', entityId: header.id, details: { subtotal, tax, total, amountPaid: data.amountPaid, lines: data.items.length } }, session);
      return toRecord(header);
    });
    res.status(201).json({ purchase });
  } catch (error) { next(error); }
}

export async function listPharmacyInventory(req, res, next) {
  try {
    const db = getDb(); const term = String(req.query.search || '').trim();
    const [batches, medicines, purchases] = await Promise.all([db.collection('medicine_batches').find({}).toArray(), db.collection('medicine_master').find({}).toArray(), db.collection('purchases').find({}).toArray()]);
    const rows = batches.map((batch) => {
      const medicine = medicines.find((item) => item.id === batch.medicine_id); const purchase = purchases.find((item) => item.id === batch.purchase_id);
      return { ...toRecord(batch), medicine_id: medicine?.id, medicine_code: medicine?.medicine_code, medicine_name: medicine?.name, unit: medicine?.unit, category: medicine?.category, manufacturer: medicine?.manufacturer, supplier_name: purchase?.supplier_name, invoice_number: purchase?.invoice_number };
    }).filter((item) => !term || [item.medicine_name, item.medicine_code, item.batch_number].some((value) => contains(value, term))).sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)) || String(a.medicine_name).localeCompare(String(b.medicine_name))).slice(0, 500);
    res.json({ data: rows });
  } catch (error) { next(error); }
}

export async function listPharmacySuppliers(req, res, next) {
  try {
    const db = getDb(); const [suppliers, purchases] = await Promise.all([db.collection('pharmacy_suppliers').find({}).sort({ name: 1 }).toArray(), db.collection('purchases').find({}).toArray()]);
    const data = suppliers.map((supplier) => { const linked = purchases.filter((purchase) => purchase.supplier_name === supplier.name); return { ...toRecord(supplier), purchase_count: linked.length, purchase_total: linked.reduce((sum, purchase) => sum + Number(purchase.total), 0), last_purchase: linked.map((purchase) => purchase.purchased_at).sort().at(-1) || null }; });
    res.json({ data });
  } catch (error) { next(error); }
}

export async function addPharmacySupplier(req, res, next) {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(180), phone: z.string().max(30).optional(), email: z.string().email().max(180).optional().or(z.literal('')), address: z.string().max(500).optional() }).parse(req.body);
    const db = getDb(); const supplier = await upsertSupplier(db, input.name, req.user.sub, null, { phone: input.phone || null, email: input.email || null, address: input.address || null });
    await audit(db, { actorId: req.user.sub, action: 'create_or_update', entity: 'pharmacy_supplier', entityId: supplier.id }); res.status(201).json({ supplier });
  } catch (error) { next(error); }
}

export async function listPharmacyPurchases(req, res, next) {
  try { const rows = await getDb().collection('purchases').find({}).sort({ purchased_at: -1, created_at: -1 }).limit(200).toArray(); res.json({ data: toRecords(rows) }); }
  catch (error) { next(error); }
}

export async function recordPurchasePayment(req, res, next) {
  try {
    const { amount } = purchasePaymentSchema.parse(req.body);
    const purchase = await withTransaction(async (db, session) => {
      const current = await db.collection('purchases').findOne({ id: req.params.id }, { session }); if (!current) return null;
      const balance = roundMoney(Number(current.total) - Number(current.amount_paid));
      if (amount > balance) throw Object.assign(new Error('Payment cannot be greater than the remaining supplier bill balance'), { status: 400 });
      const updated = { ...current, amount_paid: roundMoney(Number(current.amount_paid) + amount), updated_at: new Date().toISOString() };
      await db.collection('purchases').replaceOne({ id: current.id, amount_paid: current.amount_paid }, updated, { session });
      await audit(db, { actorId: req.user.sub, action: 'payment_received', entity: 'purchase', entityId: current.id, details: { invoiceNumber: current.invoice_number, amountReceived: amount, amountPaid: updated.amount_paid, balance: roundMoney(Number(updated.total) - Number(updated.amount_paid)) } }, session);
      return toRecord(updated);
    });
    if (!purchase) return res.status(404).json({ error: 'Supplier bill not found' });
    res.json({ purchase, completed: Number(purchase.amount_paid) >= Number(purchase.total) });
  } catch (error) { next(error); }
}

export async function pharmacyReports(req, res, next) {
  try {
    const end = String(req.query.to || clinicDate()); const start = String(req.query.from || end.slice(0, 7) + '-01');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return res.status(400).json({ error: 'Choose a valid date range' });
    const db = getDb(); const [bills, purchases, medicines, batches] = await Promise.all([db.collection('pharmacy_bills').find({}).toArray(), db.collection('purchases').find({}).toArray(), db.collection('medicine_master').find({}).toArray(), db.collection('medicine_batches').find({}).toArray()]);
    const salesInRange = bills.filter((bill) => !bill.cancelled_at && inRange(datePart(bill.created_at), start, end)); const purchasesInRange = purchases.filter((bill) => inRange(bill.purchased_at, start, end));
    const validBatches = batches.filter((batch) => batch.expiry_date >= end); const today = clinicDate();
    res.json({ from: start, to: end,
      sales: { bill_count: salesInRange.length, sales_total: sum(salesInRange, 'total'), gst_total: sum(salesInRange, 'tax') },
      purchases: { purchase_count: purchasesInRange.length, purchase_total: sum(purchasesInRange, 'total') },
      inventory: { medicine_count: new Set(validBatches.map((batch) => batch.medicine_id)).size, units_on_hand: sum(validBatches, 'quantity_remaining'), stock_value: roundMoney(validBatches.reduce((n, batch) => n + Number(batch.quantity_remaining) * Number(batch.purchase_price), 0)) },
      expiry: { near_expiry_batches: batches.filter((batch) => batch.expiry_date >= today && batch.expiry_date <= shiftDate(today, 30) && batch.quantity_remaining > 0).length, expired_units: batches.filter((batch) => batch.expiry_date < today).reduce((n, batch) => n + Number(batch.quantity_remaining), 0) },
    });
  } catch (error) { next(error); }
}

export async function createPharmacyBill(req, res, next) {
  try {
    const input = billSchema.parse(req.body);
    const result = await withTransaction(async (db, session) => {
      if (input.idempotencyKey) { const existing = await db.collection('pharmacy_bills').findOne({ idempotency_key: input.idempotencyKey }, { session }); if (existing) return { ...(await loadPharmacyBill(db, existing.id, session)), idempotentReplay: true }; }
      let patientId = input.patientId || null; let doctorId = input.doctorId || null;
      if (input.prescriptionId) {
        const prescription = await db.collection('prescriptions').findOne({ id: input.prescriptionId }, { session });
        if (!prescription) throw Object.assign(new Error('Prescription not found'), { status: 404 });
        const visit = await db.collection('visits').findOne({ id: prescription.visit_id }, { session });
        if (!visit) throw Object.assign(new Error('Prescription not found'), { status: 404 });
        if (patientId && patientId !== visit.patient_id) throw Object.assign(new Error('Prescription belongs to a different patient'), { status: 400 });
        if (doctorId && visit.doctor_id && doctorId !== visit.doctor_id) throw Object.assign(new Error('Prescription belongs to a different doctor'), { status: 400 });
        patientId = visit.patient_id; doctorId = visit.doctor_id;
      }
      let items = input.items;
      if ((!items || !items.length) && input.prescriptionId) items = (await db.collection('prescription_items').find({ prescription_id: input.prescriptionId, medicine_id: { $ne: null } }, { session }).toArray()).map((item) => ({ medicineId: item.medicine_id, quantity: item.quantity, discount: 0 }));
      if (!items?.length) throw Object.assign(new Error('Add at least one medicine to the bill'), { status: 400 });
      const allocations = []; const priceOverrides = []; const taxOverrides = [];
      for (const item of items) {
        const batches = await db.collection('medicine_batches').find({ medicine_id: item.medicineId, expiry_date: { $gte: clinicDate() }, quantity_remaining: { $gt: 0 } }, { session }).sort({ expiry_date: 1, created_at: 1 }).toArray();
        const available = batches.reduce((n, batch) => n + Number(batch.quantity_remaining), 0);
        if (available < item.quantity) throw Object.assign(new Error('Insufficient unexpired stock (available: ' + available + ')'), { status: 409 });
        if (item.unitPrice !== undefined && batches.some((batch) => Number(batch.sale_price) !== item.unitPrice)) priceOverrides.push({ medicineId: item.medicineId, unitPrice: item.unitPrice });
        if (item.gstRate !== undefined && batches.some((batch) => Number(batch.gst_rate) !== item.gstRate)) taxOverrides.push({ medicineId: item.medicineId, gstRate: item.gstRate });
        let remaining = item.quantity; const lineAllocations = [];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const quantity = Math.min(remaining, Number(batch.quantity_remaining));
          const stockUpdate = await db.collection('medicine_batches').updateOne({ id: batch.id, quantity_remaining: { $gte: quantity } }, { $inc: { quantity_remaining: -quantity }, $set: { updated_at: new Date().toISOString() } }, { session });
          if (!stockUpdate.modifiedCount) throw Object.assign(new Error('Stock changed while billing. Refresh stock and try again.'), { status: 409 });
          const medicine = await db.collection('medicine_master').findOne({ id: batch.medicine_id }, { session });
          const price = item.unitPrice ?? Number(batch.sale_price); const base = quantity * price;
          lineAllocations.push({ medicine_id: batch.medicine_id, medicineId: batch.medicine_id, medicine_name: medicine?.name || 'Medicine', medicineName: medicine?.name || 'Medicine', medicine_code: medicine?.medicine_code, medicine_type: medicine?.form, medicine_description: medicine?.description || medicine?.generic_name || medicine?.form || '', batch_id: batch.id, batchId: batch.id, batch_number: batch.batch_number, expiry_date: batch.expiry_date, expiryDate: batch.expiry_date, quantity, unit_price: price, price, gst_rate: item.gstRate ?? Number(batch.gst_rate), rate: item.gstRate ?? Number(batch.gst_rate), base, discount_amount: 0, discount: 0 });
          remaining -= quantity;
        }
        const itemSubtotal = lineAllocations.reduce((n, line) => n + line.base, 0); const requestedDiscount = roundMoney(item.discount || 0);
        if (requestedDiscount > itemSubtotal) throw Object.assign(new Error('Discount cannot exceed the amount for ' + (lineAllocations[0]?.medicineName || 'this medicine')), { status: 400 });
        let discountLeft = requestedDiscount;
        lineAllocations.forEach((line, index) => { const part = index === lineAllocations.length - 1 ? discountLeft : roundMoney(requestedDiscount * line.base / (itemSubtotal || 1)); line.discount = Math.max(0, Math.min(line.base, part)); line.discount_amount = line.discount; discountLeft = roundMoney(discountLeft - line.discount); });
        allocations.push(...lineAllocations);
      }
      const subtotal = roundMoney(allocations.reduce((n, line) => n + line.base, 0)); const lineDiscount = roundMoney(allocations.reduce((n, line) => n + line.discount, 0));
      if (input.discount > subtotal - lineDiscount) throw Object.assign(new Error('Additional bill discount cannot exceed the remaining subtotal'), { status: 400 });
      let billDiscountLeft = roundMoney(input.discount); let remainingBase = subtotal - lineDiscount;
      allocations.forEach((line, index) => { const lineBase = Math.max(0, line.base - line.discount); const extra = index === allocations.length - 1 ? billDiscountLeft : roundMoney(billDiscountLeft * lineBase / (remainingBase || 1)); const applied = Math.min(lineBase, extra); line.discount = roundMoney(line.discount + applied); line.discount_amount = line.discount; billDiscountLeft = roundMoney(billDiscountLeft - applied); remainingBase -= lineBase; });
      const discount = roundMoney(allocations.reduce((n, line) => n + line.discount, 0)); let tax = 0;
      for (const line of allocations) { line.tax_amount = roundMoney((line.base - line.discount) * line.rate / 100); line.tax = line.tax_amount; line.line_total = roundMoney(line.base - line.discount + line.tax_amount); line.lineTotal = line.line_total; tax += line.tax_amount; }
      tax = roundMoney(tax); const total = roundMoney(subtotal - discount + tax); const amountPaid = input.amountPaid ?? total;
      if (amountPaid > total) throw Object.assign(new Error('Amount paid cannot exceed bill total'), { status: 400 });
      const invoice = 'PH-' + clinicDate().replaceAll('-', '') + '-' + randomUUID().slice(0, 8).toUpperCase();
      const bill = makeDocument({ invoice_number: invoice, patient_id: patientId, prescription_id: input.prescriptionId || null, doctor_id: doctorId, subtotal, discount, tax, total, amount_paid: amountPaid, payment_mode: input.paymentMode, payment_reference: input.paymentReference || null, items: allocations,
        ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}) }, req.user.sub);
      await db.collection('pharmacy_bills').insertOne(bill, { session });
      await audit(db, { actorId: req.user.sub, action: 'create', entity: 'pharmacy_bill', entityId: bill.id, details: { invoice, total, lines: allocations.length, paymentStatus: paymentStatus(bill), paymentMode: input.paymentMode, priceOverrides, taxOverrides, stockDeducted: allocations.map(({ medicine_id, batch_id, quantity }) => ({ medicineId: medicine_id, batchId: batch_id, quantity })) } }, session);
      return await loadPharmacyBill(db, bill.id, session);
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ bill: result });
  } catch (error) {
    if (error.code === 11000 && req.body?.idempotencyKey) {
      try { const existing = await getDb().collection('pharmacy_bills').findOne({ idempotency_key: req.body.idempotencyKey }); if (existing) return res.status(200).json({ bill: await loadPharmacyBill(getDb(), existing.id) }); }
      catch (lookupError) { return next(lookupError); }
    }
    next(error);
  }
}

export async function listPharmacyBills(req, res, next) {
  try {
    const db = getDb(); const page = Math.max(1, Number(req.query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const docs = await db.collection('pharmacy_bills').find({}).sort({ created_at: -1 }).toArray(); const all = await Promise.all(docs.map(async (bill) => {
      const [patient, doctor] = await Promise.all([bill.patient_id ? db.collection('patients').findOne({ id: bill.patient_id }) : null, bill.doctor_id ? db.collection('users').findOne({ id: bill.doctor_id }) : null]);
      return { ...toRecord(bill), patient_name: patient?.name || null, doctor_name: doctor?.name || null, payment_status: paymentStatus(bill) };
    }));
    res.json(pageOf(all, page, pageSize));
  } catch (error) { next(error); }
}

export async function listPrescriptions(req, res, next) {
  try {
    const db = getDb(); const term = String(req.query.search || '').trim(); const prescriptions = await db.collection('prescriptions').find({}).sort({ created_at: -1 }).limit(200).toArray(); const data = [];
    for (const prescription of prescriptions) {
      const visit = await db.collection('visits').findOne({ id: prescription.visit_id }); const patient = visit && await db.collection('patients').findOne({ id: visit.patient_id });
      if (!visit || !patient || (term && !contains(patient.name, term) && !contains(patient.uhid, term))) continue;
      const doctor = await db.collection('users').findOne({ id: visit.doctor_id }); const medicines = await db.collection('prescription_items').find({ prescription_id: prescription.id }).sort({ sort_order: 1 }).toArray();
      data.push({ prescription_id: prescription.id, patient_id: patient.id, patient_name: patient.name, uhid: patient.uhid, visit_date: visit.visit_date, doctor_id: visit.doctor_id, doctor_name: doctor?.name || null, medicines: medicines.map((item) => ({ medicineId: item.medicine_id, medicineName: item.medicine_name, quantity: item.quantity, dose: item.dose, frequency: item.frequency })) });
      if (data.length === 50) break;
    }
    res.json({ data });
  } catch (error) { next(error); }
}

export async function searchPharmacyPatients(req, res, next) {
  try {
    const term = String(req.query.search || '').trim(); const digits = term.replace(/\D/g, '');
    const alternatives = term ? [{ name: { $regex: escapeRegex(term), $options: 'i' } }, { uhid: { $regex: escapeRegex(term), $options: 'i' } }, { phone: { $regex: escapeRegex(term), $options: 'i' } }] : [];
    if (digits) alternatives.push({ phone_digits: { $regex: escapeRegex(digits), $options: 'i' } });
    const docs = await getDb().collection('patients').find(term ? { $or: alternatives } : {}).project({ id: 1, name: 1, uhid: 1, phone: 1 }).sort({ name: 1 }).limit(30).toArray();
    const data = docs.map(({ id, name, uhid, phone }) => ({ id, name, uhid, phone }));
    res.json({ data });
  } catch (error) { next(error); }
}

export async function listPharmacyDoctors(req, res, next) {
  try { const rows = await getDb().collection('users').find({ role: 'Doctor', is_active: true }, { projection: { id: 1, name: 1 } }).sort({ name: 1 }).toArray(); res.json({ data: rows.map(({ id, name }) => ({ id, name })) }); }
  catch (error) { next(error); }
}

export async function getPharmacyBill(req, res, next) {
  try { const bill = await loadPharmacyBill(getDb(), req.params.id); if (!bill) return res.status(404).json({ error: 'Bill not found' }); res.json({ bill }); }
  catch (error) { next(error); }
}

export async function cancelPharmacyBill(req, res, next) {
  try {
    const { reason } = cancellationSchema.parse(req.body);
    const bill = await withTransaction(async (db, session) => {
      const current = await db.collection('pharmacy_bills').findOne({ id: req.params.id }, { session });
      if (!current) throw Object.assign(new Error('Bill not found'), { status: 404 });
      if (current.cancelled_at) return loadPharmacyBill(db, current.id, session);
      for (const item of current.items || []) await db.collection('medicine_batches').updateOne({ id: item.batch_id }, { $inc: { quantity_remaining: item.quantity }, $set: { updated_at: new Date().toISOString() } }, { session });
      const cancelledAt = new Date().toISOString();
      await db.collection('pharmacy_bills').updateOne({ id: current.id, cancelled_at: null }, { $set: { cancelled_at: cancelledAt, cancelled_by: req.user.sub, cancellation_reason: reason, updated_at: cancelledAt } }, { session });
      await audit(db, { actorId: req.user.sub, action: 'cancel_and_restore_stock', entity: 'pharmacy_bill', entityId: current.id, details: { invoice: current.invoice_number, reason, stockRestored: (current.items || []).map(({ medicine_id, batch_id, quantity }) => ({ medicineId: medicine_id, batchId: batch_id, quantity })) } }, session);
      return loadPharmacyBill(db, current.id, session);
    });
    res.json({ bill });
  } catch (error) { next(error); }
}

async function upsertSupplier(db, name, actorId, session, extra = {}) {
  const current = await db.collection('pharmacy_suppliers').findOne({ name }, { session });
  const values = Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  if (current) {
    const updated = { ...current, ...values, updated_at: new Date().toISOString() };
    await db.collection('pharmacy_suppliers').replaceOne({ id: current.id }, updated, { session });
    return toRecord(updated);
  }
  const supplier = makeDocument({ name, phone: values.phone || null, email: values.email || null, address: values.address || null }, actorId);
  await db.collection('pharmacy_suppliers').insertOne(supplier, { session });
  return toRecord(supplier);
}
function shiftDate(date, days) { const value = new Date(date + 'T00:00:00.000Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function datePart(value) { return String(value || '').slice(0, 10); }
function inRange(value, from, to) { const date = datePart(value); return date >= from && date <= to; }
function sum(items, key) { return roundMoney(items.reduce((n, item) => n + Number(item[key] || 0), 0)); }
