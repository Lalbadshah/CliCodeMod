// Structured event stream parsed from a CLI agent's PTY output.
// Mods subscribe via `bus.onTool(cb)` to react to tool use without
// re-parsing xterm's buffer themselves.

export type ToolStatus = "ok" | "error" | "cancelled" | "pending";

export type ToolEvent =
  | {
      type: "tool_start";
      id: string;
      name: string;
      args?: string;
      rawLine: string;
      ts: number;
    }
  | {
      type: "tool_output";
      id: string;
      toolId: string;
      text: string;
      ts: number;
    }
  | {
      type: "tool_end";
      id: string;
      toolId: string;
      name: string;
      status?: ToolStatus;
      summary?: string;
      ts: number;
    }
  | {
      type: "assistant";
      id: string;
      text: string;
      ts: number;
    }
  | {
      type: "turn";
      id: string;
      label?: string;
      ts: number;
    };

export type ToolEventEmit = (event: ToolEvent) => void;

export interface ProfileParser {
  parse(chunk: string): void;
  flush(): void;
  reset(): void;
}

export interface Profile {
  readonly id: string;
  readonly name: string;
  matches(binary: string): boolean;
  createParser(emit: ToolEventEmit): ProfileParser;
}
