import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalBus } from "../../bus";

export type XtermOptions = {
  theme: ITheme;
  fontFamily: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  cursorBlink?: boolean;
  scrollback?: number;
  dataTransform?: (chunk: string) => string;
};

export type XtermHandle = {
  term: Terminal;
  fit(): void;
  dispose(): void;
};

export function mountXterm(container: HTMLElement, bus: TerminalBus, opts: XtermOptions): XtermHandle {
  const term = new Terminal({
    theme: opts.theme,
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize ?? 13,
    lineHeight: opts.lineHeight ?? 1.2,
    letterSpacing: opts.letterSpacing ?? 0,
    cursorBlink: opts.cursorBlink ?? true,
    scrollback: opts.scrollback ?? 5000,
    allowProposedApi: true,
    convertEol: false,
    macOptionIsMeta: true,
    macOptionClickForcesSelection: true,
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);

  const transform = opts.dataTransform;
  const snap = bus.snapshot();
  if (snap) term.write(transform ? transform(snap) : snap);

  const offData = bus.onData((d) => term.write(transform ? transform(d) : d));
  const inputDisp = term.onData((d) => bus.sendInput(d));

  const doFit = () => {
    try {
      fit.fit();
      const cols = term.cols;
      const rows = term.rows;
      if (cols > 0 && rows > 0) bus.resize(cols, rows);
    } catch {
      /* ignore */
    }
  };

  const ro = new ResizeObserver(() => {
    doFit();
  });
  ro.observe(container);

  requestAnimationFrame(() => {
    doFit();
    term.focus();
  });

  return {
    term,
    fit: doFit,
    dispose() {
      ro.disconnect();
      offData();
      inputDisp.dispose();
      term.dispose();
    },
  };
}
