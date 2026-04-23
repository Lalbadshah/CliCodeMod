import { stripAnsi } from "./ansi";

// Splits a PTY byte stream into plain-text lines. Handles \r\n and bare \r
// the way a terminal renders them:
//   - Split on \n.
//   - Strip one trailing \r.
//   - If internal \r appears (in-place redraws like spinners), take only the
//     content after the last \r on the line (i.e. the final rendered state).
// The returned closure buffers a partial trailing line until a newline arrives.
export function makeLineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let buf = "";
  return (chunk: string): void => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const cr = line.lastIndexOf("\r");
      if (cr !== -1) line = line.slice(cr + 1);
      onLine(stripAnsi(line));
    }
  };
}
