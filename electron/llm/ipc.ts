import { ipcMain, type BrowserWindow } from "electron";
import { join } from "node:path";
import { promises as fsp, statSync, accessSync, constants as fsConstants } from "node:fs";
import { CATALOG, findEntry, toPublic } from "./models";
import { Downloader } from "./downloader";
import { LlmManager } from "./manager";
import type {
  DownloadProgress,
  GenerateOptions,
  LlmStatus,
  PublicModelEntry,
  StreamEndEvent,
  StreamTokenEvent,
} from "../../src/llm/types";

export type LlmPersistence = {
  getActiveModelId(): string | undefined;
  getEnabled(): boolean;
  getModelsDir(): string | null;
  setActiveModelId(id: string | undefined): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  setModelsDir(dir: string | null): Promise<void>;
};

export function resolveModelsDir(custom: string | null | undefined, userDataDir: string): string {
  return custom && custom.length > 0 ? custom : join(userDataDir, "models");
}

type GetWin = () => BrowserWindow | null;

export class LlmIpc {
  private readonly downloader: Downloader;
  private readonly manager: LlmManager;
  private readonly emitProgress: (p: DownloadProgress) => void;
  private registered = false;

  constructor(
    private readonly getWin: GetWin,
    private readonly userDataDir: string,
    private readonly persist: LlmPersistence,
  ) {
    const modelsDir = resolveModelsDir(this.persist.getModelsDir(), userDataDir);
    this.emitProgress = (p) => this.send("llm:download-progress", p);
    this.downloader = new Downloader(modelsDir, this.emitProgress);
    this.manager = new LlmManager();

    this.manager.onStatus((s) => this.send("llm:status-changed", s));
    this.manager.setEnabled(this.persist.getEnabled());
    this.manager.setDesired(this.persist.getActiveModelId());
  }

  private currentModelsDir(): string {
    return resolveModelsDir(this.persist.getModelsDir(), this.userDataDir);
  }

  private async updateModelsDir(dir: string): Promise<void> {
    this.downloader.setDir(dir);
    await this.manager.unloadModel();
    const activeId = this.persist.getActiveModelId();
    if (activeId && !(await this.downloader.exists(activeId))) {
      this.manager.setDesired(undefined);
      await this.persist.setActiveModelId(undefined);
    }
    this.send("llm:status-changed", this.manager.getStatus());
  }

  async initialActiveLoad(): Promise<void> {
    const id = this.persist.getActiveModelId();
    if (!id) return;
    const entry = findEntry(id);
    if (!entry) return;
    if (!(await this.downloader.exists(id))) return;
    try {
      await this.manager.loadModel(id, this.downloader.modelPath(id));
    } catch (err) {
      console.error("[llm] initial load failed", err);
    }
  }

  async shutdown(): Promise<void> {
    this.manager.cancelAll();
    await this.manager.unloadModel();
  }

  private send(channel: string, payload: unknown): void {
    const w = this.getWin();
    if (!w || w.isDestroyed()) return;
    w.webContents.send(channel, payload);
  }

  register(): void {
    if (this.registered) return;
    this.registered = true;

    ipcMain.handle("llm:list", async (): Promise<PublicModelEntry[]> => {
      const ids = CATALOG.map((m) => m.id);
      const downloaded = await this.downloader.listDownloaded(ids);
      return CATALOG.map((m) => toPublic(m, downloaded.has(m.id)));
    });

    ipcMain.handle("llm:status", async (): Promise<LlmStatus> => this.manager.getStatus());

    ipcMain.handle("llm:download", async (_e, id: string) => {
      const entry = findEntry(id);
      if (!entry) throw new Error(`unknown model: ${id}`);
      if (entry.comingSoon) throw new Error(`${entry.displayName} is not yet available`);
      const handle = this.downloader.start(entry);
      handle.promise.catch((err) => {
        if (isAbort(err)) return;
        console.error("[llm] download failed", err);
      });
      return { ok: true };
    });

    ipcMain.handle("llm:cancel-download", async (_e, id: string) => {
      this.downloader.cancel(id);
    });

    ipcMain.handle("llm:delete", async (_e, id: string) => {
      const active = this.manager.getStatus().activeModelId;
      if (active === id) {
        this.manager.setDesired(undefined);
        await this.manager.unloadModel();
        await this.persist.setActiveModelId(undefined);
      }
      await this.downloader.remove(id);
    });

    ipcMain.handle("llm:set-active", async (_e, id: string | null) => {
      if (!id) {
        this.manager.setDesired(undefined);
        await this.manager.unloadModel();
        await this.persist.setActiveModelId(undefined);
        return;
      }
      const entry = findEntry(id);
      if (!entry) throw new Error(`unknown model: ${id}`);
      if (entry.comingSoon) throw new Error(`${entry.displayName} is not yet available`);
      if (!(await this.downloader.exists(id))) {
        throw new Error(`model not downloaded: ${id}`);
      }
      this.manager.setDesired(id);
      await this.persist.setActiveModelId(id);
      await this.manager.loadModel(id, this.downloader.modelPath(id));
    });

    ipcMain.handle("llm:set-enabled", async (_e, enabled: boolean) => {
      this.manager.setEnabled(enabled);
      await this.persist.setEnabled(enabled);
    });

    ipcMain.handle("llm:generate", async (_e, payload: { requestId: string; prompt: string; options: GenerateOptions }) => {
      const text = await this.manager.generate({
        requestId: payload.requestId,
        prompt: payload.prompt,
        options: payload.options ?? {},
        stream: false,
      });
      return { text };
    });

    ipcMain.handle("llm:stream", async (_e, payload: { requestId: string; prompt: string; options: GenerateOptions }) => {
      const { requestId, prompt, options } = payload;
      this.manager
        .generate({
          requestId,
          prompt,
          options: options ?? {},
          stream: true,
          onToken: (token) => {
            this.send("llm:token", { requestId, token } satisfies StreamTokenEvent);
          },
        })
        .then((text) => {
          this.send("llm:end", { requestId, reason: "done", text } satisfies StreamEndEvent);
        })
        .catch((err: unknown) => {
          if (isAbort(err)) {
            this.send("llm:end", { requestId, reason: "cancelled" } satisfies StreamEndEvent);
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          this.send("llm:end", { requestId, reason: "error", error: msg } satisfies StreamEndEvent);
        });
      return { ok: true };
    });

    ipcMain.handle("llm:cancel", async (_e, requestId: string) => {
      this.manager.cancel(requestId);
    });

    ipcMain.handle("llm:get-models-dir", async (): Promise<string> => this.currentModelsDir());

    ipcMain.handle(
      "llm:set-models-dir",
      async (_e, payload: { dir: string }): Promise<{ ok: boolean; error?: string }> => {
        const dir = typeof payload?.dir === "string" ? payload.dir.trim() : "";
        if (!dir) return { ok: false, error: "empty path" };
        try {
          const s = statSync(dir);
          if (!s.isDirectory()) return { ok: false, error: "not a directory" };
          accessSync(dir, fsConstants.W_OK);
          await fsp.mkdir(dir, { recursive: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: msg };
        }
        await this.persist.setModelsDir(dir);
        await this.updateModelsDir(dir);
        return { ok: true };
      },
    );
  }
}

function isAbort(err: unknown): boolean {
  if (err instanceof Error) return err.name === "AbortError" || /abort/i.test(err.message);
  return false;
}
