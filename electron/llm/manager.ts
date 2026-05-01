import type { GenerateOptions, LlmStatus } from "../../src/llm/types";
import { findEntry } from "./models";

type LoadedModel = {
  id: string;
  path: string;
  model: unknown;
  context: unknown;
};

type GenerateRequest = {
  requestId: string;
  prompt: string;
  options: GenerateOptions;
  stream: boolean;
  onToken?: (token: string) => void;
};

type StatusListener = (status: LlmStatus) => void;

export class LlmManager {
  private llama: unknown = null;
  private active: LoadedModel | null = null;
  private loading = false;
  private loadError: string | undefined;
  private enabled = true;
  private desiredId: string | undefined;
  private queue: Promise<void> = Promise.resolve();
  private aborts = new Map<string, AbortController>();
  private statusListeners = new Set<StatusListener>();

  private async lib(): Promise<any> {
    if (!this.llama) {
      const mod = await import("node-llama-cpp");
      const getLlama = (mod as { getLlama?: () => Promise<unknown> }).getLlama;
      if (!getLlama) throw new Error("node-llama-cpp: getLlama export missing");
      this.llama = await getLlama();
    }
    return this.llama;
  }

  async chatSessionCtor(): Promise<any> {
    const mod = await import("node-llama-cpp");
    const ctor = (mod as { LlamaChatSession?: unknown }).LlamaChatSession;
    if (!ctor) throw new Error("node-llama-cpp: LlamaChatSession export missing");
    return ctor;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.emitStatus();
  }

  setDesired(id: string | undefined): void {
    if (this.desiredId === id) return;
    this.desiredId = id;
    this.emitStatus();
  }

  getStatus(): LlmStatus {
    return {
      available: this.enabled && !!this.active && !this.loading,
      enabled: this.enabled,
      activeModelId: this.active?.id,
      desiredModelId: this.desiredId,
      loaded: !!this.active,
      loading: this.loading,
      error: this.loadError,
    };
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private emitStatus(): void {
    const s = this.getStatus();
    for (const cb of this.statusListeners) {
      try {
        cb(s);
      } catch (err) {
        console.error("[llm] status listener error", err);
      }
    }
  }

  async loadModel(id: string, path: string): Promise<void> {
    if (this.active && this.active.id === id && this.active.path === path) return;
    await this.unloadModel();

    this.loading = true;
    this.loadError = undefined;
    this.emitStatus();
    try {
      const llama: any = await this.lib();
      const entry = findEntry(id);
      // Use the catalog's full context window. The previous Math.min cap
      // at 4096 was forcing the bubble (and other long-context callers) to
      // truncate transcripts well before they needed to.
      const contextSize = entry?.contextWindow ?? 4096;
      const model = await llama.loadModel({ modelPath: path });
      const context = await model.createContext({ contextSize });
      this.active = { id, path, model, context };
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err);
      this.active = null;
      throw err;
    } finally {
      this.loading = false;
      this.emitStatus();
    }
  }

  async unloadModel(): Promise<void> {
    if (!this.active) return;
    const cur = this.active;
    this.active = null;
    try {
      const ctx: any = cur.context;
      if (ctx?.dispose) await ctx.dispose();
      const model: any = cur.model;
      if (model?.dispose) await model.dispose();
    } catch (err) {
      console.error("[llm] unload error", err);
    }
    this.emitStatus();
  }

  generate(req: GenerateRequest): Promise<string> {
    const task = async (): Promise<string> => {
      if (!this.enabled) throw new Error("llm disabled");
      if (!this.active) throw new Error("no model loaded");

      const ChatSession: any = await this.chatSessionCtor();
      const controller = new AbortController();
      this.aborts.set(req.requestId, controller);

      const ctx: any = this.active.context;
      const sequence = ctx.getSequence();
      try {
        const session = new ChatSession({
          contextSequence: sequence,
          systemPrompt: req.options.systemPrompt,
        });

        const response: string = await session.prompt(req.prompt, {
          // Pass maxTokens through as-is. Undefined lets node-llama-cpp
          // run until the model emits EOS or the context fills — callers
          // that want a hard cap pass an explicit number.
          maxTokens: req.options.maxTokens,
          temperature: req.options.temperature ?? 0.8,
          topP: req.options.topP,
          signal: controller.signal,
          customStopTriggers: req.options.stop,
          onTextChunk: req.stream
            ? (chunk: string) => {
                try {
                  req.onToken?.(chunk);
                } catch (err) {
                  console.error("[llm] onToken error", err);
                }
              }
            : undefined,
        });
        return response;
      } finally {
        this.aborts.delete(req.requestId);
        try {
          if (sequence?.dispose) sequence.dispose();
        } catch {
          /* ignore */
        }
      }
    };

    const tail = this.queue.then(task, task);
    this.queue = tail.then(
      () => undefined,
      () => undefined,
    );
    return tail;
  }

  cancel(requestId: string): void {
    const c = this.aborts.get(requestId);
    if (c) c.abort();
  }

  cancelAll(): void {
    for (const c of this.aborts.values()) c.abort();
    this.aborts.clear();
  }
}
