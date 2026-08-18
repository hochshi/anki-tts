// On-page console log, since Anki's reviewer webview has no easy devtools access.
// Wraps console.* and catches uncaught errors/rejections (e.g. wasm aborts) that
// wouldn't otherwise be visible to a user reviewing cards. Lives inside the Settings
// panel as a collapsible section (see ui.ts).
const MAX_LINES = 200;

function format(args: unknown[]): string {
  return args
    .map(a => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
}

export function logLine(level: "log" | "warn" | "error", ...args: unknown[]): void {
  const panel = document.getElementById("ttsLogPanel");
  if (!panel) return;

  panel.querySelector(".ttsLogEmpty")?.remove();

  const line = document.createElement("div");
  line.className = `ttsLogLine ${level}`;

  const time = document.createElement("span");
  time.className = "ttsLogTime";
  time.textContent = new Date().toLocaleTimeString([], { hour12: false });

  const badge = document.createElement("span");
  badge.className = "ttsLogBadge";
  badge.textContent = level;

  const msg = document.createElement("span");
  msg.className = "ttsLogMsg";
  msg.textContent = format(args);

  line.append(time, badge, msg);
  panel.appendChild(line);
  while (panel.childElementCount > MAX_LINES) panel.firstChild && panel.removeChild(panel.firstChild);
  panel.scrollTop = panel.scrollHeight;

  if (level === "error") {
    document.getElementById("ttsLogSection")?.classList.add("open");
    const body = document.getElementById("ttsLogBody") as HTMLDivElement | null;
    if (body) body.style.display = "block";
    const config = document.getElementById("ttsConfigContainer") as HTMLDivElement | null;
    if (config) config.style.display = "block";
  }
}

export function installGlobalLogging(): void {
  if ((window as any).__ttsLoggingInstalled) return;
  (window as any).__ttsLoggingInstalled = true;

  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...args) => { orig.log(...args); logLine("log", ...args); };
  console.warn = (...args) => { orig.warn(...args); logLine("warn", ...args); };
  console.error = (...args) => { orig.error(...args); logLine("error", ...args); };

  window.addEventListener("error", e => logLine("error", e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", e => logLine("error", "Unhandled rejection:", e.reason));
}
