const { Pool } = require("pg");

const demoInvoices = [
  {
    id: "INV-1001",
    customerName: "Maria Herrera",
    customerDocument: "CC 10101010",
    createdAt: new Date().toISOString(),
    subtotal: 32500,
    tax: 0,
    total: 32500,
    status: "Impresa",
    items: [
      { description: "Cafe artesanal", quantity: 1, unitPrice: 18500, weightGrams: 500 },
      { description: "Frasco de miel de montana", quantity: 1, unitPrice: 14000 }
    ]
  },
  {
    id: "INV-1000",
    customerName: "Jorge Salinas",
    customerDocument: "NIT 900123456",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    subtotal: 54000,
    tax: 0,
    total: 54000,
    status: "Impresa",
    items: [
      { description: "Paquete de cacao organico", quantity: 2, unitPrice: 12000 },
      { description: "Canasta de regalo", quantity: 1, unitPrice: 30000 }
    ]
  }
];

const demoCompanyProfile = {
  businessName: "La Montanita",
  address: "Bucaramanga, Santander",
  phone: "+57 3152837667",
  logoUrl: "logo.jpg",
  footerMessage: "Gracias por su compra. Regrese pronto.",
  printerName: "IMPRESORA LA MONTAÑITA",
  currency: "COP"
};

let pool;

const configuredThermalPrinterName = "POS-80";

function normalizePrinterKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

function resolveConfiguredPrinterName(value) {
  const candidate = String(value || "").trim();
  const candidateKey = normalizePrinterKey(candidate);

  if (
    !candidateKey ||
    candidateKey.startsWith("IMPRESORA LA MONTA") ||
    candidateKey === "POS 58" ||
    candidateKey === "POS58"
  ) {
    return configuredThermalPrinterName;
  }

  return candidate;
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no esta configurada. Crea un archivo .env basado en .env.example y apunta a tu servidor PostgreSQL."
    );
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
  });

  return pool;
}

async function ensureSchema() {
  const currentPool = getPool();

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      business_name TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      logo_url TEXT NOT NULL DEFAULT '',
      footer_message TEXT NOT NULL,
      printer_name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'COP',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_document TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      tax NUMERIC(12, 2) NOT NULL,
      total NUMERIC(12, 2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      weight_grams INTEGER
    );
  `);

  await currentPool.query(`
    ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER;
  `);

  await currentPool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS customer_phone TEXT NOT NULL DEFAULT '';
  `);

  await currentPool.query(
    `
      INSERT INTO company_profile (
        id, business_name, tax_id, address, phone, email, logo_url, footer_message, printer_name, currency
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING;
    `,
    [
      demoCompanyProfile.businessName,
      "",
      demoCompanyProfile.address,
      demoCompanyProfile.phone,
      "",
      demoCompanyProfile.logoUrl,
      demoCompanyProfile.footerMessage,
      demoCompanyProfile.printerName,
      demoCompanyProfile.currency
    ]
  );

  await currentPool.query(
    `
      UPDATE company_profile
      SET printer_name = $1, updated_at = NOW()
      WHERE id = 1
        AND (
          COALESCE(NULLIF(BTRIM(printer_name), ''), '') = ''
          OR printer_name ILIKE 'IMPRESORA LA MONTA%'
          OR printer_name ILIKE 'POS-58'
          OR printer_name ILIKE 'POS58'
        );
    `,
    [configuredThermalPrinterName]
  );

  await currentPool.query(
    `
      UPDATE company_profile
      SET address = $1, updated_at = NOW()
      WHERE id = 1
        AND BTRIM(address) = 'Av. de las Flores 145, Bogota';
    `,
    [demoCompanyProfile.address]
  );

  await currentPool.query(
    `
      UPDATE company_profile
      SET phone = $1, updated_at = NOW()
      WHERE id = 1
        AND BTRIM(phone) = '+57 300 123 4567';
    `,
    [demoCompanyProfile.phone]
  );

  return { mode: "postgres" };
}

function mapInvoiceRow(invoiceRow, items) {
  const createdAt =
    invoiceRow.created_at instanceof Date
      ? invoiceRow.created_at.toISOString()
      : invoiceRow.created_at
        ? String(invoiceRow.created_at)
        : undefined;

  return {
    id: invoiceRow.id,
    customerName: invoiceRow.customer_name,
    customerDocument: invoiceRow.customer_document,
    customerPhone: invoiceRow.customer_phone || "",
    customerEmail: invoiceRow.customer_email,
    paymentMethod: invoiceRow.payment_method,
    notes: invoiceRow.notes,
    status: invoiceRow.status,
    subtotal: Number(invoiceRow.subtotal),
    tax: Number(invoiceRow.tax),
    total: Number(invoiceRow.total),
    createdAt,
    items: items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      weightGrams: item.weight_grams == null ? undefined : Number(item.weight_grams)
    }))
  };
}

async function listInvoices() {
  const currentPool = getPool();

  const { rows } = await currentPool.query(
    "SELECT * FROM invoices ORDER BY created_at DESC LIMIT 25"
  );

  const invoices = await Promise.all(
    rows.map(async (row) => {
      const itemRows = await currentPool.query(
        "SELECT description, quantity, unit_price, weight_grams FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC",
        [row.id]
      );

      return mapInvoiceRow(row, itemRows.rows);
    })
  );

  return invoices;
}

async function getCompanyProfile() {
  const currentPool = getPool();

  const { rows } = await currentPool.query(
    "SELECT * FROM company_profile WHERE id = 1 LIMIT 1"
  );

  const row = rows[0];

  if (!row) {
    throw new Error("No se encontro el perfil de empresa en la base de datos.");
  }

  return {
    businessName: row.business_name,
    address: row.address,
    phone: row.phone,
    logoUrl: row.logo_url,
    footerMessage: row.footer_message,
    printerName: resolveConfiguredPrinterName(row.printer_name),
    currency: row.currency
  };
}

async function saveCompanyProfile(profile) {
  const currentPool = getPool();

  await currentPool.query(
    `
      INSERT INTO company_profile (
        id, business_name, tax_id, address, phone, email, logo_url, footer_message, printer_name, currency, updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        business_name = EXCLUDED.business_name,
        tax_id = EXCLUDED.tax_id,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        logo_url = EXCLUDED.logo_url,
        footer_message = EXCLUDED.footer_message,
        printer_name = EXCLUDED.printer_name,
        currency = EXCLUDED.currency,
        updated_at = NOW();
    `,
    [
      profile.businessName,
      String(profile.taxId || ""),
      profile.address,
      profile.phone,
      String(profile.email || ""),
      profile.logoUrl,
      profile.footerMessage,
      resolveConfiguredPrinterName(profile.printerName),
      profile.currency
    ]
  );

  return getCompanyProfile();
}

function normalizeWeightGrams(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

async function createInvoice(invoice) {
  const currentPool = getPool();

  const client = await currentPool.connect();
  const normalizedSubtotal = Number(invoice.subtotal) || 0;
  const normalizedTax = 0;
  const normalizedTotal = normalizedSubtotal;

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO invoices (
          id, customer_name, customer_document, customer_phone, customer_email, payment_method,
          notes, status, subtotal, tax, total, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `,
      [
        invoice.id,
        invoice.customerName,
        invoice.customerDocument || "",
        invoice.customerPhone || "",
        invoice.customerEmail || "",
        invoice.paymentMethod,
        invoice.notes,
        invoice.status,
        normalizedSubtotal,
        normalizedTax,
        normalizedTotal
      ]
    );

    for (const item of invoice.items) {
      await client.query(
        `
          INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, weight_grams)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          invoice.id,
          item.description,
          item.quantity,
          item.unitPrice,
          normalizeWeightGrams(item.weightGrams)
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    ...invoice,
    subtotal: normalizedSubtotal,
    tax: normalizedTax,
    total: normalizedTotal,
    createdAt: new Date().toISOString()
  };
}

async function deleteInvoice(invoiceId) {
  const currentPool = getPool();
  const client = await currentPool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [invoiceId]);
    const result = await client.query("DELETE FROM invoices WHERE id = $1", [invoiceId]);

    if (result.rowCount === 0) {
      throw new Error(`No se encontro la factura ${invoiceId} para eliminar.`);
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getBootstrapData() {
  const schemaStatus = await ensureSchema();
  const [companyProfile, invoices] = await Promise.all([getCompanyProfile(), listInvoices()]);

  return {
    mode: schemaStatus.mode,
    companyProfile,
    invoices
  };
}

module.exports = {
  createInvoice,
  deleteInvoice,
  ensureSchema,
  getBootstrapData,
  getCompanyProfile,
  listInvoices,
  saveCompanyProfile
};
