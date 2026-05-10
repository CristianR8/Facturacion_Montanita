/// <reference types="vite/client" />

type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  weightGrams?: number;
  priceByWeight?: boolean;
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

type ProductPreset = {
  id: number;
  description: string;
  unitPrice: number;
  priceByWeight: boolean;
};

type ProductPayload = {
  description: string;
  unitPrice: number;
  priceByWeight: boolean;
};

type BootstrapPayload = {
  mode: "demo" | "postgres";
  companyProfile: CompanyProfile;
  invoices: InvoiceRecord[];
  products: ProductPreset[];
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
    saveProduct: (payload: ProductPayload) => Promise<ProductPreset>;
    deleteProduct: (productId: number) => Promise<{ ok: boolean }>;
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
