import type { LlmClient } from "./llm/client";
import type { Profile, ProfileParser, ToolEvent } from "./profiles/types";

export type TerminalMeta = {
  pid: number | null;
  isMock: boolean;
  cwd?: string;
  binary?: string;
};

export type DataSender = (data: string) => void | Promise<void>;
export type ResizeHandler = (cols: number, rows: number) => void;
export type ToolListener = (event: ToolEvent) => void;

export class TerminalBus {
  private listeners = new Set<(data: string) => void>();
  private buffer = "";
  private readonly bufferCap = 500_000;
  private sender: DataSender | null = null;
  private resizer: ResizeHandler | null = null;
  private profile: Profile | null = null;
  private parser: ProfileParser | null = null;
  private toolListeners = new Set<ToolListener>();
  private toolHistory: ToolEvent[] = [];
  private readonly toolHistoryCap = 500;
  readonly meta: TerminalMeta = { pid: null, isMock: false };
  llm: LlmClient | null = null;

  setLlm(llm: LlmClient): void {
    this.llm = llm;
  }

  setSender(sender: DataSender): void {
    this.sender = sender;
  }

  setResizer(handler: ResizeHandler): void {
    this.resizer = handler;
  }

  setProfile(profile: Profile | null): void {
    if (this.profile?.id === profile?.id) return;
    this.parser?.flush();
    this.profile = profile;
    this.parser = profile ? profile.createParser((e) => this.emitTool(e)) : null;
  }

  get profileId(): string | null {
    return this.profile?.id ?? null;
  }

  onTool(cb: ToolListener): () => void {
    this.toolListeners.add(cb);
    return () => this.toolListeners.delete(cb);
  }

  toolSnapshot(): ToolEvent[] {
    return this.toolHistory.slice();
  }

  private emitTool(event: ToolEvent): void {
    this.toolHistory.push(event);
    if (this.toolHistory.length > this.toolHistoryCap) {
      this.toolHistory.splice(0, this.toolHistory.length - this.toolHistoryCap);
    }
    for (const cb of this.toolListeners) {
      try {
        cb(event);
      } catch (err) {
        console.error("[bus] tool listener error", err);
      }
    }
  }

  write(data: string): void {
    this.buffer += data;
    if (this.buffer.length > this.bufferCap) {
      this.buffer = this.buffer.slice(-this.bufferCap);
    }
    if (this.parser) {
      try {
        this.parser.parse(data);
      } catch (err) {
        console.error("[bus] profile parse error", err);
      }
    }
    for (const l of this.listeners) {
      try {
        l(data);
      } catch (err) {
        console.error("[bus] listener error", err);
      }
    }
  }

  onData(cb: (data: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  snapshot(): string {
    return this.buffer;
  }

  sendInput(data: string): void {
    if (this.sender) void this.sender(data);
  }

  resize(cols: number, rows: number): void {
    if (this.resizer) this.resizer(cols, rows);
  }

  clear(): void {
    this.buffer = "";
    this.parser?.reset();
    this.toolHistory.length = 0;
  }
}
