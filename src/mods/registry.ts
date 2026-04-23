import type { TerminalBus } from "../bus";
import type { Mod, ModId, ModMeta } from "./types";
import { createNeonMod } from "./neon";
import { createOracleMod } from "./oracle";
import { createEditorialMod } from "./editorial";
import { createBrainrotMod } from "./brainrot";

type Factory = () => Mod;

const factories: Record<ModId, Factory> = {
  neon: createNeonMod,
  oracle: createOracleMod,
  editorial: createEditorialMod,
  brainrot: createBrainrotMod,
};

let voiceCache: Record<ModId, string | null> | null = null;

export function modVoicePrompt(id: ModId): string | null {
  if (!voiceCache) {
    voiceCache = Object.fromEntries(
      (Object.keys(factories) as ModId[]).map((k) => [k, factories[k]().voicePrompt ?? null]),
    ) as Record<ModId, string | null>;
  }
  return voiceCache[id];
}

export const MOD_ORDER: ModId[] = ["neon", "oracle", "editorial", "brainrot"];

export const MOD_META: Record<ModId, ModMeta> = {
  neon: {
    id: "neon",
    name: "Neon Shrine",
    blurb: "Cyberpunk HUD. Angular amber frame, circuit tracery, dot-grid backdrop, DEVICE_INFO side panel.",
    preview: { bg: "#050302", accent: "#ffb700", ink: "#ff3a1e", label: "NEON · SHRINE" },
  },
  oracle: {
    id: "oracle",
    name: "The Oracle",
    blurb: "Mystical parchment frame. Warm serif chrome around a live terminal.",
    preview: { bg: "#f3ecd8", accent: "#b88a3a", ink: "#2a1e0e", label: "✦ THE ORACLE ✦" },
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    blurb: "Brutalist newspaper masthead. Kinetic type around a live terminal.",
    preview: { bg: "#ebe8e0", accent: "#e63922", ink: "#141414", label: "●●● ∞dex" },
  },
  brainrot: {
    id: "brainrot",
    name: "Brainrot",
    blurb: "Meme/Gen-Z chrome. Holographic bar, sticker stats, CRT TV that plays a typing GIF while you type.",
    preview: { bg: "#fef6ff", accent: "#ff4fb5", ink: "#0a0a14", label: "✨ BRAINROT ✨" },
  },
};

export class ModHost {
  private current: Mod | null = null;
  private curtain: HTMLDivElement | null = null;
  private pending = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly bus: TerminalBus,
  ) {}

  load(id: ModId): void {
    if (this.current && this.current.id === id) return;

    const isFirstMount = !this.current;
    const token = ++this.pending;

    if (isFirstMount) {
      this.mountFresh(id);
      return;
    }

    this.showCurtain();

    window.setTimeout(() => {
      if (token !== this.pending) return;
      if (this.current) {
        try {
          this.current.unmount();
        } catch (err) {
          console.error("[mod] unmount failed", err);
        }
        this.current = null;
      }
      this.root.innerHTML = "";
      this.mountFresh(id);
      this.hideCurtain();
    }, 300);
  }

  private mountFresh(id: ModId): void {
    const mod = factories[id]();
    mod.mount(this.root, this.bus);
    this.current = mod;
  }

  private showCurtain(): void {
    if (!this.curtain) {
      const curtain = document.createElement("div");
      curtain.setAttribute("data-mod-curtain", "");
      curtain.style.cssText =
        "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 300ms ease;z-index:900;";
      document.body.append(curtain);
      this.curtain = curtain;
      void curtain.offsetWidth;
    }
    this.curtain.style.pointerEvents = "auto";
    this.curtain.style.opacity = "1";
  }

  private hideCurtain(): void {
    if (!this.curtain) return;
    const curtain = this.curtain;
    curtain.style.opacity = "0";
    curtain.style.pointerEvents = "none";
    window.setTimeout(() => {
      if (this.curtain === curtain) {
        curtain.remove();
        this.curtain = null;
      }
    }, 320);
  }

  get activeId(): ModId | null {
    return this.current?.id ?? null;
  }

  cycleNext(): ModId {
    const cur = this.activeId;
    const idx = cur ? MOD_ORDER.indexOf(cur) : -1;
    const next = MOD_ORDER[(idx + 1) % MOD_ORDER.length];
    this.load(next);
    return next;
  }

  reload(): void {
    const id = this.activeId;
    if (!id) return;
    if (this.current) {
      try {
        this.current.unmount();
      } catch (err) {
        console.error("[mod] unmount failed", err);
      }
      this.current = null;
    }
    this.root.innerHTML = "";
    this.mountFresh(id);
  }

  unmount(): void {
    if (this.current) {
      try {
        this.current.unmount();
      } catch {
        /* ignore */
      }
      this.current = null;
    }
    this.root.innerHTML = "";
  }
}
