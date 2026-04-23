const CSS_ID = "mod-cell-pulse-css";
const PULSE_MS = 900;

function ensureCss(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
    @keyframes mod-cell-pulse {
      0%   { background-color: var(--cell-pulse-color, rgba(255,255,255,0.20)); color: var(--cell-pulse-fg, inherit); filter: brightness(1.25); }
      60%  { background-color: var(--cell-pulse-color-mid, rgba(255,255,255,0.08)); filter: brightness(1.08); }
      100% { background-color: transparent; filter: brightness(1); }
    }
    .mod-cell-pulse {
      animation: mod-cell-pulse ${PULSE_MS}ms ease-out;
      border-radius: 3px;
    }
    @keyframes mod-cell-fill-pulse {
      0%   { box-shadow: 0 0 0 0 var(--cell-pulse-color, rgba(255,255,255,0.35)); }
      100% { box-shadow: 0 0 0 6px rgba(0,0,0,0); }
    }
    .mod-cell-fill-pulse {
      animation: mod-cell-fill-pulse ${PULSE_MS}ms ease-out;
    }
  `;
  document.head.append(style);
}

const PREV = new WeakMap<HTMLElement, string>();

export function writeCell(el: HTMLElement | null | undefined, value: string | null | undefined): void {
  if (!el) return;
  ensureCss();
  if (value == null || value === "") return;
  const prev = PREV.get(el) ?? el.textContent ?? "";
  if (prev === value) return;
  PREV.set(el, value);
  el.textContent = value;
  el.classList.remove("mod-cell-pulse");
  void el.offsetWidth;
  el.classList.add("mod-cell-pulse");
  window.setTimeout(() => el.classList.remove("mod-cell-pulse"), PULSE_MS + 40);
}

export function pulseEl(el: HTMLElement | null | undefined, kind: "text" | "fill" = "text"): void {
  if (!el) return;
  ensureCss();
  const cls = kind === "fill" ? "mod-cell-fill-pulse" : "mod-cell-pulse";
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), PULSE_MS + 40);
}

export function writeHTML(el: HTMLElement | null | undefined, html: string | null | undefined, signature?: string): void {
  if (!el) return;
  ensureCss();
  if (html == null) return;
  const key = signature ?? html;
  const prev = PREV.get(el) ?? "";
  if (prev === key) return;
  PREV.set(el, key);
  el.innerHTML = html;
  el.classList.remove("mod-cell-pulse");
  void el.offsetWidth;
  el.classList.add("mod-cell-pulse");
  window.setTimeout(() => el.classList.remove("mod-cell-pulse"), PULSE_MS + 40);
}
