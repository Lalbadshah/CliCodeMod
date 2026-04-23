import { basename } from "node:path";

export type ShellKind = "bash" | "zsh" | null;

export function detectShellKind(binary: string): ShellKind {
  const name = basename(binary).toLowerCase();
  if (name === "bash") return "bash";
  if (name === "zsh") return "zsh";
  return null;
}

export function isClaudeBinary(binary: string): boolean {
  return /claude/i.test(basename(binary));
}

export interface LaunchArgs {
  args: string[];
  extraEnv: Record<string, string>;
}

export function buildLaunchArgs(
  binary: string,
  baseArgs: string[],
  voice: string | null,
): LaunchArgs {
  const kind = detectShellKind(binary);
  const voicePrefix =
    voice && isClaudeBinary(binary) ? ["--append-system-prompt", voice] : [];

  const shellPrefix = shellArgsFor(kind);
  const extraEnv = shellEnvFor(kind, binary);

  return {
    args: [...shellPrefix, ...voicePrefix, ...baseArgs],
    extraEnv,
  };
}

function shellArgsFor(kind: ShellKind): string[] {
  switch (kind) {
    // PART_A_BASH_ARGS
    // PART_B_ZSH_ARGS
    default:
      return [];
  }
}

function shellEnvFor(kind: ShellKind, binary: string): Record<string, string> {
  switch (kind) {
    // PART_A_BASH_ENV
    // PART_B_ZSH_ENV
    default:
      return {};
  }
}
