import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, StatusEvent } from "../src/types/events";
import type {
  DownloadProgress,
  GenerateOptions,
  LlmStatus,
  PublicModelEntry,
  StreamEndEvent,
  StreamTokenEvent,
} from "../src/llm/types";

const llm = {
  list: (): Promise<PublicModelEntry[]> => ipcRenderer.invoke("llm:list"),
  status: (): Promise<LlmStatus> => ipcRenderer.invoke("llm:status"),
  download: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke("llm:download", id),
  cancelDownload: (id: string): Promise<void> => ipcRenderer.invoke("llm:cancel-download", id),
  delete: (id: string): Promise<void> => ipcRenderer.invoke("llm:delete", id),
  setActive: (id: string | null): Promise<void> => ipcRenderer.invoke("llm:set-active", id),
  setEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke("llm:set-enabled", enabled),
  generate: (requestId: string, prompt: string, options: GenerateOptions): Promise<{ text: string }> =>
    ipcRenderer.invoke("llm:generate", { requestId, prompt, options }),
  stream: (requestId: string, prompt: string, options: GenerateOptions): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("llm:stream", { requestId, prompt, options }),
  cancel: (requestId: string): Promise<void> => ipcRenderer.invoke("llm:cancel", requestId),
  getModelsDir: (): Promise<string> => ipcRenderer.invoke("llm:get-models-dir"),
  setModelsDir: (dir: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("llm:set-models-dir", { dir }),

  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void {
    const listener = (_: unknown, p: DownloadProgress) => cb(p);
    ipcRenderer.on("llm:download-progress", listener);
    return () => ipcRenderer.removeListener("llm:download-progress", listener);
  },
  onStatusChanged(cb: (s: LlmStatus) => void): () => void {
    const listener = (_: unknown, s: LlmStatus) => cb(s);
    ipcRenderer.on("llm:status-changed", listener);
    return () => ipcRenderer.removeListener("llm:status-changed", listener);
  },
  onToken(cb: (e: StreamTokenEvent) => void): () => void {
    const listener = (_: unknown, e: StreamTokenEvent) => cb(e);
    ipcRenderer.on("llm:token", listener);
    return () => ipcRenderer.removeListener("llm:token", listener);
  },
  onEnd(cb: (e: StreamEndEvent) => void): () => void {
    const listener = (_: unknown, e: StreamEndEvent) => cb(e);
    ipcRenderer.on("llm:end", listener);
    return () => ipcRenderer.removeListener("llm:end", listener);
  },
};

const api = {
  getSettings: (): Promise<AppSettings | null> => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: AppSettings): Promise<void> => ipcRenderer.invoke("settings:set", s),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pick-dir"),

  start: (geom?: { cols: number; rows: number }): Promise<{ ok: boolean; pid?: number; error?: string }> =>
    ipcRenderer.invoke("agent:start", geom),
  stop: (): Promise<void> => ipcRenderer.invoke("agent:stop"),
  send: (data: string): Promise<void> => ipcRenderer.invoke("pty:write", data),
  resize: (cols: number, rows: number): Promise<void> => ipcRenderer.invoke("pty:resize", { cols, rows }),
  isMock: (): Promise<boolean> => ipcRenderer.invoke("agent:is-mock"),
  setModVoice: (voice: string | null): void => ipcRenderer.send("pty:set-mod-voice", voice),

  onData(cb: (data: string) => void): () => void {
    const listener = (_: unknown, data: string) => cb(data);
    ipcRenderer.on("pty:data", listener);
    return () => ipcRenderer.removeListener("pty:data", listener);
  },

  onStatus(cb: (status: StatusEvent) => void): () => void {
    const listener = (_: unknown, status: StatusEvent) => cb(status);
    ipcRenderer.on("agent:status", listener);
    return () => ipcRenderer.removeListener("agent:status", listener);
  },

  llm,

  onMenuCommand(cb: (command: string) => void): () => void {
    const channels = [
      "menu:open-picker",
      "menu:cycle-mod",
      "menu:clear",
      "menu:reload-session",
      "menu:set-mod:neon",
      "menu:set-mod:oracle",
      "menu:set-mod:editorial",
      "menu:set-mod:brainrot",
    ];
    const offs = channels.map((channel) => {
      const listener = () => cb(channel.replace(/^menu:/, ""));
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    });
    return () => offs.forEach((f) => f());
  },
};

contextBridge.exposeInMainWorld("cli", api);

export type CliApi = typeof api;
