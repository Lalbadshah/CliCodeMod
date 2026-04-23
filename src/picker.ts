import { MOD_META, MOD_ORDER } from "./mods/registry";
import type { ModId } from "./mods/types";

export type PickerOptions = {
  activeId?: ModId | null;
  onPick: (id: ModId) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  closable?: boolean;
};

export function openPicker(host: HTMLElement, opts: PickerOptions): () => void {
  const existing = host.querySelector<HTMLDivElement>("[data-mod-picker]");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.setAttribute("data-mod-picker", "");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(6,6,10,.92);backdrop-filter:blur(8px);display:grid;grid-template-rows:auto 1fr auto;z-index:1000;color:#f0f0f7;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;overflow:hidden;";

  const header = document.createElement("div");
  header.style.cssText = "padding:28px 32px 12px 32px;display:flex;justify-content:space-between;align-items:baseline;gap:16px;";
  header.innerHTML =
    '<div><div style="font-size:22px;font-weight:700;letter-spacing:.14em">PICK·A·MOD</div>' +
    '<div style="color:#8a8aa3;font-size:12px;margin-top:4px;letter-spacing:.08em">Three skins. One core. Your terminal, dressed up.</div></div>';
  const headerActions = document.createElement("div");
  headerActions.style.cssText = "display:flex;gap:8px;align-items:center;";

  if (opts.onOpenSettings) {
    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.textContent = "⚙ Settings";
    settingsBtn.title = "Agent + Local AI settings (Cmd+;)";
    settingsBtn.style.cssText =
      "background:transparent;border:1px solid #333345;color:#c6c6dc;padding:6px 10px;border-radius:4px;font:inherit;cursor:pointer;letter-spacing:.08em;font-size:11px;";
    settingsBtn.onclick = () => {
      close();
      opts.onOpenSettings?.();
    };
    headerActions.append(settingsBtn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = opts.closable === false ? "" : "ESC / close";
  closeBtn.style.cssText =
    "background:transparent;border:1px solid #333345;color:#c6c6dc;padding:6px 10px;border-radius:4px;font:inherit;cursor:pointer;letter-spacing:.08em;font-size:11px;";
  if (opts.closable === false) closeBtn.style.visibility = "hidden";
  closeBtn.onclick = () => close();
  headerActions.append(closeBtn);
  header.append(headerActions);

  const grid = document.createElement("div");
  grid.style.cssText =
    "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:10px 32px 28px 32px;align-content:center;width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;min-width:0;";

  for (const id of MOD_ORDER) {
    const meta = MOD_META[id];
    const card = document.createElement("button");
    card.type = "button";
    const isActive = opts.activeId === id;
    card.style.cssText =
      `text-align:left;display:flex;flex-direction:column;gap:12px;background:#0f0f16;border:1px solid ${isActive ? "#6b6bff" : "#2a2a34"};border-radius:10px;padding:16px;cursor:pointer;color:inherit;font:inherit;transition:transform .12s ease,border-color .12s ease;min-width:0;overflow:hidden;`;
    card.onmouseenter = () => {
      card.style.transform = "translateY(-2px)";
      card.style.borderColor = "#5858ff";
    };
    card.onmouseleave = () => {
      card.style.transform = "";
      card.style.borderColor = isActive ? "#6b6bff" : "#2a2a34";
    };

    const preview = document.createElement("div");
    preview.style.cssText =
      `height:210px;width:100%;border-radius:6px;background:${meta.preview.bg};border:1px solid ${meta.preview.accent}55;position:relative;overflow:hidden;min-width:0;`;
    const iframe = document.createElement("iframe");
    iframe.src = `preview.html?mod=${meta.id}`;
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("aria-label", `${meta.name} preview`);
    iframe.loading = "lazy";
    iframe.style.cssText =
      "position:absolute;top:0;left:0;width:1400px;height:900px;border:0;transform:scale(0.234);transform-origin:top left;pointer-events:none;background:transparent;";
    const sub = document.createElement("div");
    sub.textContent = `[ ${meta.id.toUpperCase()} ]`;
    sub.style.cssText = `position:absolute;bottom:8px;right:10px;font-size:10px;color:${meta.preview.ink};opacity:.8;letter-spacing:.18em;mix-blend-mode:difference;z-index:2;pointer-events:none;`;
    const scrim = document.createElement("div");
    scrim.style.cssText =
      `position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,${meta.preview.bg}dd 100%);z-index:1;pointer-events:none;`;
    preview.append(iframe, scrim, sub);

    const title = document.createElement("div");
    title.textContent = meta.name;
    title.style.cssText = "font-size:16px;font-weight:700;letter-spacing:.04em;";

    const blurb = document.createElement("div");
    blurb.textContent = meta.blurb;
    blurb.style.cssText = "color:#9a9ab0;font-size:12px;line-height:1.5;";

    const tag = document.createElement("div");
    tag.textContent = isActive ? "● CURRENT" : "SELECT →";
    tag.style.cssText = `font-size:10px;color:${isActive ? "#6b6bff" : "#6e6e80"};letter-spacing:.14em;`;

    card.append(preview, title, blurb, tag);
    card.onclick = () => {
      opts.onPick(id);
      close();
    };
    grid.append(card);
  }

  const footer = document.createElement("div");
  footer.style.cssText = "padding:14px 32px 22px 32px;color:#6e6e80;font-size:11px;letter-spacing:.08em;display:flex;gap:24px;";
  footer.innerHTML =
    '<span>Cmd+,</span><span style="color:#4a4a5a">reopen picker</span>' +
    '<span>Cmd+;</span><span style="color:#4a4a5a">settings</span>' +
    '<span>Cmd+Shift+M</span><span style="color:#4a4a5a">cycle next mod</span>';

  overlay.append(header, grid, footer);
  host.append(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && opts.closable !== false) {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey);

  return close;
}
