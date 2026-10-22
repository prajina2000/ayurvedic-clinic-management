import { downloadBrandedExcel } from './brandedExcel.js';

export function saveSupplierBillsExcel(purchases, date) {
  const rows = purchases.map((item, index) => {
    const purchaseDate = String(item.purchased_at || '').slice(0, 10);
    const [year, month, day] = purchaseDate.split('-');
    const balance = Math.max(0, Number(item.total || 0) - Number(item.amount_paid || 0));
    return [
      index + 1,
      year && month && day ? `${day}/${month}/${year}` : '',
      item.supplier_name || '',
      item.items?.map((line) => line.medicineName).filter(Boolean).join(', ') || '',
      item.items?.reduce((sum, line) => sum + Number(line.quantity || 0), 0) || 0,
      item.invoice_number || '',
      Number(item.subtotal ?? item.total ?? 0),
      Number(item.tax || 0),
      Number(item.total || 0),
      Number(item.amount_paid || 0),
      balance,
      balance === 0 ? 'Completed' : 'Balance due',
    ];
  });

  downloadBrandedExcel({
    filename: `kariyil-supplier-bill-payment-details-${date}.xlsx`,
    sheetName: 'Supplier Bill Payments',
    subtitle: `Supplier bill payment details · ${date}`,
    headers: ['No.', 'Date', 'Supplier', 'Medicines', 'Quantity', 'Bill no.', 'Bill amount (INR)', 'GST / tax (INR)', 'Total amount (INR)', 'Paid amount (INR)', 'Balance (INR)', 'Status'],
    rows,
    widths: [7, 14, 25, 42, 12, 20, 19, 17, 20, 19, 17, 17],
    currencyColumns: [6, 7, 8, 9, 10],
    numberColumns: [0, 4],
  });
}
