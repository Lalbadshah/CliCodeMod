import type { ModelCatalogEntry, PublicModelEntry } from "../../src/llm/types";

export const CATALOG: ModelCatalogEntry[] = [
  {
    id: "qwen3-4b-instruct-2507",
    displayName: "Qwen3 4B Instruct (2507)",
    family: "qwen",
    paramsLabel: "4B",
    sizeBytes: 2_560_000_000,
    contextWindow: 8192,
    license: "Apache-2.0",
    note: "Highest intelligence in this size class. Best default for creative UI.",
    url: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  },
  {
    id: "qwen3_5-4b-instruct",
    displayName: "Qwen3.5 4B Instruct",
    family: "qwen",
    paramsLabel: "4B",
    sizeBytes: 2_750_000_000,
    contextWindow: 8192,
    license: "Apache-2.0",
    note: "Newest Qwen generation (Feb 2026). Freshest knowledge among Apache-licensed models.",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
  },
  {
    id: "gemma-4-e4b",
    displayName: "Gemma 4 E4B",
    family: "gemma",
    paramsLabel: "4.5B effective",
    sizeBytes: 3_500_000_000,
    contextWindow: 8192,
    license: "Gemma",
    note: "Latest cutoff (Jan 2025). 8B-class depth via Per-Layer Embeddings.",
    url: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
    comingSoon: true,
  },
];

export function findEntry(id: string): ModelCatalogEntry | undefined {
  return CATALOG.find((m) => m.id === id);
}

export function toPublic(entry: ModelCatalogEntry, downloaded: boolean): PublicModelEntry {
  return {
    id: entry.id,
    displayName: entry.displayName,
    family: entry.family,
    paramsLabel: entry.paramsLabel,
    sizeBytes: entry.sizeBytes,
    contextWindow: entry.contextWindow,
    license: entry.license,
    note: entry.note,
    downloaded,
    comingSoon: entry.comingSoon,
  };
}
