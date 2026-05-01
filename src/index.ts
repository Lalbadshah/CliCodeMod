import { TerminalBus } from "./bus";
import { ModHost, modVoicePrompt } from "./mods/registry";
import type { ModId } from "./mods/types";
import { openPicker } from "./picker";
import { startMockReplay } from "./devtools/mock-replay";
import { mountToolDebugOverlay } from "./devtools/tool-debug-overlay";
import { renderSettingsDialog } from "./settings-dialog";
import type { AppSettings, StatusEvent } from "./types/events";
import { LlmClient, type LlmBridge } from "./llm/client";
import { detectProfile } from "./profiles/registry";
import { mountUpdateBanner } from "./update-banner";

declare global {
  interface Window {
    cli: {
      getSettings(): Promise<AppSettings | null>;
      saveSettings(s: Partial<AppSettings>): Promise<void>;
      pickDirectory(): Promise<string | null>;
      start(geom?: { cols: number; rows: number }): Promise<{ ok: boolean; pid?: number; error?: string }>;
      stop(): Promise<void>;
      send(data: string): Promise<void>;
      resize(cols: number, rows: number): Promise<void>;
      isMock(): Promise<boolean>;
      setModVoice?(voice: string | null): void;
      onData(cb: (data: string) => void): () => void;
      onStatus(cb: (s: StatusEvent) => void): () => void;
      onMenuCommand?(cb: (command: string) => void): () => void;
      llm?: LlmBridge;
      update?: {
        snapshot(): Promise<unknown>;
        install(): Promise<void>;
        dismiss(version: string): void;
        openRelease(): void;
        onReady(cb: (payload: unknown) => void): () => void;
      };
    };
  }
}

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");

const cli = (window as unknown as { cli?: Window["cli"] }).cli;
if (!cli) throw new Error("preload bridge missing");

void boot(root, cli);

async function boot(host: HTMLElement, cli: Window["cli"]): Promise<void> {
  const bus = new TerminalBus();
  bus.setSender((data) => cli.send(data));
  bus.setResizer((cols, rows) => {
    void cli.resize(cols, rows);
  });
  cli.onData((data) => bus.write(data));
  cli.onStatus((s) => {
    if (s.kind === "spawn_ok") bus.meta.pid = s.pid;
    if (s.kind === "exit") bus.meta.pid = null;
  });
  bus.setLlm(new LlmClient(cli.llm));

  mountUpdateBanner(cli.update);

  const modRoot = document.createElement("div");
  modRoot.id = "mod-root";
  modRoot.style.cssText = "height:100vh;width:100vw;";
  host.append(modRoot);
  const modHost = new ModHost(modRoot, bus);

  const isMock = await safeIsMock(cli);
  bus.meta.isMock = isMock;
  if (isMock) {
    bus.meta.pid = 4097;
    bus.meta.binary = "claude";
  }
  let settings: AppSettings | null = await cli.getSettings();

  if (!isMock && !settings) {
    settings = await new Promise<AppSettings>((resolve) => {
      renderSettingsDialog(host, cli, async (s) => {
        await cli.saveSettings(s);
        const fresh = await cli.getSettings();
        resolve(fresh ?? { binary: s.binary ?? "claude", cwd: s.cwd ?? "" });
      });
    });
  }

  if (settings) {
    bus.meta.binary = settings.binary;
    bus.meta.cwd = settings.cwd;
  }

  bus.setProfile(detectProfile(bus.meta.binary));

  mountToolDebugOverlay(bus);

  let activeId: ModId | null = settings?.selectedMod ?? null;
  let agentSpawned = false;

  const applyModVoice = (id: ModId): void => {
    const voice = modVoicePrompt(id);
    cli.setModVoice?.(voice);
    if (agentSpawned && !isMock) {
      showToast(voice ? "Mod voice applies on next restart (⌘R)" : "Mod voice cleared on next restart (⌘R)");
    }
  };

  const swapMod = (id: ModId): void => {
    modHost.load(id);
    applyModVoice(id);
  };

  const showSettings = () => {
    renderSettingsDialog(
      host,
      cli,
      async (s) => {
        await cli.saveSettings(s);
        const fresh = await cli.getSettings();
        if (fresh) {
          settings = fresh;
          bus.meta.binary = fresh.binary;
          bus.meta.cwd = fresh.cwd;
          bus.setProfile(detectProfile(fresh.binary));
        }
      },
      settings ?? undefined,
      () => {},
    );
  };

  const showPicker = (closable: boolean) => {
    openPicker(host, {
      activeId,
      closable,
      onPick: async (id) => {
        activeId = id;
        swapMod(id);
        await persistSelection(id);
      },
      onOpenSettings: () => showSettings(),
    });
  };

  if (activeId) {
    swapMod(activeId);
  } else {
    showPicker(false);
  }

  if (isMock) {
    startMockReplay(bus, true);
    agentSpawned = true;
  } else {
    await cli.start({ cols: 120, rows: 32 });
    agentSpawned = true;
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "," && !e.shiftKey) {
      e.preventDefault();
      showPicker(true);
    } else if (e.key === ";" && !e.shiftKey) {
      e.preventDefault();
      showSettings();
    } else if (e.shiftKey && (e.key === "M" || e.key === "m")) {
      e.preventDefault();
      const next = modHost.cycleNext();
      activeId = next;
      applyModVoice(next);
      void persistSelection(next);
    }
  });

  cli.onMenuCommand?.((command) => {
    if (command === "open-picker") {
      showPicker(true);
      return;
    }
    if (command === "open-settings") {
      showSettings();
      return;
    }
    if (command === "cycle-mod") {
      const next = modHost.cycleNext();
      activeId = next;
      applyModVoice(next);
      void persistSelection(next);
      return;
    }
    if (command === "clear") {
      bus.clear();
      void cli.send("\x0c");
      return;
    }
    if (command === "reload-session") {
      bus.clear();
      modHost.reload();
      return;
    }
    if (command.startsWith("set-mod:")) {
      const id = command.slice("set-mod:".length) as ModId;
      activeId = id;
      swapMod(id);
      void persistSelection(id);
    }
  });

  async function persistSelection(id: ModId): Promise<void> {
    const current = (await cli.getSettings()) ?? settings;
    if (!current) return;
    const updated: AppSettings = { ...current, selectedMod: id };
    settings = updated;
    await cli.saveSettings(updated);
  }
}

async function safeIsMock(cli: Window["cli"]): Promise<boolean> {
  try {
    return await cli.isMock();
  } catch {
    return false;
  }
}

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

function showToast(message: string): void {
  if (!toastEl) {
    const el = document.createElement("div");
    el.setAttribute("data-app-toast", "");
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:24px",
      "transform:translate(-50%, 12px)",
      "padding:10px 18px",
      "background:rgba(18,18,22,0.92)",
      "color:#f3ecd8",
      "font:500 12px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif",
      "letter-spacing:0.04em",
      "border:1px solid rgba(255,255,255,0.12)",
      "border-radius:10px",
      "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
      "pointer-events:none",
      "z-index:2000",
      "opacity:0",
      "transition:opacity 180ms ease, transform 180ms ease",
    ].join(";");
    document.body.append(el);
    toastEl = el;
  }
  toastEl.textContent = message;
  void toastEl.offsetWidth;
  toastEl.style.opacity = "1";
  toastEl.style.transform = "translate(-50%, 0)";
  if (toastTimer != null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (!toastEl) return;
    toastEl.style.opacity = "0";
    toastEl.style.transform = "translate(-50%, 12px)";
  }, 2400);
}
