const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("invoiceApp", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveInvoice: (payload) => ipcRenderer.invoke("invoice:save", payload),
  deleteInvoice: (invoiceId) => ipcRenderer.invoke("invoice:delete", invoiceId),
  saveCompanyProfile: (payload) => ipcRenderer.invoke("company:save", payload),
  printInvoice: (payload) => ipcRenderer.invoke("invoice:print", payload)
});
