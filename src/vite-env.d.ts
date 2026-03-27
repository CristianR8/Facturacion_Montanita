/// <reference types="vite/client" />

type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  weightGrams?: number;
};

type InvoiceRecord = {
  id: string;
  customerName: string;
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod?: string;
  notes?: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  createdAt?: string;
  items: InvoiceItem[];
};

type CompanyProfile = {
  businessName: string;
  address: string;
  phone: string;
  logoUrl: string;
  footerMessage: string;
  printerName: string;
  currency: string;
};

type BootstrapPayload = {
  mode: "demo" | "postgres";
  companyProfile: CompanyProfile;
  invoices: InvoiceRecord[];
};

type PrintResult = {
  ok: boolean;
  mode: string;
  printerName: string;
  preview: string;
  message: string;
};

interface Window {
  invoiceApp: {
    bootstrap: () => Promise<BootstrapPayload>;
    saveInvoice: (payload: InvoiceRecord) => Promise<InvoiceRecord>;
    deleteInvoice: (invoiceId: string) => Promise<{ ok: boolean }>;
    saveCompanyProfile: (payload: CompanyProfile) => Promise<CompanyProfile>;
    previewInvoice: (payload: {
      invoice: InvoiceRecord;
      companyProfile: CompanyProfile;
    }) => Promise<PrintResult>;
    printInvoice: (payload: {
      invoice: InvoiceRecord;
      companyProfile: CompanyProfile;
    }) => Promise<PrintResult>;
  };
}
