import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import type { ModelCatalogEntry, DownloadProgress, DownloadPhase } from "../../src/llm/types";

type ProgressEmit = (p: DownloadProgress) => void;

export class DownloadError extends Error {
  constructor(message: string, readonly modelId: string) {
    super(message);
    this.name = "DownloadError";
  }
}

export type DownloadHandle = {
  modelId: string;
  promise: Promise<string>;
  cancel(): void;
};

type ActiveDownload = {
  controller: AbortController;
  promise: Promise<string>;
};

export class Downloader {
  private active = new Map<string, ActiveDownload>();
  private dir: string;

  constructor(
    dir: string,
    private readonly emit: ProgressEmit,
  ) {
    this.dir = dir;
  }

  getDir(): string {
    return this.dir;
  }

  setDir(newDir: string): void {
    if (newDir === this.dir) return;
    for (const d of this.active.values()) d.controller.abort();
    this.active.clear();
    mkdirSync(newDir, { recursive: true });
    this.dir = newDir;
  }

  async modelsDir(): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    return this.dir;
  }

  modelPath(id: string): string {
    return `${this.dir}/${id}.gguf`;
  }

  partialPath(id: string): string {
    return `${this.dir}/${id}.gguf.partial`;
  }

  async exists(id: string): Promise<boolean> {
    try {
      const s = await fs.stat(this.modelPath(id));
      return s.isFile() && s.size > 0;
    } catch {
      return false;
    }
  }

  async listDownloaded(ids: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const id of ids) {
      if (await this.exists(id)) out.add(id);
    }
    return out;
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.modelPath(id), { force: true });
    await fs.rm(this.partialPath(id), { force: true });
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  cancel(id: string): void {
    const d = this.active.get(id);
    if (d) d.controller.abort();
  }

  start(entry: ModelCatalogEntry): DownloadHandle {
    const existing = this.active.get(entry.id);
    if (existing) {
      return {
        modelId: entry.id,
        promise: existing.promise,
        cancel: () => existing.controller.abort(),
      };
    }

    const controller = new AbortController();
    const promise = this.run(entry, controller.signal).finally(() => {
      this.active.delete(entry.id);
    });
    this.active.set(entry.id, { controller, promise });
    return {
      modelId: entry.id,
      promise,
      cancel: () => controller.abort(),
    };
  }

  private async run(entry: ModelCatalogEntry, signal: AbortSignal): Promise<string> {
    await this.modelsDir();
    const finalPath = this.modelPath(entry.id);
    const partPath = this.partialPath(entry.id);

    if (await this.exists(entry.id)) {
      this.emitProgress(entry.id, { bytes: entry.sizeBytes, total: entry.sizeBytes, phase: "done" });
      return finalPath;
    }

    await fs.rm(partPath, { force: true });

    let res: Response;
    try {
      res = await fetch(entry.url, { signal });
    } catch (err) {
      if (isAbort(err)) {
        this.emitProgress(entry.id, { bytes: 0, total: entry.sizeBytes, phase: "cancelled" });
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.emitProgress(entry.id, { bytes: 0, total: entry.sizeBytes, phase: "error", error: msg });
      throw new DownloadError(msg, entry.id);
    }

    if (!res.ok || !res.body) {
      const msg = `HTTP ${res.status} ${res.statusText}`;
      this.emitProgress(entry.id, { bytes: 0, total: entry.sizeBytes, phase: "error", error: msg });
      throw new DownloadError(msg, entry.id);
    }

    const headerLen = Number(res.headers.get("content-length") ?? 0);
    const total = headerLen > 0 ? headerLen : entry.sizeBytes;

    const file = createWriteStream(partPath);
    const hash = createHash("sha256");
    let bytes = 0;
    let lastEmit = 0;

    try {
      const nodeStream = Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      for await (const chunk of nodeStream) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        hash.update(buf);
        bytes += buf.length;
        if (!file.write(buf)) {
          await new Promise<void>((resolve) => file.once("drain", () => resolve()));
        }
        const now = Date.now();
        if (now - lastEmit > 120) {
          lastEmit = now;
          this.emitProgress(entry.id, { bytes, total, phase: "downloading" });
        }
      }
      await new Promise<void>((resolve, reject) => {
        file.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      file.destroy();
      await fs.rm(partPath, { force: true });
      if (isAbort(err) || signal.aborted) {
        this.emitProgress(entry.id, { bytes, total, phase: "cancelled" });
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.emitProgress(entry.id, { bytes, total, phase: "error", error: msg });
      throw new DownloadError(msg, entry.id);
    }

    if (entry.sha256) {
      this.emitProgress(entry.id, { bytes, total, phase: "verifying" });
      const digest = hash.digest("hex");
      if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
        await fs.rm(partPath, { force: true });
        const msg = `checksum mismatch (expected ${entry.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`;
        this.emitProgress(entry.id, { bytes, total, phase: "error", error: msg });
        throw new DownloadError(msg, entry.id);
      }
    }

    await fs.rename(partPath, finalPath);
    this.emitProgress(entry.id, { bytes, total, phase: "done" });
    return finalPath;
  }

  private emitProgress(modelId: string, p: { bytes: number; total: number; phase: DownloadPhase; error?: string }): void {
    this.emit({ modelId, ...p });
  }
}

function isAbort(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || /abort/i.test(err.message);
  }
  return false;
}
