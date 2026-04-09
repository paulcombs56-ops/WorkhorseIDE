const path = require("path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const Store = require("electron-store").default || require("electron-store");

const APP_WINDOW_TITLE = "Workhorse IDE";
const DEFAULT_PORT = 3001;

const appStore = new Store({
  name: "workhorse-config",
});

const secretStore = new Store({
  name: "workhorse-secrets",
  encryptionKey: "workhorse-local-secrets-v1",
});

function getBackendUrl() {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  return `http://localhost:${port}`;
}

async function chooseWorkspaceRoot() {
  const existing = String(appStore.get("workspaceRoot") || "").trim();
  if (existing) {
    return existing;
  }

  const result = await dialog.showOpenDialog({
    title: "Choose Workspace Folder",
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  const selected = String(result.filePaths[0] || "").trim();
  if (!selected) {
    return null;
  }

  appStore.set("workspaceRoot", selected);
  return selected;
}

function configureBackendEnvironment(workspaceRoot) {
  process.env.PORT = String(process.env.PORT || DEFAULT_PORT);
  process.env.WORKSPACE_ROOT = workspaceRoot;
  process.env.ENABLE_LEGACY_AI_PROXY = "false";
  process.env.ALLOWED_ORIGINS = "http://localhost:3001,http://127.0.0.1:3001";
}

async function startBackend(workspaceRoot) {
  configureBackendEnvironment(workspaceRoot);
  const { startServer } = require(path.resolve(__dirname, "..", "backend", "app.js"));
  await startServer(Number(process.env.PORT || DEFAULT_PORT));
}

function registerIpcHandlers() {
  ipcMain.handle("workhorse:get-secret", (_event, key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return "";
    }
    return String(secretStore.get(normalizedKey) || "");
  });

  ipcMain.handle("workhorse:set-secret", (_event, key, value) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return false;
    }

    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      secretStore.delete(normalizedKey);
      return true;
    }

    secretStore.set(normalizedKey, normalizedValue);
    return true;
  });

  ipcMain.handle("workhorse:pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Workspace Folder",
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return { changed: false, workspaceRoot: String(appStore.get("workspaceRoot") || "") };
    }

    const selected = String(result.filePaths[0] || "").trim();
    if (!selected) {
      return { changed: false, workspaceRoot: String(appStore.get("workspaceRoot") || "") };
    }

    const current = String(appStore.get("workspaceRoot") || "").trim();
    if (selected === current) {
      return { changed: false, workspaceRoot: current };
    }

    appStore.set("workspaceRoot", selected);
    app.relaunch();
    app.exit(0);
    return { changed: true, workspaceRoot: selected };
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: APP_WINDOW_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(getBackendUrl());
  return win;
}

async function bootstrap() {
  const workspaceRoot = await chooseWorkspaceRoot();
  if (!workspaceRoot) {
    app.quit();
    return;
  }

  registerIpcHandlers();
  await startBackend(workspaceRoot);
  createMainWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrap().catch((error) => {
      dialog.showErrorBox("Workhorse Startup Error", String(error?.message || error));
      app.quit();
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
