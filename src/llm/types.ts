export type ModelLicense = "Apache-2.0" | "MIT" | "Gemma" | "Llama" | "Other";

export type ModelFamily = "qwen" | "gemma" | "llama" | "phi" | "other";

export type ModelCatalogEntry = {
  id: string;
  displayName: string;
  family: ModelFamily;
  paramsLabel: string;
  sizeBytes: number;
  contextWindow: number;
  license: ModelLicense;
  note: string;
  url: string;
  sha256?: string;
  comingSoon?: boolean;
};

export type PublicModelEntry = {
  id: string;
  displayName: string;
  family: ModelFamily;
  paramsLabel: string;
  sizeBytes: number;
  contextWindow: number;
  license: ModelLicense;
  note: string;
  downloaded: boolean;
  comingSoon?: boolean;
};

export type DownloadPhase = "downloading" | "verifying" | "done" | "error" | "cancelled";

export type DownloadProgress = {
  modelId: string;
  bytes: number;
  total: number;
  phase: DownloadPhase;
  error?: string;
};

export type LlmStatus = {
  available: boolean;
  enabled: boolean;
  activeModelId?: string;
  loaded: boolean;
  loading: boolean;
  error?: string;
};

export type GenerateOptions = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  stop?: string[];
};

export type StreamTokenEvent = {
  requestId: string;
  token: string;
};

export type StreamEndEvent = {
  requestId: string;
  reason: "done" | "cancelled" | "error";
  text?: string;
  error?: string;
};

export type LlmSettings = {
  enabled: boolean;
  activeModelId?: string;
  modelsDir?: string;
};
