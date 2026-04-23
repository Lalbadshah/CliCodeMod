import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AppSettings, WindowBounds } from "../src/types/events";
import type { LlmSettings } from "../src/llm/types";

const FILE = "settings.json";

export function defaultSettings(): AppSettings {
  return {
    binary: "claude",
    cwd: app.getPath("home"),
  };
}

function validBounds(b: unknown): WindowBounds | undefined {
  if (!b || typeof b !== "object") return undefined;
  const r = b as Record<string, unknown>;
  if (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number" &&
    r.width >= 640 &&
    r.height >= 400
  ) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return undefined;
}

function validLlm(v: unknown): LlmSettings | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : true;
  const activeModelId = typeof r.activeModelId === "string" ? r.activeModelId : undefined;
  const modelsDir =
    typeof r.modelsDir === "string" && r.modelsDir.length > 0 ? r.modelsDir : undefined;
  return { enabled, activeModelId, modelsDir };
}

export async function loadSettings(): Promise<AppSettings | null> {
  const path = join(app.getPath("userData"), FILE);
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as AppSettings;
    if (typeof parsed.binary === "string" && typeof parsed.cwd === "string") {
      const selectedMod =
        parsed.selectedMod === "neon" ||
        parsed.selectedMod === "oracle" ||
        parsed.selectedMod === "editorial" ||
        parsed.selectedMod === "brainrot"
          ? parsed.selectedMod
          : undefined;
      const windowBounds = validBounds(parsed.windowBounds);
      const llm = validLlm(parsed.llm);
      return { ...parsed, selectedMod, windowBounds, llm };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const path = join(app.getPath("userData"), FILE);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(path, JSON.stringify(settings, null, 2), "utf8");
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings | null> {
  const cur = (await loadSettings()) ?? defaultSettings();
  const next: AppSettings = { ...cur, ...patch };
  await saveSettings(next);
  return next;
}
