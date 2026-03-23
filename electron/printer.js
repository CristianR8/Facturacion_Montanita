function formatMoney(value, currency) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function buildThermalReceipt(invoice, companyProfile) {
  const lines = [
    companyProfile.businessName.toUpperCase(),
    companyProfile.taxId,
    companyProfile.address,
    `Tel: ${companyProfile.phone}`,
    companyProfile.email,
    "--------------------------------",
    `Factura: ${invoice.id}`,
    `Cliente: ${invoice.customerName}`,
    `Doc: ${invoice.customerDocument}`,
    `Pago: ${invoice.paymentMethod}`,
    "--------------------------------"
  ];

  for (const item of invoice.items) {
    lines.push(item.description);
    if (item.weightGrams) {
      lines.push(`Peso: ${item.weightGrams} g`);
    }
    lines.push(
      `${item.quantity} x ${formatMoney(item.unitPrice, companyProfile.currency)} = ${formatMoney(
        item.quantity * item.unitPrice,
        companyProfile.currency
      )}`
    );
  }

  lines.push("--------------------------------");
  lines.push(`Subtotal ${formatMoney(invoice.subtotal, companyProfile.currency)}`);
  lines.push(`IVA ${formatMoney(invoice.tax, companyProfile.currency)}`);
  lines.push(`TOTAL ${formatMoney(invoice.total, companyProfile.currency)}`);
  lines.push("--------------------------------");
  lines.push(companyProfile.footerMessage);

  return lines.join("\n");
}

async function printInvoice(invoice, companyProfile) {
  const preview = buildThermalReceipt(invoice, companyProfile);

  return {
    ok: true,
    mode: "demo",
    printerName: companyProfile.printerName,
    preview,
    message:
      "Se genero una salida termica de prueba. Reemplaza electron/printer.js con la integracion real de tu impresora."
  };
}

module.exports = {
  buildThermalReceipt,
  printInvoice
};
