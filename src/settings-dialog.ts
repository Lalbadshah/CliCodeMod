import type { AppSettings } from "./types/events";
import type { DownloadProgress, LlmStatus, PublicModelEntry } from "./llm/types";

type Cli = Window["cli"];

export function renderSettingsDialog(
  host: HTMLElement,
  cli: Cli,
  onSave: (s: AppSettings) => Promise<void>,
  initial?: AppSettings,
  onCancel?: () => void,
): void {
  const existing = host.querySelector<HTMLDivElement>("[data-settings-overlay]");
  if (existing) existing.remove();

  const overlay = el("div");
  overlay.setAttribute("data-settings-overlay", "");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(8,8,12,.88);display:grid;place-items:center;z-index:1100;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#e8e8ef;";

  const card = el("form") as HTMLFormElement;
  card.style.cssText =
    "background:#14141c;border:1px solid #2a2a34;border-radius:8px;padding:20px 22px;min-width:460px;max-height:86vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px;";
  card.innerHTML =
    '<h2 style="margin:0 0 4px 0;font-size:15px;letter-spacing:.06em">Agent settings</h2>' +
    '<p style="margin:0 0 6px 0;color:#9a9ab0;font-size:12px">Pick any CLI binary. It runs in a real pseudo-terminal — exactly like your shell.</p>';

  const presetRow = el("div");
  presetRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
  const presetLabel = el("div");
  presetLabel.textContent = "Preset";
  presetLabel.style.cssText = "font-size:11px;color:#9a9ab0;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px;";
  const presetWrap = el("div");
  presetWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  presetWrap.append(presetLabel, presetRow);

  const binField = field("Binary", "binary", initial?.binary ?? "claude");
  const presets: { id: string; label: string; binary: string }[] = [
    { id: "claude", label: "Claude Code", binary: "claude" },
    { id: "bash", label: "Generic · bash", binary: "bash" },
    { id: "zsh", label: "Generic · zsh", binary: "zsh" },
  ];
  const presetBtns = new Map<string, HTMLButtonElement>();
  const paintPreset = () => {
    const bin = binField.input.value.trim();
    for (const [id, btn] of presetBtns) {
      const p = presets.find((p) => p.id === id)!;
      const active = p.binary === bin;
      btn.style.background = active ? "#3b82f6" : "#1e1e28";
      btn.style.borderColor = active ? "#3b82f6" : "#2a2a34";
      btn.style.color = active ? "#ffffff" : "#c6c6dc";
    }
  };
  for (const p of presets) {
    const btn = el("button") as HTMLButtonElement;
    btn.type = "button";
    btn.textContent = p.label;
    btn.style.cssText =
      "background:#1e1e28;border:1px solid #2a2a34;color:#c6c6dc;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;";
    btn.onclick = () => {
      binField.input.value = p.binary;
      paintPreset();
    };
    presetBtns.set(p.id, btn);
    presetRow.append(btn);
  }
  binField.input.addEventListener("input", paintPreset);
  paintPreset();

  const cwdRow = fieldRow("Working dir", "cwd", initial?.cwd ?? "");
  const pickBtn = el("button") as HTMLButtonElement;
  pickBtn.type = "button";
  pickBtn.textContent = "Browse…";
  pickBtn.style.cssText =
    "background:#2a2a34;border:1px solid #3a3a48;color:#f0f0f7;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit;";
  pickBtn.onclick = async () => {
    const dir = await cli.pickDirectory();
    if (dir) cwdRow.input.value = dir;
  };
  cwdRow.trail.append(pickBtn);

  const llmSection = cli.llm ? renderLlmSection(cli, cli.pickDirectory) : null;

  const actions = el("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:8px;";
  if (onCancel) {
    const cancel = el("button") as HTMLButtonElement;
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText =
      "background:transparent;border:1px solid #2a2a34;color:#c6c6dc;padding:8px 14px;border-radius:4px;cursor:pointer;font:inherit;";
    cancel.onclick = () => dismiss();
    actions.append(cancel);
  }
  const save = el("button") as HTMLButtonElement;
  save.type = "submit";
  save.textContent = onCancel ? "Save" : "Save & Continue";
  save.style.cssText =
    "background:#3b82f6;border:none;color:white;padding:8px 14px;border-radius:4px;cursor:pointer;font:inherit;";
  actions.append(save);

  card.append(presetWrap, binField.row, cwdRow.row);
  if (llmSection) card.append(llmSection.root);
  card.append(actions);
  overlay.append(card);
  host.append(overlay);

  const dismiss = () => {
    overlay.remove();
    llmSection?.dispose();
    if (onCancel) document.removeEventListener("keydown", onKey);
    onCancel?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      dismiss();
    }
  };
  if (onCancel) document.addEventListener("keydown", onKey);

  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    const binary = binField.input.value.trim() || "claude";
    const cwd = cwdRow.input.value.trim();
    if (!cwd) {
      cwdRow.input.focus();
      return;
    }
    overlay.remove();
    llmSection?.dispose();
    if (onCancel) document.removeEventListener("keydown", onKey);
    const llm = llmSection
      ? { enabled: llmSection.enabled(), activeModelId: llmSection.activeId() }
      : initial?.llm;
    await onSave({
      binary,
      cwd,
      extraArgs: initial?.extraArgs,
      selectedMod: initial?.selectedMod,
      windowBounds: initial?.windowBounds,
      llm,
    });
  });
}

function renderLlmSection(
  cli: Cli,
  pickDirectory: Cli["pickDirectory"],
): {
  root: HTMLElement;
  dispose(): void;
  enabled(): boolean;
  activeId(): string | undefined;
} {
  const bridge = cli.llm!;
  const root = el("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:10px;padding:10px 0 4px;border-top:1px solid #23232c;margin-top:4px;";

  const header = el("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
  const title = el("div");
  title.innerHTML = '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c6c6dc">Local AI <span style="color:#7a7a92;text-transform:none;letter-spacing:normal;font-size:11px">· optional · runs on device</span></div>';
  const enableLabel = el("label");
  enableLabel.style.cssText = "display:flex;gap:6px;align-items:center;font-size:11px;color:#c6c6dc;cursor:pointer;";
  const enable = el("input") as HTMLInputElement;
  enable.type = "checkbox";
  enable.checked = true;
  enableLabel.append(enable, document.createTextNode("enabled"));
  header.append(title, enableLabel);
  root.append(header);

  const blurb = el("div");
  blurb.style.cssText = "font-size:11px;color:#7a7a92;line-height:1.5;";
  blurb.textContent = "Download a small model to let mods generate playful UI text. Fully offline after download.";
  root.append(blurb);

  const folderRow = el("div");
  folderRow.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const folderLabel = el("div");
  folderLabel.textContent = "Models folder";
  folderLabel.style.cssText = "font-size:11px;color:#9a9ab0;letter-spacing:.04em;text-transform:uppercase;";
  const folderWrap = el("div");
  folderWrap.style.cssText = "display:flex;gap:8px;align-items:center;";
  const folderPath = el("input") as HTMLInputElement;
  folderPath.readOnly = true;
  folderPath.value = "";
  folderPath.style.cssText =
    "flex:1;background:#0c0c11;border:1px solid #2a2a34;color:#c6c6dc;padding:6px 8px;border-radius:4px;font:inherit;font-size:11px;min-width:0;";
  const folderBtn = el("button") as HTMLButtonElement;
  folderBtn.type = "button";
  folderBtn.textContent = "Change…";
  folderBtn.style.cssText =
    "background:#2a2a34;border:1px solid #3a3a48;color:#f0f0f7;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;";
  folderWrap.append(folderPath, folderBtn);
  const folderHint = el("div");
  folderHint.textContent =
    "Existing downloads stay at their old location when you change this.";
  folderHint.style.cssText = "font-size:10px;color:#7a7a92;line-height:1.4;";
  const folderErr = el("div");
  folderErr.style.cssText = "font-size:10px;color:#b66;line-height:1.4;display:none;";
  folderRow.append(folderLabel, folderWrap, folderHint, folderErr);
  root.append(folderRow);

  folderBtn.onclick = async () => {
    folderErr.style.display = "none";
    const picked = await pickDirectory();
    if (!picked) return;
    const res = await bridge.setModelsDir(picked);
    if (!res.ok) {
      folderErr.textContent = `can't use folder: ${res.error ?? "unknown error"}`;
      folderErr.style.display = "block";
      return;
    }
    folderPath.value = picked;
    await refresh();
  };

  const list = el("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  root.append(list);

  const status = el("div");
  status.style.cssText = "font-size:11px;color:#7a7a92;";
  root.append(status);

  const test = renderLlmTest(bridge);
  root.append(test.root);

  let models: PublicModelEntry[] = [];
  let currentActive: string | undefined;
  let llmStatus: LlmStatus | null = null;

  const updateStatus = () => {
    if (!llmStatus) return;
    if (llmStatus.loading) status.textContent = "loading model into memory…";
    else if (llmStatus.error) status.textContent = `error: ${llmStatus.error}`;
    else if (llmStatus.loaded && llmStatus.activeModelId) status.textContent = `active · ${llmStatus.activeModelId} loaded`;
    else status.textContent = models.some((m) => m.downloaded) ? "no model selected" : "nothing downloaded yet";
  };

  const render = () => {
    list.innerHTML = "";
    for (const m of models) {
      list.append(renderRow(m));
    }
    updateStatus();
  };

  const renderRow = (m: PublicModelEntry): HTMLElement => {
    const row = el("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;background:#0c0c11;border:1px solid #23232c;border-radius:6px;padding:8px 10px;";
    const info = el("div");
    info.style.cssText = "flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;";
    const line1 = el("div");
    line1.style.cssText = "font-size:12px;color:#e8e8ef;display:flex;gap:8px;align-items:baseline;";
    const name = el("span");
    name.textContent = m.displayName;
    name.style.cssText = "font-weight:600;";
    const meta = el("span");
    meta.textContent = `${formatSize(m.sizeBytes)} · ${m.license}`;
    meta.style.cssText = "color:#7a7a92;font-size:11px;";
    line1.append(name, meta);
    const line2 = el("div");
    line2.style.cssText = "font-size:11px;color:#9a9ab0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;";
    line2.textContent = m.note;
    info.append(line1, line2);
    row.append(info);

    const action = el("div");
    action.style.cssText = "display:flex;align-items:center;gap:6px;min-width:148px;justify-content:flex-end;";

    if (m.comingSoon) {
      const badge = el("span");
      badge.textContent = "coming soon";
      badge.title = "Waiting for llama.cpp runtime support";
      badge.style.cssText =
        "background:#1e1e28;border:1px solid #2a2a34;color:#c6c6dc;padding:4px 9px;border-radius:999px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;";
      action.append(badge);
      if (m.downloaded) {
        const del = el("button") as HTMLButtonElement;
        del.type = "button";
        del.textContent = "delete";
        del.title = "Delete model from disk";
        del.style.cssText = "background:transparent;border:1px solid #2a2a34;color:#b66;padding:5px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;";
        del.onclick = async () => {
          await bridge.delete(m.id);
          await refresh();
        };
        action.append(del);
      }
    } else if (m.downloaded) {
      const isActive = m.id === currentActive;
      const activeBtn = el("button") as HTMLButtonElement;
      activeBtn.type = "button";
      activeBtn.textContent = isActive ? "active" : "set active";
      activeBtn.disabled = isActive;
      activeBtn.style.cssText = `background:${isActive ? "#1f7a3a" : "#1e1e28"};border:1px solid ${isActive ? "#1f7a3a" : "#2a2a34"};color:${isActive ? "#d2ffd8" : "#c6c6dc"};padding:5px 10px;border-radius:4px;cursor:${isActive ? "default" : "pointer"};font:inherit;font-size:11px;`;
      activeBtn.onclick = async () => {
        try {
          await bridge.setActive(m.id);
          currentActive = m.id;
          render();
        } catch (err) {
          status.textContent = `error: ${(err as Error).message}`;
        }
      };
      const del = el("button") as HTMLButtonElement;
      del.type = "button";
      del.textContent = "delete";
      del.title = "Delete model from disk";
      del.style.cssText = "background:transparent;border:1px solid #2a2a34;color:#b66;padding:5px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;";
      del.onclick = async () => {
        await bridge.delete(m.id);
        await refresh();
      };
      action.append(activeBtn, del);
    } else {
      const dl = el("button") as HTMLButtonElement;
      dl.type = "button";
      dl.textContent = "download";
      dl.style.cssText = "background:#3b82f6;border:none;color:white;padding:5px 12px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;";
      const bar = el("div");
      bar.style.cssText = "flex:1;height:4px;background:#23232c;border-radius:3px;overflow:hidden;display:none;";
      const fill = el("div");
      fill.style.cssText = "height:100%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);width:0%;transition:width 120ms ease;";
      bar.append(fill);
      const pct = el("span");
      pct.style.cssText = "font-size:10px;color:#9a9ab0;min-width:42px;text-align:right;";
      const cancel = el("button") as HTMLButtonElement;
      cancel.type = "button";
      cancel.textContent = "cancel";
      cancel.style.cssText = "background:transparent;border:1px solid #2a2a34;color:#c6c6dc;padding:5px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;display:none;";

      dl.onclick = async () => {
        dl.style.display = "none";
        bar.style.display = "block";
        cancel.style.display = "inline-block";
        const off = bridge.onDownloadProgress((p) => {
          if (p.modelId !== m.id) return;
          const frac = p.total > 0 ? Math.min(1, p.bytes / p.total) : 0;
          fill.style.width = `${(frac * 100).toFixed(1)}%`;
          if (p.phase === "verifying") pct.textContent = "verify";
          else pct.textContent = `${Math.round(frac * 100)}%`;
          if (p.phase === "done" || p.phase === "error" || p.phase === "cancelled") {
            off();
            void refresh();
          }
        });
        cancel.onclick = () => bridge.cancelDownload(m.id);
        try {
          await bridge.download(m.id);
        } catch (err) {
          status.textContent = `download failed: ${(err as Error).message}`;
          dl.style.display = "inline-block";
          bar.style.display = "none";
          cancel.style.display = "none";
        }
      };

      action.append(bar, pct, dl, cancel);
    }

    row.append(action);
    return row;
  };

  const refresh = async () => {
    const [modelList, st, dir] = await Promise.all([
      bridge.list(),
      bridge.status(),
      bridge.getModelsDir(),
    ]);
    models = modelList;
    llmStatus = st;
    currentActive = st.activeModelId;
    enable.checked = st.enabled;
    folderPath.value = dir;
    render();
  };

  enable.addEventListener("change", () => {
    void bridge.setEnabled(enable.checked);
  });

  const offProgress = bridge.onDownloadProgress(() => {});
  const offStatus = bridge.onStatusChanged((s) => {
    llmStatus = s;
    currentActive = s.activeModelId;
    render();
  });

  void refresh();

  return {
    root,
    dispose: () => { offProgress(); offStatus(); test.dispose(); },
    enabled: () => enable.checked,
    activeId: () => currentActive,
  };
}

function renderLlmTest(bridge: NonNullable<Cli["llm"]>): { root: HTMLElement; dispose(): void } {
  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;gap:6px;padding:10px;background:#0c0c11;border:1px solid #23232c;border-radius:6px;";

  const header = el("div");
  header.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:space-between;";
  const title = el("div");
  title.innerHTML =
    '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c6c6dc">Diagnostics</div>' +
    '<div style="font-size:10px;color:#7a7a92;margin-top:2px">Round-trip a prompt through the active model to confirm it works.</div>';
  const btn = el("button") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = "test";
  btn.style.cssText =
    "background:#1e1e28;border:1px solid #2a2a34;color:#c6c6dc;padding:5px 14px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px;white-space:nowrap;";
  header.append(title, btn);
  root.append(header);

  const output = el("div");
  output.style.cssText =
    "min-height:38px;max-height:120px;overflow-y:auto;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:11px;line-height:1.45;color:#d2d2e4;background:#07070b;border:1px solid #1a1a22;border-radius:4px;padding:6px 8px;white-space:pre-wrap;word-break:break-word;";
  output.textContent = "idle — click test.";
  root.append(output);

  const meta = el("div");
  meta.style.cssText = "font-size:10px;color:#7a7a92;display:flex;gap:10px;";
  root.append(meta);

  let activeRequestId: string | null = null;
  let started = 0;
  let buffer = "";

  const offToken = bridge.onToken((e) => {
    if (!activeRequestId || e.requestId !== activeRequestId) return;
    buffer += e.token;
    output.textContent = buffer;
    output.scrollTop = output.scrollHeight;
  });

  const offEnd = bridge.onEnd((e) => {
    if (!activeRequestId || e.requestId !== activeRequestId) return;
    const elapsed = Date.now() - started;
    const final = (e.text ?? buffer).trim() || "(empty response)";
    activeRequestId = null;
    btn.disabled = false;
    btn.textContent = "test";
    if (e.reason === "done") {
      output.textContent = final;
      meta.innerHTML =
        `<span style="color:#6fb82a">✓ ok</span>` +
        `<span>${elapsed} ms</span>` +
        `<span>${final.length} chars</span>`;
    } else if (e.reason === "cancelled") {
      meta.innerHTML = `<span style="color:#ffc857">cancelled</span><span>${elapsed} ms</span>`;
    } else {
      output.textContent = `error: ${e.error ?? "unknown"}`;
      meta.innerHTML = `<span style="color:#ff6969">✗ failed</span><span>${elapsed} ms</span>`;
    }
  });

  btn.onclick = async () => {
    if (activeRequestId) {
      const id = activeRequestId;
      activeRequestId = null;
      btn.disabled = true;
      try { await bridge.cancel(id); } catch { /* ignore */ }
      return;
    }
    const st = await bridge.status();
    if (!st.enabled) {
      meta.innerHTML = '<span style="color:#ffc857">disabled</span><span>flip "enabled" on</span>';
      output.textContent = "local AI is disabled.";
      return;
    }
    if (!st.activeModelId) {
      meta.innerHTML = '<span style="color:#ffc857">no model</span><span>download + set active first</span>';
      output.textContent = "no active model — download one above, then click 'set active'.";
      return;
    }
    if (!st.available) {
      meta.innerHTML = `<span style="color:#ffc857">unavailable</span><span>${st.error ?? "model not loaded"}</span>`;
      output.textContent = st.loading ? "loading model into memory…" : "model unavailable.";
      return;
    }
    buffer = "";
    output.textContent = "…";
    meta.innerHTML = `<span>running…</span><span>${st.activeModelId}</span>`;
    btn.textContent = "cancel";
    started = Date.now();
    activeRequestId = `llm-test-${Date.now().toString(36)}`;
    try {
      await bridge.stream(activeRequestId, 'Reply with exactly: "pong" and nothing else.', {
        systemPrompt: "You are a terse health-check. Reply with exactly one word, no punctuation.",
        maxTokens: 8,
        temperature: 0,
      });
    } catch (err) {
      activeRequestId = null;
      btn.disabled = false;
      btn.textContent = "test";
      output.textContent = `error: ${(err as Error).message}`;
      meta.innerHTML = '<span style="color:#ff6969">✗ failed</span>';
    }
  };

  return {
    root,
    dispose: () => {
      offToken();
      offEnd();
      if (activeRequestId) {
        const id = activeRequestId;
        activeRequestId = null;
        void bridge.cancel(id).catch(() => {});
      }
    },
  };
}

function formatSize(bytes: number): string {
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  return `${Math.round(mb)} MB`;
}

function field(label: string, name: string, value: string) {
  const row = el("div");
  row.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const l = el("label");
  l.textContent = label;
  l.style.cssText = "font-size:11px;color:#9a9ab0;letter-spacing:.04em;text-transform:uppercase;";
  const input = el("input") as HTMLInputElement;
  input.name = name;
  input.value = value;
  input.style.cssText =
    "background:#0c0c11;border:1px solid #2a2a34;color:#f0f0f7;padding:8px 10px;border-radius:4px;font:inherit;";
  row.append(l, input);
  return { row, input };
}

function fieldRow(label: string, name: string, value: string) {
  const row = el("div");
  row.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const l = el("label");
  l.textContent = label;
  l.style.cssText = "font-size:11px;color:#9a9ab0;letter-spacing:.04em;text-transform:uppercase;";
  const wrap = el("div");
  wrap.style.cssText = "display:flex;gap:8px;";
  const input = el("input") as HTMLInputElement;
  input.name = name;
  input.value = value;
  input.style.cssText =
    "flex:1;background:#0c0c11;border:1px solid #2a2a34;color:#f0f0f7;padding:8px 10px;border-radius:4px;font:inherit;";
  const trail = el("div");
  wrap.append(input, trail);
  row.append(l, wrap);
  return { row, input, trail };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}
