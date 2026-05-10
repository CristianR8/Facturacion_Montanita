const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("invoiceApp", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveInvoice: (payload) => ipcRenderer.invoke("invoice:save", payload),
  deleteInvoice: (invoiceId) => ipcRenderer.invoke("invoice:delete", invoiceId),
  saveCompanyProfile: (payload) => ipcRenderer.invoke("company:save", payload),
  saveProduct: (payload) => ipcRenderer.invoke("product:save", payload),
  deleteProduct: (productId) => ipcRenderer.invoke("product:delete", productId),
  previewInvoice: (payload) => ipcRenderer.invoke("invoice:preview", payload),
  printInvoice: (payload) => ipcRenderer.invoke("invoice:print", payload)
});
