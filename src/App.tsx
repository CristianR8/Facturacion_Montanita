import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  BadgeDollarSign,
  Building2,
  Eye,
  FileClock,
  Printer,
  ReceiptText,
  ScrollText,
  ShoppingBasket,
  Trash2
} from "lucide-react";

const defaultInvoice = (): InvoiceRecord => ({
  id: `INV-${Date.now().toString().slice(-6)}`,
  customerName: "",
  customerDocument: "",
  customerPhone: "",
  customerEmail: "",
  paymentMethod: "Efectivo",
  notes: "",
  status: "Impresa",
  subtotal: 0,
  tax: 0,
  total: 0,
  items: []
});

function buildNextInvoiceDraft(previousInvoice?: Partial<InvoiceRecord> | null): InvoiceRecord {
  return {
    ...defaultInvoice(),
    customerName: previousInvoice?.customerName?.trim() || "",
    customerDocument: previousInvoice?.customerDocument?.trim() || "",
    customerPhone: previousInvoice?.customerPhone?.trim() || "",
    customerEmail: previousInvoice?.customerEmail?.trim() || "",
    paymentMethod: previousInvoice?.paymentMethod?.trim() || "Efectivo"
  };
}

const defaultCompanyProfile: CompanyProfile = {
  businessName: "La Montanita",
  address: "Bucaramanga, Santander",
  phone: "+57 3152837667",
  logoUrl: "logo.jpg",
  footerMessage: "Gracias por su compra. Regrese pronto.",
  printerName: "POS-80",
  currency: "COP"
};

const requiredCustomerFields = [
  { key: "customerName", label: "nombre" }
] as const;

function formatFieldList(fields: string[]) {
  if (fields.length === 0) {
    return "";
  }

  if (fields.length === 1) {
    return fields[0];
  }

  if (fields.length === 2) {
    return `${fields[0]} y ${fields[1]}`;
  }

  return `${fields.slice(0, -1).join(", ")} y ${fields[fields.length - 1]}`;
}

function getMissingCustomerFields(invoice: Pick<InvoiceRecord, "customerName">) {
  return requiredCustomerFields
    .filter(({ key }) => String(invoice[key] || "").trim() === "")
    .map(({ label }) => label);
}

function normalizePrinterKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

function normalizePrinterPreference(value?: string | null) {
  const candidate = String(value || "").trim();
  const candidateKey = normalizePrinterKey(candidate);

  if (
    !candidateKey ||
    candidateKey.startsWith("IMPRESORA LA MONTA") ||
    candidateKey === "POS 58" ||
    candidateKey === "POS58"
  ) {
    return defaultCompanyProfile.printerName;
  }

  return candidate;
}

function normalizeCompanyProfile(profile?: Partial<CompanyProfile> | null): CompanyProfile {
  return {
    businessName: profile?.businessName?.trim() || defaultCompanyProfile.businessName,
    address: profile?.address?.trim() || defaultCompanyProfile.address,
    phone: profile?.phone?.trim() || defaultCompanyProfile.phone,
    logoUrl: profile?.logoUrl?.trim() || defaultCompanyProfile.logoUrl,
    footerMessage: profile?.footerMessage?.trim() || defaultCompanyProfile.footerMessage,
    printerName: normalizePrinterPreference(profile?.printerName),
    currency: profile?.currency?.trim() || defaultCompanyProfile.currency
  };
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value || 0);
}

function App() {
  const [mode, setMode] = useState<"demo" | "postgres">("postgres");
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceRecord>(defaultInvoice);
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [lastPrintPreview, setLastPrintPreview] = useState("");
  const [statusMessage, setStatusMessage] = useState("Cargando aplicacion...");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.invoiceApp
      .bootstrap()
      .then((payload) => {
        if (!mounted) {
          return;
        }

        setMode(payload.mode);
        setCompanyProfile(normalizeCompanyProfile(payload.companyProfile));
        setSavedInvoices(payload.invoices);
        setStatusMessage(
          payload.mode === "postgres"
            ? "Conectado a PostgreSQL. Tus registros se guardaran en la base de datos."
            : "Modo demo activo."
        );
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setStatusMessage(
          error instanceof Error
            ? error.message
            : "No se pudo inicializar PostgreSQL. Revisa la configuracion de la base de datos."
        );
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const computedInvoice = useMemo(() => {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    );
    const tax = Math.round(subtotal * 0.19);
    const total = subtotal + tax;

    return {
      ...invoice,
      subtotal,
      tax,
      total
    };
  }, [invoice]);

  const missingCustomerFields = useMemo(
    () => getMissingCustomerFields(invoice),
    [invoice.customerName]
  );

  const invoiceIdMissing = invoice.id.trim() === "";
  const canUseInvoiceActions = !invoiceIdMissing && missingCustomerFields.length === 0;
  const invoiceRequirementsMessage = useMemo(() => {
    const pendingFields = [];

    if (invoiceIdMissing) {
      pendingFields.push("numero de factura");
    }

    if (missingCustomerFields.length > 0) {
      pendingFields.push(`datos del cliente (${formatFieldList(missingCustomerFields)})`);
    }

    if (pendingFields.length === 0) {
      return "";
    }

    return `Completa ${formatFieldList(pendingFields)} para habilitar la factura.`;
  }, [invoiceIdMissing, missingCustomerFields]);

  function updateInvoiceField<K extends keyof InvoiceRecord>(field: K, value: InvoiceRecord[K]) {
    setInvoice((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateItem(
    index: number,
    key: keyof InvoiceItem,
    value: string | number | undefined
  ) {
    setInvoice((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    }));
  }

  function addItem() {
    setInvoice((current) => ({
      ...current,
      items: [...current.items, { description: "", quantity: 1, unitPrice: 0 }]
    }));
  }

  function removeItem(index: number) {
    setInvoice((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function buildInvoicePayload() {
    const normalizedInvoice = {
      ...invoice,
      id: invoice.id.trim(),
      customerName: invoice.customerName.trim(),
      customerDocument: (invoice.customerDocument || "").trim(),
      customerPhone: (invoice.customerPhone || "").trim(),
      customerEmail: (invoice.customerEmail || "").trim(),
      paymentMethod: (invoice.paymentMethod || "").trim() || "Efectivo",
      notes: (invoice.notes || "").trim()
    };
    const pendingCustomerFields = getMissingCustomerFields(normalizedInvoice);

    if (!normalizedInvoice.id) {
      setStatusMessage("Ingresa un numero de factura antes de guardar o imprimir.");
      return null;
    }

    if (pendingCustomerFields.length > 0) {
      setStatusMessage(
        `Completa todos los datos del cliente: ${formatFieldList(pendingCustomerFields)}.`
      );
      return null;
    }

    const items = computedInvoice.items.filter(
      (item) => item.description.trim() !== "" && Number(item.quantity) > 0
    );

    if (items.length === 0) {
      setStatusMessage("Agrega al menos un producto valido antes de guardar o imprimir.");
      return null;
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    );
    const tax = Math.round(subtotal * 0.19);
    const total = subtotal + tax;

    return {
      ...normalizedInvoice,
      items,
      status: "Impresa" as const,
      subtotal,
      tax,
      total
    };
  }

  async function saveProfile() {
    try {
      const payload = normalizeCompanyProfile(companyProfile);
      const result = await window.invoiceApp.saveCompanyProfile(payload);
      setCompanyProfile(normalizeCompanyProfile(result));
      setStatusMessage("Perfil de empresa guardado.");
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "No se pudo guardar el perfil de empresa."
      );
    }
  }

  async function printAndSaveInvoice() {
    const payload = buildInvoicePayload();

    if (!payload) {
      return;
    }

    setPrintingInvoice(true);

    try {
      const printResult = await window.invoiceApp.printInvoice({
        invoice: payload,
        companyProfile
      });

      setLastPrintPreview(printResult.preview);

      const storedInvoice = await window.invoiceApp.saveInvoice(payload);
      setSavedInvoices((current) => [
        storedInvoice,
        ...current.filter((item) => item.id !== storedInvoice.id)
      ]);
      setInvoice(buildNextInvoiceDraft(payload));
      setStatusMessage(`${printResult.message} Factura ${storedInvoice.id} guardada. Lista para la siguiente.`);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error
          ? `${error.message} Revisa AppData\\Roaming\\lamontanita-invoicer\\main.log.`
          : "No se pudo imprimir la factura."
      );
    } finally {
      setPrintingInvoice(false);
    }
  }

  async function handlePrintPreview() {
    const payload = buildInvoicePayload();

    if (!payload) {
      return;
    }

    try {
      const result = await window.invoiceApp.previewInvoice({
        invoice: payload,
        companyProfile
      });

      setLastPrintPreview(result.preview);
      setStatusMessage(result.message);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "No se pudo generar la vista previa."
      );
    }
  }

  async function deleteInvoice(invoiceId: string) {
    const confirmed = window.confirm(`Se eliminara la factura ${invoiceId} de la base de datos. Deseas continuar?`);

    if (!confirmed) {
      return;
    }

    setDeletingInvoiceId(invoiceId);

    try {
      await window.invoiceApp.deleteInvoice(invoiceId);
      setSavedInvoices((current) => current.filter((item) => item.id !== invoiceId));
      setStatusMessage(`La factura ${invoiceId} fue eliminada.`);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "No se pudo eliminar la factura en PostgreSQL."
      );
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todaysInvoices = savedInvoices.filter((entry) =>
      entry.createdAt ? entry.createdAt.slice(0, 10) === today : false
    );

    const revenue = todaysInvoices.reduce((sum, entry) => sum + entry.total, 0);

    return {
      invoiceCount: savedInvoices.length,
      todaysInvoices: todaysInvoices.length,
      revenue
    };
  }, [savedInvoices]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50 font-body text-ink">
        <div className="rounded-3xl border border-brand-200 bg-white px-8 py-6 shadow-soft">
          Cargando espacio de facturacion...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 bg-paper-grid bg-[size:36px_36px] font-body text-ink">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-5 md:px-6 xl:px-8">
        <header className="overflow-hidden rounded-[32px] bg-gradient-to-r from-[#d8b44a] via-[#8aa34b] to-[#24523f] px-6 py-8 text-brand-50 shadow-soft">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white/30 bg-white/15 shadow-lg backdrop-blur-sm md:h-24 md:w-24">
                <img
                  alt="Logo de La Montanita"
                  className="h-full w-full object-cover"
                  src={companyProfile.logoUrl || defaultCompanyProfile.logoUrl}
                />
              </div>
              <div className="max-w-3xl">
              <h1 className="font-display text-4xl leading-tight md:text-5xl">
                <span className="block">Generacion de Facturas</span>
                <span className="block">La Montañita</span>
              </h1>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <MetricCard icon={<ReceiptText size={18} />} label="Facturas guardadas" value={String(stats.invoiceCount)} />
              <MetricCard icon={<FileClock size={18} />} label="Hoy" value={String(stats.todaysInvoices)} />
              <MetricCard
                icon={<BadgeDollarSign size={18} />}
                label="Ingresos"
                value={money(stats.revenue, companyProfile.currency || "COP")}
              />
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-soft">
          {statusMessage}
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="grid gap-6">
            <div className="rounded-[28px] border border-brand-200 bg-white p-6 shadow-soft">
              <SectionHeader
                icon={<ShoppingBasket size={18} />}
                title="Constructor de facturas"
                subtitle="Captura datos del cliente, agrega productos y prepara el ticket."
              />

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field
                  label="Numero de factura"
                  placeholder="Ej. FAC-1001"
                  value={invoice.id}
                  onChange={(value) => updateInvoiceField("id", value)}
                />
                <Field
                  label="Metodo de pago"
                  value={invoice.paymentMethod || ""}
                  onChange={(value) => updateInvoiceField("paymentMethod", value)}
                />
                <Field
                  label="Nombre del cliente"
                  placeholder="Obligatorio"
                  value={invoice.customerName}
                  onChange={(value) => updateInvoiceField("customerName", value)}
                />
                <Field
                  label="Documento del cliente"
                  placeholder="Opcional"
                  value={invoice.customerDocument || ""}
                  onChange={(value) => updateInvoiceField("customerDocument", value)}
                />
                <Field
                  label="Telefono del cliente"
                  placeholder="Opcional"
                  value={invoice.customerPhone || ""}
                  onChange={(value) => updateInvoiceField("customerPhone", value)}
                />
                <Field
                  label="Correo del cliente"
                  placeholder="Opcional"
                  value={invoice.customerEmail || ""}
                  onChange={(value) => updateInvoiceField("customerEmail", value)}
                />
              </div>

              {invoiceRequirementsMessage ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {invoiceRequirementsMessage}
                </div>
              ) : null}

              <div className="mt-6 rounded-[24px] border border-brand-100 bg-brand-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-xl text-brand-800">Productos</h3>
                  <button
                    className="rounded-full bg-pine px-4 py-2 text-sm text-brand-50 transition hover:bg-[#163327]"
                    onClick={addItem}
                    type="button"
                  >
                    Agregar producto
                  </button>
                </div>
                <div className="space-y-3">
                  {invoice.items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-brand-200 bg-white px-4 py-5 text-sm text-stone-500">
                      No hay productos agregados todavia.
                    </div>
                  ) : (
                    invoice.items.map((item, index) => (
                      <div
                        className="grid gap-3 rounded-2xl border border-brand-100 bg-white p-3 md:grid-cols-[1.6fr_0.55fr_0.75fr_0.75fr_auto]"
                        key={index}
                      >
                        <Field
                          label="Descripcion"
                          value={item.description}
                          onChange={(value) => updateItem(index, "description", value)}
                        />
                        <Field
                          label="Cant."
                          type="number"
                          value={String(item.quantity)}
                          onChange={(value) => updateItem(index, "quantity", Number(value))}
                        />
                        <Field
                          label="Precio unitario"
                          type="number"
                          value={String(item.unitPrice)}
                          onChange={(value) => updateItem(index, "unitPrice", Number(value))}
                        />
                        <Field
                          label="Peso (g)"
                          placeholder="Opcional"
                          type="number"
                          value={item.weightGrams ? String(item.weightGrams) : ""}
                          onChange={(value) =>
                            updateItem(
                              index,
                              "weightGrams",
                              value.trim() === "" ? undefined : Number(value)
                            )
                          }
                        />
                        <button
                          className="inline-flex items-center justify-center gap-2 self-end rounded-full border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 transition hover:bg-red-100"
                          onClick={() => removeItem(index)}
                          type="button"
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-[24px] bg-ink px-5 py-4 text-brand-50 md:flex-row md:items-center md:justify-between">
                <div className="grid gap-2 text-sm">
                  <span>Subtotal: {money(computedInvoice.subtotal, companyProfile.currency || "COP")}</span>
                  <span>Impuesto (IVA 19%): {money(computedInvoice.tax, companyProfile.currency || "COP")}</span>
                  <strong className="text-xl">Total: {money(computedInvoice.total, companyProfile.currency || "COP")}</strong>
                </div>
                <div className="flex flex-wrap gap-3">
                  <ActionButton
                    disabled={!canUseInvoiceActions}
                    icon={<Eye size={16} />}
                    onClick={handlePrintPreview}
                    text="Vista previa ticket"
                  />
                  <ActionButton
                    disabled={printingInvoice || !canUseInvoiceActions}
                    icon={<Printer size={16} />}
                    onClick={printAndSaveInvoice}
                    text={printingInvoice ? "Imprimiendo..." : "Generar factura"}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-brand-200 bg-white p-6 shadow-soft">
              <SectionHeader
                icon={<ScrollText size={18} />}
                title="Facturas recientes"
                subtitle="Ultimas facturas guardadas en la base de datos."
              />
              <div className="mt-5 space-y-3">
                {savedInvoices.map((entry) => (
                  <div
                    className="grid gap-3 rounded-2xl border border-brand-100 px-4 py-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
                    key={entry.id}
                  >
                    <div>
                      <p className="font-semibold text-brand-800">{entry.id}</p>
                      <p className="text-sm text-stone-500">{entry.customerName}</p>
                    </div>
                    <div className="text-sm text-stone-600">
                      {entry.customerDocument ? <p>{entry.customerDocument}</p> : null}
                      {entry.customerPhone ? <p>{entry.customerPhone}</p> : null}
                      {entry.customerEmail ? <p className="break-words">{entry.customerEmail}</p> : null}
                      <p>{entry.createdAt ? format(new Date(entry.createdAt), "PPp") : "Fecha pendiente"}</p>
                    </div>
                    <div className="text-sm text-stone-600">
                      <p>{entry.items.length} productos</p>
                      <p className="break-words">
                        {entry.items.map((item) => `${item.quantity} x ${item.description}`).join(", ")}
                      </p>
                      <p>{money(entry.total, companyProfile.currency || "COP")}</p>
                    </div>
                    <div className="self-center rounded-full bg-brand-100 px-3 py-1 text-center text-sm text-brand-800">
                      {entry.status}
                    </div>
                    <button
                      className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingInvoiceId === entry.id}
                      onClick={() => deleteInvoice(entry.id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                      {deletingInvoiceId === entry.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6">
            <div className="rounded-[28px] border border-brand-200 bg-white p-6 shadow-soft">
              <SectionHeader
                icon={<Building2 size={18} />}
                title="Perfil de la empresa"
                subtitle="Espacio para los datos base de tu empresa, marca e impresora."
              />
              <div className="mt-6 grid gap-4">
                <Field
                  label="Nombre del negocio"
                  value={companyProfile.businessName}
                  onChange={(value) => setCompanyProfile((current) => ({ ...current, businessName: value }))}
                />
                <Field
                  label="Direccion"
                  value={companyProfile.address}
                  onChange={(value) => setCompanyProfile((current) => ({ ...current, address: value }))}
                />
                <Field
                  label="Telefono"
                  value={companyProfile.phone}
                  onChange={(value) => setCompanyProfile((current) => ({ ...current, phone: value }))}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="URL del logo"
                    value={companyProfile.logoUrl}
                    onChange={(value) => setCompanyProfile((current) => ({ ...current, logoUrl: value }))}
                  />
                  <Field
                    label="Nombre de la impresora termica"
                    value={companyProfile.printerName}
                    onChange={(value) => setCompanyProfile((current) => ({ ...current, printerName: value }))}
                  />
                </div>
                <Field
                  label="Mensaje de pie de pagina"
                  value={companyProfile.footerMessage}
                  onChange={(value) => setCompanyProfile((current) => ({ ...current, footerMessage: value }))}
                />
                <button
                  className="rounded-2xl bg-pine px-5 py-3 font-medium text-brand-50 transition hover:bg-[#163327]"
                  onClick={saveProfile}
                  type="button"
                >
                  Guardar perfil de empresa
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-brand-200 bg-white p-6 shadow-soft">
              <SectionHeader
                icon={<Printer size={18} />}
                title="Vista previa del ticket termico"
                subtitle="Aqui se muestra el texto que se enviaria a la impresora de recibos."
              />
              <div className="mt-5 rounded-[24px] bg-stone-950 p-5 text-sm leading-6 text-emerald-300">
                <pre className="whitespace-pre-wrap font-mono">
                  {lastPrintPreview || "Genera una vista previa para revisar el formato del recibo."}
                </pre>
              </div>
            </div>

          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="mb-2 text-brand-100">{icon}</div>
      <p className="text-xs uppercase tracking-[0.18em] text-brand-100">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-brand-100 p-3 text-brand-700">{icon}</div>
      <div>
        <h2 className="font-display text-2xl text-brand-900">{title}</h2>
        <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
      </div>
    </div>
  );
}

function ActionButton({
  disabled = false,
  icon,
  onClick,
  text
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  text: string;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm text-brand-50 transition hover:bg-[#163327] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {text}
    </button>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        className="w-full min-w-0 max-w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

export default App;
