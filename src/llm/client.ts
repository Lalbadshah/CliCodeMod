import type {
  DownloadProgress,
  GenerateOptions,
  LlmStatus,
  PublicModelEntry,
  StreamEndEvent,
  StreamTokenEvent,
} from "./types";

export type LlmBridge = {
  list(): Promise<PublicModelEntry[]>;
  status(): Promise<LlmStatus>;
  download(id: string): Promise<{ ok: boolean }>;
  cancelDownload(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  setActive(id: string | null): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  generate(requestId: string, prompt: string, options: GenerateOptions): Promise<{ text: string }>;
  stream(requestId: string, prompt: string, options: GenerateOptions): Promise<{ ok: boolean }>;
  cancel(requestId: string): Promise<void>;
  getModelsDir(): Promise<string>;
  setModelsDir(dir: string): Promise<{ ok: boolean; error?: string }>;
  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void;
  onStatusChanged(cb: (s: LlmStatus) => void): () => void;
  onToken(cb: (e: StreamTokenEvent) => void): () => void;
  onEnd(cb: (e: StreamEndEvent) => void): () => void;
};

export type StreamHandle = {
  text: Promise<string>;
  cancel(): void;
};

type ThinkState = {
  inside: boolean;
  partial: string;
};

type PendingStream = {
  buffer: string;
  think: ThinkState;
  onToken?: (token: string) => void;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

// Longest suffix of `s` that is a prefix of `tag`. Used to stash partial
// open/close tags across token boundaries.
function tagTail(s: string, tag: string): string {
  const max = Math.min(s.length, tag.length - 1);
  for (let k = max; k > 0; k--) {
    if (tag.startsWith(s.slice(s.length - k))) return s.slice(s.length - k);
  }
  return "";
}

// Filter tokens that fall inside <think>…</think>. Safe across chunk
// boundaries — partial tags are held in state.partial until resolved.
function filterThink(st: ThinkState, chunk: string): string {
  const s = st.partial + chunk;
  st.partial = "";
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (st.inside) {
      const e = s.indexOf(THINK_CLOSE, i);
      if (e === -1) {
        st.partial = tagTail(s.slice(i), THINK_CLOSE);
        return out;
      }
      i = e + THINK_CLOSE.length;
      st.inside = false;
    } else {
      const e = s.indexOf(THINK_OPEN, i);
      if (e === -1) {
        const rest = s.slice(i);
        const tail = tagTail(rest, THINK_OPEN);
        out += tail ? rest.slice(0, rest.length - tail.length) : rest;
        st.partial = tail;
        return out;
      }
      out += s.slice(i, e);
      i = e + THINK_OPEN.length;
      st.inside = true;
    }
  }
  return out;
}

// Strip any complete or dangling <think> block from a final text blob.
function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .replace(/^[\s\S]*?<\/think>/, "")
    .trim();
}

export class LlmClient {
  private status: LlmStatus = {
    available: false,
    enabled: true,
    loaded: false,
    loading: false,
  };
  private statusListeners = new Set<(s: LlmStatus) => void>();
  private pending = new Map<string, PendingStream>();
  private nextId = 1;

  constructor(private readonly bridge: LlmBridge | undefined) {
    if (!bridge) return;
    void bridge.status().then((s) => this.applyStatus(s));
    bridge.onStatusChanged((s) => this.applyStatus(s));
    bridge.onToken(({ requestId, token }) => {
      const p = this.pending.get(requestId);
      if (!p) return;
      p.buffer += token;
      const visible = filterThink(p.think, token);
      if (!visible) return;
      try {
        p.onToken?.(visible);
      } catch (err) {
        console.error("[llm] token cb error", err);
      }
    });
    bridge.onEnd(({ requestId, reason, text, error }) => {
      const p = this.pending.get(requestId);
      if (!p) return;
      this.pending.delete(requestId);
      if (reason === "done") {
        const raw = text ?? p.buffer;
        const stripped = stripThinkBlocks(raw);
        // When the model emitted tokens but everything was inside an
        // unclosed `<think>` block, `stripped` will be empty while `raw`
        // is non-trivial. Surface that loud and clear so callers can
        // diagnose "LLM kept losing the deadline" without a runtime
        // breakpoint — common with thinking models that don't honor a
        // `/no_think` directive in the current chat template.
        if (raw.length > 0 && stripped.length === 0) {
          console.warn(
            "[llm] stripThinkBlocks zeroed the response — model never escaped <think> mode",
            { requestId, rawLen: raw.length, rawPreview: raw.slice(0, 400) },
          );
        }
        p.resolve(stripped);
      } else if (reason === "cancelled") p.reject(new DOMException("Cancelled", "AbortError"));
      else p.reject(new Error(error ?? "llm error"));
    });
  }

  private applyStatus(s: LlmStatus): void {
    this.status = s;
    for (const cb of this.statusListeners) {
      try { cb(s); } catch (err) { console.error("[llm] status cb error", err); }
    }
  }

  isAvailable(): boolean {
    return !!this.bridge && this.status.available;
  }

  getStatus(): LlmStatus {
    return this.status;
  }

  onStatusChange(cb: (s: LlmStatus) => void): () => void {
    this.statusListeners.add(cb);
    try { cb(this.status); } catch { /* ignore */ }
    return () => this.statusListeners.delete(cb);
  }

  async listModels(): Promise<PublicModelEntry[]> {
    if (!this.bridge) return [];
    return this.bridge.list();
  }

  download(id: string, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    if (!this.bridge) return Promise.reject(new Error("llm bridge unavailable"));
    const b = this.bridge;
    return new Promise<void>((resolve, reject) => {
      const off = b.onDownloadProgress((p) => {
        if (p.modelId !== id) return;
        try { onProgress?.(p); } catch (err) { console.error("[llm] progress cb", err); }
        if (p.phase === "done") { off(); resolve(); }
        else if (p.phase === "error") { off(); reject(new Error(p.error ?? "download failed")); }
        else if (p.phase === "cancelled") { off(); reject(new DOMException("Cancelled", "AbortError")); }
      });
      b.download(id).catch((err) => { off(); reject(err); });
    });
  }

  cancelDownload(id: string): Promise<void> {
    if (!this.bridge) return Promise.resolve();
    return this.bridge.cancelDownload(id);
  }

  deleteModel(id: string): Promise<void> {
    if (!this.bridge) return Promise.resolve();
    return this.bridge.delete(id);
  }

  setActive(id: string | null): Promise<void> {
    if (!this.bridge) return Promise.resolve();
    return this.bridge.setActive(id);
  }

  setEnabled(enabled: boolean): Promise<void> {
    if (!this.bridge) return Promise.resolve();
    return this.bridge.setEnabled(enabled);
  }

  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void {
    if (!this.bridge) return () => {};
    return this.bridge.onDownloadProgress(cb);
  }

  getModelsDir(): Promise<string> {
    if (!this.bridge) return Promise.resolve("");
    return this.bridge.getModelsDir();
  }

  setModelsDir(dir: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.bridge) return Promise.resolve({ ok: false, error: "llm bridge unavailable" });
    return this.bridge.setModelsDir(dir);
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    if (!this.bridge || !this.isAvailable()) throw new Error("llm unavailable");
    const requestId = this.newId();
    const { text } = await this.bridge.generate(requestId, prompt, options);
    return text;
  }

  stream(prompt: string, onToken: (token: string) => void, options: GenerateOptions = {}): StreamHandle {
    const requestId = this.newId();
    if (!this.bridge || !this.isAvailable()) {
      const err = new Error("llm unavailable");
      return { text: Promise.reject(err), cancel: () => {} };
    }
    const b = this.bridge;
    const text = new Promise<string>((resolve, reject) => {
      this.pending.set(requestId, {
        buffer: "",
        think: { inside: false, partial: "" },
        onToken,
        resolve,
        reject,
      });
      b.stream(requestId, prompt, options).catch((err) => {
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
    return {
      text,
      cancel: () => {
        this.pending.delete(requestId);
        void b.cancel(requestId).catch(() => {});
      },
    };
  }

  private newId(): string {
    return `r${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
  }
}
