import { mountZodiac } from "./zodiac";

/**
 * Arched parchment window that frames the night-sky zodiac scene.
 * Returns a cleanup function.
 */
export function mountArchedWindow(container: HTMLElement): () => void {
  const wrap = document.createElement("div");
  wrap.className = "oracle-window";

  // inner "glass" region — night sky lives here, clipped by CSS
  const glass = document.createElement("div");
  glass.className = "oracle-window-glass";

  const killZodiac = mountZodiac(glass);

  // decorative frame overlay (muntins + keystone)
  const overlay = document.createElement("div");
  overlay.className = "oracle-window-frame";
  overlay.innerHTML = `
    <svg viewBox="0 0 400 620" preserveAspectRatio="none" class="oracle-window-frame-svg">
      <defs>
        <linearGradient id="oracle-frame-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#b88a3a"/>
          <stop offset="50%" stop-color="#8a6820"/>
          <stop offset="100%" stop-color="#b88a3a"/>
        </linearGradient>
      </defs>
      <path d="M20,620 L20,220 A180,180 0 0 1 380,220 L380,620"
            fill="none" stroke="url(#oracle-frame-grad)" stroke-width="2.5"/>
      <path d="M28,620 L28,220 A172,172 0 0 1 372,220 L372,620"
            fill="none" stroke="#b88a3a" stroke-opacity="0.35" stroke-width="0.8"/>
      <line x1="200" y1="42" x2="200" y2="620" stroke="#b88a3a" stroke-opacity="0.35" stroke-width="0.8"/>
      <line x1="20" y1="360" x2="380" y2="360" stroke="#b88a3a" stroke-opacity="0.35" stroke-width="0.8"/>
      <path d="M20,220 A180,180 0 0 1 380,220" fill="none" stroke="#b88a3a" stroke-opacity="0.5" stroke-width="0.8"/>
      <circle cx="200" cy="42" r="5" fill="#b88a3a"/>
      <circle cx="200" cy="42" r="10" fill="none" stroke="#b88a3a" stroke-width="0.8"/>
      <circle cx="200" cy="220" r="3" fill="#b88a3a"/>
    </svg>
  `;

  wrap.append(glass, overlay);
  container.append(wrap);

  return () => {
    killZodiac();
    wrap.remove();
  };
}
