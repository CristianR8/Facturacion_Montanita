const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { app, BrowserWindow, ipcMain } = require("electron");
const {
  createInvoice,
  deleteInvoice,
  getBootstrapData,
  saveCompanyProfile
} = require("./database");
const { printInvoice } = require("./printer");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#f7f5ee",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("app:bootstrap", async () => getBootstrapData());

  ipcMain.handle("company:save", async (_event, payload) => saveCompanyProfile(payload));

  ipcMain.handle("invoice:save", async (_event, payload) => createInvoice(payload));
  ipcMain.handle("invoice:delete", async (_event, invoiceId) => deleteInvoice(invoiceId));

  ipcMain.handle("invoice:print", async (_event, payload) =>
    printInvoice(payload.invoice, payload.companyProfile)
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
