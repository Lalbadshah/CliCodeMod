import { app, BrowserWindow, ipcMain, net, shell } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Updater {
  start(): void;
  stop(): void;
}

export function createUpdater(window: BrowserWindow): Updater {
  return createNotifyOnlyUpdater(window);
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  assets: ReleaseAsset[];
  html_url: string;
}

export interface UpdatePayload {
  version: string;
  releaseNotes: string;
  releaseUrl: string;
  dmgPath: string | null;
  downloadUrl: string;
  downloading: boolean;
}

const POLL_INTERVAL_MS = 60 * 60 * 1000;
const WARMUP_MS = 5_000;

function createNotifyOnlyUpdater(window: BrowserWindow): Updater {
  const repo = readRepository();
  if (!repo) return noop();
  if (process.platform !== "darwin") return noop();
  if (!app.isPackaged) return noop();

  const currentVersion = app.getVersion();
  let dismissedVersion: string | null = null;
  let lastReady: UpdatePayload | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let warmupTimer: NodeJS.Timeout | null = null;
  let installing = false;
  let downloading = false;

  const send = (channel: string, payload: unknown) => {
    if (window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  const handleInstall = async () => {
    if (installing || !lastReady?.dmgPath) return;
    installing = true;
    try {
      const scriptPath = writeInstallScript(lastReady.dmgPath);
      spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" }).unref();
      setTimeout(() => app.quit(), 250);
    } catch (err) {
      installing = false;
      console.error("[updater] install failed", err);
    }
  };

  const handleDismiss = (_e: unknown, version: string) => {
    dismissedVersion = version;
    lastReady = null;
  };

  const handleOpenRelease = () => {
    if (lastReady?.releaseUrl) void shell.openExternal(lastReady.releaseUrl);
  };

  const handleSnapshot = () => lastReady;

  ipcMain.handle("update:install", handleInstall);
  ipcMain.handle("update:snapshot", handleSnapshot);
  ipcMain.on("update:dismiss", handleDismiss);
  ipcMain.on("update:open-release", handleOpenRelease);

  const check = async (): Promise<void> => {
    try {
      const release = await fetchLatestRelease(repo.owner, repo.name);
      if (!release) return;
      const latestVersion = release.tag_name.replace(/^v/, "");
      if (compareVersions(latestVersion, currentVersion) <= 0) return;
      if (latestVersion === dismissedVersion) return;

      const asset = pickDmgAsset(release.assets);
      if (!asset) return;

      const dmgPath = join(app.getPath("downloads"), asset.name);
      const alreadyDownloaded = existsSync(dmgPath);
      lastReady = {
        version: latestVersion,
        releaseNotes: release.body ?? "",
        releaseUrl: release.html_url,
        dmgPath: alreadyDownloaded ? dmgPath : null,
        downloadUrl: asset.browser_download_url,
        downloading: !alreadyDownloaded,
      };
      send("update:ready", lastReady);

      if (!alreadyDownloaded && !downloading) {
        downloading = true;
        try {
          await downloadFile(asset.browser_download_url, dmgPath);
          if (lastReady && lastReady.version === latestVersion) {
            lastReady = { ...lastReady, dmgPath, downloading: false };
            send("update:ready", lastReady);
          }
        } catch (err) {
          console.error("[updater] download failed", err);
          if (lastReady && lastReady.version === latestVersion) {
            lastReady = { ...lastReady, downloading: false };
            send("update:ready", lastReady);
          }
        } finally {
          downloading = false;
        }
      }
    } catch {
      // Silent — never bother the user with poll/network errors.
    }
  };

  return {
    start() {
      if (warmupTimer || pollTimer) return;
      warmupTimer = setTimeout(() => {
        warmupTimer = null;
        void check();
        pollTimer = setInterval(() => void check(), POLL_INTERVAL_MS);
      }, WARMUP_MS);
    },
    stop() {
      if (warmupTimer) clearTimeout(warmupTimer);
      if (pollTimer) clearInterval(pollTimer);
      warmupTimer = null;
      pollTimer = null;
      try {
        ipcMain.removeHandler("update:install");
        ipcMain.removeHandler("update:snapshot");
      } catch { /* already removed */ }
      ipcMain.removeListener("update:dismiss", handleDismiss);
      ipcMain.removeListener("update:open-release", handleOpenRelease);
    },
  };
}

function noop(): Updater {
  return { start() {}, stop() {} };
}

function readRepository(): { owner: string; name: string } | null {
  try {
    const pkgPath = join(app.getAppPath(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    if (typeof raw !== "string") return null;
    const match = raw.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i);
    if (!match) return null;
    return { owner: match[1], name: match[2] };
  } catch {
    return null;
  }
}

function fetchLatestRelease(owner: string, name: string): Promise<ReleaseInfo | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: "GET",
      url: `https://api.github.com/repos/${owner}/${name}/releases/latest`,
    });
    req.setHeader("User-Agent", "cli-mods-updater");
    req.setHeader("Accept", "application/vnd.github+json");
    let data = "";
    req.on("response", (res) => {
      if (res.statusCode !== 200) {
        res.on("data", () => {});
        res.on("end", () => resolve(null));
        return;
      }
      res.on("data", (chunk) => { data += chunk.toString("utf8"); });
      res.on("end", () => {
        try { resolve(JSON.parse(data) as ReleaseInfo); }
        catch { resolve(null); }
      });
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = destPath + ".partial";
    const ws = createWriteStream(tmp);
    const req = net.request({ method: "GET", url });
    req.setHeader("User-Agent", "cli-mods-updater");
    req.on("response", (res) => {
      if (res.statusCode !== 200) {
        ws.destroy();
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      res.on("data", (chunk) => ws.write(chunk));
      res.on("end", () => {
        ws.end();
        ws.on("close", () => {
          try {
            renameSync(tmp, destPath);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function pickDmgAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const dmgs = assets.filter((a) => a.name.toLowerCase().endsWith(".dmg"));
  if (dmgs.length === 0) return null;
  const universal = dmgs.find((a) => /universal/i.test(a.name));
  return universal ?? dmgs[0];
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function writeInstallScript(dmgPath: string): string {
  const scriptPath = join(tmpdir(), `cli-mods-update-${Date.now()}.sh`);
  const dmg = shellQuote(dmgPath);
  const script = `#!/usr/bin/env bash
set -e
sleep 2
DMG=${dmg}
ATTACH_OUT="$(hdiutil attach -nobrowse -readonly "$DMG")"
MNT="$(printf '%s\\n' "$ATTACH_OUT" | awk '/\\/Volumes\\// {sub(/^.*\\/Volumes\\//, "/Volumes/"); print; exit}')"
if [ -z "$MNT" ]; then exit 1; fi
APP="$MNT/CLI Mods.app"
if [ ! -d "$APP" ]; then hdiutil detach "$MNT" -quiet || true; exit 1; fi
rm -rf "/Applications/CLI Mods.app"
cp -R "$APP" /Applications/
hdiutil detach "$MNT" -quiet || true
xattr -dr com.apple.quarantine "/Applications/CLI Mods.app" || true
open -a "CLI Mods"
`;
  writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
