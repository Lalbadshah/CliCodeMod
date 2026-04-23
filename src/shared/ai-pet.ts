import type { TerminalBus } from "../bus";
import type { StreamHandle } from "../llm/client";
import type { SessionBridge, SessionInfo } from "../mods/shared/session-info";
import { buildPetComment, PET_SYSTEM } from "../llm/prompts";

export type AiPetOptions = {
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
  bubbleStyle?: Partial<CSSStyleDeclaration>;
  avatar?: HTMLElement;
  idleMs?: number;
  minGapMs?: number;
  systemPrompt?: string;
  maxTokens?: number;
};

export type AiPetHandle = { dispose(): void };

export function mountAiPet(
  root: HTMLElement,
  bus: TerminalBus,
  bridge: SessionBridge,
  opts: AiPetOptions = {},
): AiPetHandle {
  const llm = bus.llm;
  if (!llm || !llm.isAvailable()) {
    return { dispose: () => {} };
  }

  const idleMs = opts.idleMs ?? 25_000;
  const minGapMs = opts.minGapMs ?? 12_000;
  const maxTokens = opts.maxTokens ?? 40;
  const systemPrompt = opts.systemPrompt ?? PET_SYSTEM;

  const wrapper = document.createElement("div");
  wrapper.className = opts.className ?? "ai-pet";
  Object.assign(wrapper.style, {
    position: "absolute",
    right: "16px",
    bottom: "18px",
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: "8px",
    pointerEvents: "none",
    zIndex: "50",
    ...(opts.style ?? {}),
  });

  if (opts.avatar) {
    wrapper.append(opts.avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "ai-pet-bubble";
  Object.assign(bubble.style, {
    maxWidth: "240px",
    padding: "8px 12px",
    background: "rgba(16,16,22,0.88)",
    color: "#f3ecd8",
    font: "500 12px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 200ms ease, transform 200ms ease",
    whiteSpace: "pre-wrap",
    display: "none",
    ...(opts.bubbleStyle ?? {}),
  });
  wrapper.append(bubble);
  root.append(wrapper);

  let disposed = false;
  let lastAt = 0;
  let active: StreamHandle | null = null;
  let lastPrompt: string | undefined;
  let lastTokens: number | undefined;
  let quietTimer: number | null = null;
  let hideTimer: number | null = null;
  let latestInfo: SessionInfo = bridge.snapshot;

  const setText = (text: string) => {
    if (text) {
      if (hideTimer != null) { window.clearTimeout(hideTimer); hideTimer = null; }
      bubble.textContent = text;
      bubble.style.display = "block";
      requestAnimationFrame(() => {
        bubble.style.opacity = "1";
        bubble.style.transform = "translateY(0)";
      });
    } else {
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(8px)";
      if (hideTimer != null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (!disposed && bubble.style.opacity === "0") {
          bubble.style.display = "none";
          bubble.textContent = "";
        }
      }, 240);
    }
  };

  const fade = () => setText("");

  const startComment = (mood: "idle" | "working" | "error") => {
    if (disposed) return;
    const now = Date.now();
    if (now - lastAt < minGapMs) return;
    lastAt = now;

    active?.cancel();
    const prompt = buildPetComment(latestInfo, mood);
    let buffer = "";
    setText("…");
    active = llm.stream(
      prompt,
      (tok) => {
        buffer += tok;
        if (!disposed) setText(buffer.trim());
      },
      { systemPrompt, maxTokens, temperature: mood === "idle" ? 0.9 : 1.0, stop: ["\n\n"] },
    );
    active.text
      .then((t) => {
        if (disposed) return;
        if (t.trim()) setText(t.trim());
        window.setTimeout(() => {
          if (!disposed) fade();
        }, 9_000);
      })
      .catch(() => {
        if (!disposed) fade();
      });
  };

  const scheduleIdle = () => {
    if (quietTimer != null) window.clearTimeout(quietTimer);
    quietTimer = window.setTimeout(() => {
      if (disposed) return;
      startComment("idle");
    }, idleMs);
  };

  const unsub = bridge.subscribe((info) => {
    if (disposed) return;
    latestInfo = info;
    if (info.lastPrompt && info.lastPrompt !== lastPrompt) {
      lastPrompt = info.lastPrompt;
      startComment("working");
      scheduleIdle();
      return;
    }
    if (info.tokensCount != null && lastTokens != null && info.tokensCount > lastTokens * 1.15) {
      startComment("working");
      scheduleIdle();
    }
    if (info.tokensCount != null) lastTokens = info.tokensCount;
  });

  scheduleIdle();

  setText("hi 👋");
  window.setTimeout(() => {
    if (!disposed && !active) fade();
  }, 4000);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (quietTimer != null) window.clearTimeout(quietTimer);
      if (hideTimer != null) window.clearTimeout(hideTimer);
      unsub();
      active?.cancel();
      wrapper.remove();
    },
  };
}
