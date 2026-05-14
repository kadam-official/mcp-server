import process from "node:process";

type LogFn = (obj: unknown, msg?: string) => void;

const LEVELS: Record<string, number> = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? 30;

function write(level: string, obj: unknown, msg?: string) {
  if (LEVELS[level]! < threshold) return;
  const entry: Record<string, unknown> = { level, time: Date.now() };
  if (msg) entry.msg = msg;
  if (obj && typeof obj === "object") Object.assign(entry, obj);
  else if (obj) entry.msg = String(obj);
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  fatal: ((obj: unknown, msg?: string) => write("fatal", obj, msg)) as LogFn,
  error: ((obj: unknown, msg?: string) => write("error", obj, msg)) as LogFn,
  warn: ((obj: unknown, msg?: string) => write("warn", obj, msg)) as LogFn,
  info: ((obj: unknown, msg?: string) => write("info", obj, msg)) as LogFn,
  debug: ((obj: unknown, msg?: string) => write("debug", obj, msg)) as LogFn,
  trace: ((obj: unknown, msg?: string) => write("trace", obj, msg)) as LogFn,
  child: (_bindings?: Record<string, unknown>) => logger,
};

export function createToolLogger(_toolName: string) {
  return logger;
}
