const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain } = require("electron");
const {
  createInvoice,
  deleteInvoice,
  getBootstrapData,
  saveCompanyProfile
} = require("./database");
const { printInvoice, getPrintPreview } = require("./printer");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const logFile = path.join(app.getPath("userData"), "main.log");
let mainWindow = null;

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line, "utf8");
  } catch {
    // Ignore logging failures so the app can still boot.
  }
}

function loadEnv() {
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(process.resourcesPath || "", ".env"),
    path.join(app.getAppPath(), ".env")
  ];

  for (const envPath of candidates) {
    if (envPath && fs.existsSync(envPath)) {
      require("dotenv").config({ path: envPath, override: true });
      writeLog(`Loaded .env from ${envPath}`);
      return envPath;
    }
  }

  writeLog("No .env file found during startup.");
  return null;
}

loadEnv();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#f7f5ee",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`Renderer failed to load: ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeLog(`Renderer process gone: ${JSON.stringify(details)}`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    writeLog(`Loading dev URL ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    writeLog(`Loading file ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
  return mainWindow;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    return;
  }

  writeLog("App ready.");
  ipcMain.handle("app:bootstrap", async () => getBootstrapData());

  ipcMain.handle("company:save", async (_event, payload) => saveCompanyProfile(payload));

  ipcMain.handle("invoice:save", async (_event, payload) => createInvoice(payload));
  ipcMain.handle("invoice:delete", async (_event, invoiceId) => deleteInvoice(invoiceId));

  ipcMain.handle("invoice:print", async (_event, payload) =>
    printInvoice(payload.invoice, payload.companyProfile)
  );
  ipcMain.handle("invoice:preview", async (_event, payload) =>
    getPrintPreview(payload.invoice, payload.companyProfile)
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  writeLog("All windows closed.");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  writeLog(`uncaughtException: ${error.stack || error.message}`);
});

process.on("unhandledRejection", (reason) => {
  writeLog(`unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});
