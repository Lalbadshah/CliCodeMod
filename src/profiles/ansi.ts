// Minimal ANSI/CSI/OSC stripper for profile parsers. We only need the
// plain-text form of a line to match against patterns; styling is irrelevant
// to a tool-event classifier.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[\d;?]*[ -/]*[@-~]|\x1b[()*+].|\x1b[=>NOMPc]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

let idSeed = 0;
export function nextId(prefix: string): string {
  idSeed = (idSeed + 1) | 0;
  return `${prefix}-${Date.now().toString(36)}-${idSeed.toString(36)}`;
}
