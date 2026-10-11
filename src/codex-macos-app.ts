import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const BUNDLE_ID = "com.openai.codex";
type Metadata = { CFBundleIdentifier?: unknown; CFBundleExecutable?: unknown };
export type CodexMacApplication = { appPath: string; executablePath: string };
type DiscoveryOptions = {
  processCommands?: () => Promise<string[]>;
  readMetadata?: (appPath: string) => Promise<Metadata>;
  installedApps?: () => Promise<string[]>;
};

export function appPathFromMainExecutable(command: string): string | undefined {
  return command.trim().match(/^(\/.*\.app)\/Contents\/MacOS\/[^/]+$/)?.[1];
}

async function processCommands(): Promise<string[]> {
  const { stdout } = await exec("/bin/ps", ["-axo", "comm="], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 });
  return stdout.split("\n").map(line => line.trim());
}

async function readMetadata(appPath: string): Promise<Metadata> {
  const { stdout } = await exec("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(appPath, "Contents", "Info.plist")],
    { timeout: 2000, maxBuffer: 65536 });
  const metadata = JSON.parse(stdout) as Metadata;
  if (metadata.CFBundleIdentifier === BUNDLE_ID && typeof metadata.CFBundleExecutable === "string" &&
      metadata.CFBundleExecutable && !/[/\\]/.test(metadata.CFBundleExecutable) &&
      metadata.CFBundleExecutable !== "." && metadata.CFBundleExecutable !== "..") {
    const executable = await stat(join(appPath, "Contents", "MacOS", metadata.CFBundleExecutable));
    if (!executable.isFile()) throw new Error("Invalid Codex executable");
  }
  return metadata;
}

async function installedApps(): Promise<string[]> {
  const paths: string[] = [];
  for (const root of ["/Applications", join(homedir(), "Applications")]) {
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.endsWith(".app")) paths.push(join(root, entry.name));
      }
    } catch { /* The user application directory may not exist. */ }
  }
  return paths;
}

/** Match bundle identity and the actual main executable, never the visible app name. */
export async function discoverCodexMacApplication(runningOnly = false, options: DiscoveryOptions = {}): Promise<CodexMacApplication> {
  let commands: string[] = [];
  try { commands = await (options.processCommands ?? processCommands)(); }
  catch { if (runningOnly) throw new Error("Codex process discovery failed"); }
  const running = [...new Set(commands.map(appPathFromMainExecutable).filter((path): path is string => !!path))];
  const candidates = runningOnly ? running : [...new Set([...running, ...await (options.installedApps ?? installedApps)()])];
  for (const appPath of candidates) {
    try {
      const metadata = await (options.readMetadata ?? readMetadata)(appPath);
      const name = metadata.CFBundleExecutable;
      if (metadata.CFBundleIdentifier !== BUNDLE_ID || typeof name !== "string" || !name || /[/\\]/.test(name) || name === "." || name === "..") continue;
      const executablePath = join(appPath, "Contents", "MacOS", name);
      if (running.includes(appPath) && commands.includes(executablePath)) return { appPath, executablePath };
      if (!runningOnly && !running.includes(appPath)) return { appPath, executablePath };
    } catch { /* Ignore unrelated or incomplete bundles. */ }
  }
  throw new Error(runningOnly ? "Codex is not running" : "No installed Codex application found");
}
