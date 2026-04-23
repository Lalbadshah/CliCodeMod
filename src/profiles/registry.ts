import type { Profile } from "./types";
import { claudeProfile } from "./claude";
import { codexProfile } from "./codex";

export const PROFILES: readonly Profile[] = [claudeProfile, codexProfile];

export type ProfileId = "claude" | "codex";

export function detectProfile(binary: string | undefined | null): Profile | null {
  if (!binary) return null;
  for (const p of PROFILES) {
    if (p.matches(binary)) return p;
  }
  return null;
}

export function getProfile(id: string | null | undefined): Profile | null {
  if (!id) return null;
  return PROFILES.find((p) => p.id === id) ?? null;
}
