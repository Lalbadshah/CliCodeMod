import { app, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import * as pty from "node-pty";
import { defaultSettings, loadSettings, patchSettings } from "./settings";
import type { AppSettings, StatusEvent } from "../src/types/events";
import { LlmIpc } from "./llm/ipc";
import { buildLaunchArgs } from "./shell-launch";
import { createUpdater, type Updater } from "./auto-update";

let win: BrowserWindow | null = null;
let ptyProc: pty.IPty | null = null;
let settings: AppSettings | null = null;
let currentModVoice: string | null = null;
let llmIpc: LlmIpc | null = null;
let updater: Updater | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const MOCK_MODE = process.env.CLI_MODS_MOCK === "1" || process.argv.includes("--mock");

function sendData(data: string): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("pty:data", data);
}

function status(s: StatusEvent): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("agent:status", s);
}

function stopPty(): Promise<void> {
  return new Promise((resolve) => {
    if (!ptyProc) return resolve();
    const p = ptyProc;
    ptyProc = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      p.onExit(() => finish());
    } catch {
      /* ignore */
    }
    try {
      p.kill();
    } catch {
      /* ignore */
    }
    setTimeout(finish, 1500);
  });
}

async function startPty(cols = 120, rows = 32): Promise<{ ok: boolean; pid?: number; error?: string }> {
  if (!settings) settings = (await loadSettings()) ?? defaultSettings();
  await stopPty();

  const binary = settings.binary;
  const cwd = settings.cwd;
  const baseArgs = settings.extraArgs ?? [];
  const { args, extraEnv } = buildLaunchArgs(binary, baseArgs, currentModVoice);

  let proc: pty.IPty;
  try {
    proc = pty.spawn(binary, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        ...extraEnv,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status({ kind: "spawn_error", message });
    sendData(`\r\n\x1b[31m[spawn failed] ${binary}: ${message}\x1b[0m\r\n`);
    return { ok: false, error: message };
  }

  ptyProc = proc;

  proc.onData((data) => sendData(data));
  proc.onExit(({ exitCode, signal }) => {
    status({ kind: "exit", code: exitCode ?? null, signal: (signal as unknown as NodeJS.Signals) ?? null });
    sendData(`\r\n\x1b[2m[process exited code=${exitCode ?? "-"} signal=${signal ?? "-"}]\x1b[0m\r\n`);
    if (ptyProc === proc) ptyProc = null;
  });

  status({ kind: "spawn_ok", pid: proc.pid ?? -1 });
  return { ok: true, pid: proc.pid };
}

function writePty(data: string): void {
  if (!ptyProc) return;
  try {
    ptyProc.write(data);
  } catch {
    /* ignore */
  }
}

function resizePty(cols: number, rows: number): void {
  if (!ptyProc) return;
  try {
    ptyProc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
  } catch {
    /* ignore */
  }
}

async function createWindow() {
  const bounds = settings?.windowBounds;
  win = new BrowserWindow({
    x: bounds?.x,
    y: bounds?.y,
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    backgroundColor: "#111",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const persistBounds = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized() || win.isFullScreen()) return;
    const b = win.getBounds();
    void patchSettings({ windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height } }).then((s) => {
      if (s) settings = s;
    });
  };
  let persistTimer: NodeJS.Timeout | null = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistBounds, 400);
  };
  win.on("resize", schedulePersist);
  win.on("move", schedulePersist);
  win.on("close", () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistBounds();
  });

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(__dirname, "..", "dist", "index.html"));
  }
}

function sendMenu(kind: string): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("menu:" + kind);
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "Cmd+;",
          click: () => sendMenu("open-settings"),
        },
        {
          label: "Mod Picker…",
          accelerator: "Cmd+,",
          click: () => sendMenu("open-picker"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      {
        label: "Clear Screen",
        accelerator: "CmdOrCtrl+K",
        click: () => sendMenu("clear"),
      },
    ],
  });

  template.push({
    label: "Session",
    submenu: [
      {
        label: "Reload Session",
        accelerator: "CmdOrCtrl+R",
        click: async () => {
          if (MOCK_MODE) {
            sendMenu("reload-session");
            return;
          }
          await stopPty();
          await startPty();
          sendMenu("reload-session");
        },
      },
      {
        label: "Stop Agent",
        accelerator: "CmdOrCtrl+.",
        click: async () => {
          if (!MOCK_MODE) await stopPty();
        },
      },
    ],
  });

  const modSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "Open Mod Picker",
      accelerator: isMac ? "Cmd+," : "Ctrl+,",
      click: () => sendMenu("open-picker"),
    },
  ];
  if (!isMac) {
    modSubmenu.push({
      label: "Settings…",
      accelerator: "Ctrl+;",
      click: () => sendMenu("open-settings"),
    });
  }
  modSubmenu.push(
    {
      label: "Cycle Next Mod",
      accelerator: "CmdOrCtrl+Shift+M",
      click: () => sendMenu("cycle-mod"),
    },
    { type: "separator" },
    { label: "Neon Shrine", click: () => sendMenu("set-mod:neon") },
    { label: "The Oracle", click: () => sendMenu("set-mod:oracle") },
    { label: "Editorial", click: () => sendMenu("set-mod:editorial") },
    { label: "Brainrot", click: () => sendMenu("set-mod:brainrot") },
  );
  template.push({ label: "Mod", submenu: modSubmenu });

  template.push({
    label: "View",
    submenu: [
      { role: "reload", accelerator: "CmdOrCtrl+Shift+R" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  settings = await loadSettings();

  llmIpc = new LlmIpc(
    () => win,
    app.getPath("userData"),
    {
      getActiveModelId: () => settings?.llm?.activeModelId,
      getEnabled: () => settings?.llm?.enabled ?? true,
      getModelsDir: () => settings?.llm?.modelsDir ?? null,
      setActiveModelId: async (id) => {
        const updated = await patchSettings({ llm: { activeModelId: id } });
        if (updated) settings = updated;
      },
      setEnabled: async (enabled) => {
        const updated = await patchSettings({ llm: { enabled } });
        if (updated) settings = updated;
      },
      setModelsDir: async (dir) => {
        const updated = await patchSettings({ llm: { modelsDir: dir ?? undefined } });
        if (updated) settings = updated;
      },
    },
  );
  llmIpc.register();

  ipcMain.handle("settings:get", async () => settings);
  ipcMain.handle("settings:set", async (_e, s: Partial<AppSettings>) => {
    const updated = await patchSettings(s);
    if (updated) settings = updated;
  });
  ipcMain.handle("dialog:pick-dir", async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("agent:start", async (_e, geom?: { cols?: number; rows?: number }) => {
    if (MOCK_MODE) return { ok: true, pid: -1 };
    return startPty(geom?.cols, geom?.rows);
  });
  ipcMain.handle("agent:stop", async () => {
    if (MOCK_MODE) return;
    await stopPty();
  });
  ipcMain.handle("pty:write", async (_e, data: string) => {
    if (MOCK_MODE) return;
    writePty(data);
  });
  ipcMain.handle("pty:resize", async (_e, geom: { cols: number; rows: number }) => {
    if (MOCK_MODE) return;
    resizePty(geom.cols, geom.rows);
  });
  ipcMain.handle("agent:is-mock", async () => MOCK_MODE);
  ipcMain.on("pty:set-mod-voice", (_e, voice: string | null) => {
    currentModVoice = voice && voice.length > 0 ? voice : null;
  });

  buildMenu();
  await createWindow();

  if (win) {
    updater = createUpdater(win);
    updater.start();
  }

  void llmIpc?.initialActiveLoad();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", async () => {
  await stopPty();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (e) => {
  if (updater) {
    updater.stop();
    updater = null;
  }
  if (llmIpc) {
    await llmIpc.shutdown();
    llmIpc = null;
  }
  if (ptyProc) {
    e.preventDefault();
    await stopPty();
    app.quit();
  }
});
