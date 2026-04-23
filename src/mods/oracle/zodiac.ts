const SVG = "http://www.w3.org/2000/svg";

const ZODIAC_SIGNS = [
  "♈", "♉", "♊", "♋", "♌", "♍",
  "♎", "♏", "♐", "♑", "♒", "♓",
];

type Star = {
  el: SVGCircleElement;
  baseOp: number;
  phase: number;
  speed: number;
};

export function mountZodiac(container: HTMLElement): () => void {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 500 700");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.classList.add("oracle-zodiac-svg");

  svg.innerHTML = `
    <defs>
      <radialGradient id="oracle-sky" cx="0.5" cy="0.42" r="0.85">
        <stop offset="0%" stop-color="#0e1628"/>
        <stop offset="55%" stop-color="#1a2239"/>
        <stop offset="100%" stop-color="#050611"/>
      </radialGradient>
      <radialGradient id="oracle-moon-grad" cx="0.35" cy="0.35" r="0.8">
        <stop offset="0%" stop-color="#fff5d4"/>
        <stop offset="70%" stop-color="#f0d98c"/>
        <stop offset="100%" stop-color="#b88a3a" stop-opacity="0.6"/>
      </radialGradient>
      <radialGradient id="oracle-moon-glow" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0%" stop-color="#fff1c4" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#fff1c4" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="oracle-mist-a" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#f3ecd8" stop-opacity="0"/>
        <stop offset="50%" stop-color="#f3ecd8" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#f3ecd8" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="oracle-mist-b" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#b88a3a" stop-opacity="0"/>
        <stop offset="50%" stop-color="#b88a3a" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#b88a3a" stop-opacity="0"/>
      </linearGradient>
      <filter id="oracle-twinkle">
        <feGaussianBlur stdDeviation="0.4"/>
      </filter>
    </defs>

    <rect width="500" height="700" fill="url(#oracle-sky)"/>

    <g id="oracle-stars"></g>

    <g id="oracle-zodiac-ring" transform-origin="250 330">
      <circle cx="250" cy="330" r="180" fill="none" stroke="#b88a3a" stroke-opacity="0.5" stroke-width="0.8"/>
      <circle cx="250" cy="330" r="165" fill="none" stroke="#b88a3a" stroke-opacity="0.28" stroke-width="0.5" stroke-dasharray="2 4"/>
      <circle cx="250" cy="330" r="195" fill="none" stroke="#b88a3a" stroke-opacity="0.28" stroke-width="0.5" stroke-dasharray="1 3"/>
      <g id="oracle-zodiac-signs"></g>
    </g>

    <circle cx="250" cy="330" r="120" fill="url(#oracle-moon-glow)"/>
    <circle id="oracle-moon" cx="250" cy="330" r="64" fill="url(#oracle-moon-grad)"/>
    <g id="oracle-moon-craters" opacity="0.28" fill="#8a6820">
      <circle cx="232" cy="316" r="5"/>
      <circle cx="266" cy="322" r="3.2"/>
      <circle cx="246" cy="346" r="4"/>
      <circle cx="270" cy="352" r="2.3"/>
      <circle cx="224" cy="344" r="2.8"/>
      <circle cx="258" cy="302" r="1.8"/>
    </g>

    <g id="oracle-mountains">
      <path d="M0,560 L60,500 L110,540 L170,470 L230,520 L280,480 L340,530 L390,490 L450,540 L500,510 L500,700 L0,700 Z" fill="#0a0e1a" opacity="0.95"/>
      <path d="M0,590 L50,560 L100,580 L160,540 L220,580 L260,560 L320,590 L370,560 L430,585 L500,570 L500,700 L0,700 Z" fill="#050611" opacity="0.9"/>
    </g>

    <g id="oracle-owl" transform="translate(305, 548)" opacity="0.95">
      <ellipse cx="0" cy="0" rx="7" ry="9" fill="#0a0a12"/>
      <ellipse cx="-3.2" cy="-3" rx="2.3" ry="2.5" fill="#f0d98c" id="oracle-owl-eye-l"/>
      <ellipse cx="3.2" cy="-3" rx="2.3" ry="2.5" fill="#f0d98c" id="oracle-owl-eye-r"/>
      <circle cx="-3.2" cy="-3" r="0.9" fill="#050611"/>
      <circle cx="3.2" cy="-3" r="0.9" fill="#050611"/>
      <polygon points="0,-1 -1,1 1,1" fill="#b88a3a"/>
    </g>

    <g id="oracle-mist">
      <ellipse id="oracle-mist-a" cx="180" cy="520" rx="260" ry="34" fill="url(#oracle-mist-a)" opacity="0.85"/>
      <ellipse id="oracle-mist-b" cx="320" cy="560" rx="300" ry="30" fill="url(#oracle-mist-b)" opacity="0.75"/>
    </g>

    <g id="oracle-solve-coagula" opacity="0.08" transform="translate(60, 200)">
      <circle cx="100" cy="100" r="90" fill="none" stroke="#2a1e0e" stroke-width="0.6"/>
      <circle cx="60" cy="100" r="60" fill="none" stroke="#2a1e0e" stroke-width="0.4"/>
      <circle cx="140" cy="100" r="60" fill="none" stroke="#2a1e0e" stroke-width="0.4"/>
      <polygon points="100,20 180,160 20,160" fill="none" stroke="#2a1e0e" stroke-width="0.4"/>
      <polygon points="100,180 20,40 180,40" fill="none" stroke="#2a1e0e" stroke-width="0.4"/>
    </g>
  `;

  // populate zodiac signs around the ring
  const signsG = svg.querySelector<SVGGElement>("#oracle-zodiac-signs")!;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = 180;
    const x = 250 + Math.cos(angle) * r;
    const y = 330 + Math.sin(angle) * r;
    const text = document.createElementNS(SVG, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("fill", "#b88a3a");
    text.setAttribute("font-size", "18");
    text.setAttribute(
      "style",
      `font-family: "Cinzel", "Cormorant Garamond", Garamond, serif; text-shadow: 0 0 6px #b88a3a;`,
    );
    text.textContent = ZODIAC_SIGNS[i];
    signsG.append(text);
  }

  // stars
  const starsG = svg.querySelector<SVGGElement>("#oracle-stars")!;
  const stars: Star[] = [];
  for (let i = 0; i < 44; i++) {
    const c = document.createElementNS(SVG, "circle");
    const cx = Math.random() * 500;
    const cy = Math.random() * 450;
    const r = 0.5 + Math.random() * 1.3;
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", r.toFixed(2));
    c.setAttribute("fill", Math.random() > 0.8 ? "#f0d98c" : "#f3ecd8");
    c.setAttribute("filter", "url(#oracle-twinkle)");
    const baseOp = 0.35 + Math.random() * 0.55;
    c.setAttribute("opacity", baseOp.toFixed(2));
    starsG.append(c);
    stars.push({
      el: c,
      baseOp,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 2.2,
    });
  }

  const ring = svg.querySelector<SVGGElement>("#oracle-zodiac-ring")!;
  const eyeL = svg.querySelector<SVGEllipseElement>("#oracle-owl-eye-l")!;
  const eyeR = svg.querySelector<SVGEllipseElement>("#oracle-owl-eye-r")!;
  const mistA = svg.querySelector<SVGEllipseElement>("#oracle-mist-a")!;
  const mistB = svg.querySelector<SVGEllipseElement>("#oracle-mist-b")!;

  container.append(svg);

  let running = true;
  let raf = 0;
  const start = performance.now();
  let nextBlink = 2000 + Math.random() * 3500;
  let blinkUntil = 0;

  const tick = (now: number) => {
    if (!running) return;
    const t = (now - start) / 1000;

    // rotating zodiac ring: 1 full rotation every 120s
    const rot = ((now - start) / 1000 / 120) * 360;
    ring.setAttribute("transform", `rotate(${rot.toFixed(3)} 250 330)`);

    // stars twinkle
    for (const s of stars) {
      const op = s.baseOp * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      s.el.setAttribute("opacity", op.toFixed(3));
    }

    // owl periodic blink
    const elapsed = now - start;
    if (elapsed > nextBlink) {
      blinkUntil = now + 140;
      nextBlink = elapsed + 2600 + Math.random() * 4400;
    }
    const blinking = now < blinkUntil;
    const eyeOp = blinking ? "0.05" : "1";
    eyeL.setAttribute("opacity", eyeOp);
    eyeR.setAttribute("opacity", eyeOp);

    // mist drift — two layers, different speeds
    const mAx = 180 + Math.sin(t * 0.12) * 60;
    const mBx = 320 + Math.sin(t * 0.07 + 1.3) * 80;
    mistA.setAttribute("cx", mAx.toFixed(1));
    mistB.setAttribute("cx", mBx.toFixed(1));

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVis);
    svg.remove();
  };
}
