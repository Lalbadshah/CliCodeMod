interface UpdatePayload {
  version: string;
  releaseNotes: string;
  releaseUrl: string;
  dmgPath: string | null;
  downloadUrl: string;
  downloading: boolean;
}

interface UpdateBridge {
  snapshot(): Promise<unknown>;
  install(): Promise<void>;
  dismiss(version: string): void;
  openRelease(): void;
  onReady(cb: (payload: unknown) => void): () => void;
}

let mounted = false;

export function mountUpdateBanner(bridge: UpdateBridge | undefined): void {
  if (mounted || !bridge) return;
  mounted = true;

  const root = document.createElement("div");
  root.setAttribute("data-update-banner", "");
  root.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translate(-50%, -120%)",
    "padding:10px 14px 10px 16px",
    "display:flex",
    "align-items:center",
    "gap:14px",
    "max-width:520px",
    "background:rgba(20,20,26,0.94)",
    "color:#f3ecd8",
    "font:500 12px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif",
    "letter-spacing:0.02em",
    "border:1px solid rgba(255,255,255,0.14)",
    "border-radius:12px",
    "box-shadow:0 12px 32px rgba(0,0,0,0.45)",
    "z-index:975",
    "transition:transform 240ms ease, opacity 240ms ease",
    "opacity:0",
    "pointer-events:auto",
  ].join(";");

  const label = document.createElement("div");
  label.style.cssText = "flex:1;min-width:0;";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;letter-spacing:0.04em;";
  const sub = document.createElement("div");
  sub.style.cssText = "font-size:11px;opacity:0.72;margin-top:2px;";
  label.append(title, sub);

  const install = document.createElement("button");
  install.textContent = "Install";
  install.style.cssText = buttonStyle("primary");
  install.addEventListener("click", () => {
    if (install.disabled) return;
    install.disabled = true;
    install.textContent = "Installing…";
    void bridge.install();
  });

  const later = document.createElement("button");
  later.textContent = "Later";
  later.style.cssText = buttonStyle("ghost");
  later.addEventListener("click", () => {
    if (currentVersion) bridge.dismiss(currentVersion);
    hide();
  });

  const notes = document.createElement("a");
  notes.textContent = "Release notes";
  notes.href = "#";
  notes.style.cssText = "color:#9fc3ff;text-decoration:none;font-size:11px;margin-right:4px;";
  notes.addEventListener("click", (e) => {
    e.preventDefault();
    bridge.openRelease();
  });

  root.append(label, notes, later, install);
  document.body.append(root);

  let currentVersion: string | null = null;

  const show = () => {
    void root.offsetWidth;
    root.style.transform = "translate(-50%, 0)";
    root.style.opacity = "1";
  };
  const hide = () => {
    root.style.transform = "translate(-50%, -120%)";
    root.style.opacity = "0";
  };

  const apply = (raw: unknown) => {
    const p = raw as UpdatePayload | null;
    if (!p) {
      hide();
      return;
    }
    currentVersion = p.version;
    title.textContent = `Update v${p.version} available`;
    if (p.dmgPath) {
      sub.textContent = "Ready to install — click Install to apply and relaunch.";
      install.disabled = false;
      install.textContent = "Install";
    } else if (p.downloading) {
      sub.textContent = "Downloading update…";
      install.disabled = true;
      install.textContent = "Downloading…";
    } else {
      sub.textContent = "Download failed — will retry. Or open release page to install manually.";
      install.disabled = true;
      install.textContent = "Install";
    }
    show();
  };

  bridge.onReady(apply);
  void bridge.snapshot().then(apply).catch(() => {});
}

function buttonStyle(kind: "primary" | "ghost"): string {
  const base = [
    "appearance:none",
    "border:none",
    "padding:6px 12px",
    "border-radius:8px",
    "font:600 11px/1 ui-sans-serif,system-ui,-apple-system,sans-serif",
    "letter-spacing:0.06em",
    "text-transform:uppercase",
    "cursor:pointer",
    "transition:background 120ms ease, opacity 120ms ease",
  ];
  if (kind === "primary") {
    base.push(
      "background:#f3ecd8",
      "color:#1a1a1f",
    );
  } else {
    base.push(
      "background:transparent",
      "color:#f3ecd8",
      "border:1px solid rgba(255,255,255,0.18)",
    );
  }
  return base.join(";");
}
