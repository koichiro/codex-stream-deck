import assert from "node:assert/strict";
import test from "node:test";
import { discoverCodexMacApplication } from "../src/codex-macos-app.js";

const metadata = { CFBundleIdentifier: "com.openai.codex", CFBundleExecutable: "ChatGPT" };
test("finds renamed running Codex by bundle identity and executable", async () => {
  const appPath = "/Users/tester/Applications/My Codex.app";
  const executablePath = `${appPath}/Contents/MacOS/ChatGPT`;
  assert.deepEqual(await discoverCodexMacApplication(true, {
    processCommands: async () => [executablePath], readMetadata: async () => metadata
  }), { appPath, executablePath });
});

test("ChatGPT.app is accepted only when its bundle ID is Codex", async () => {
  const appPath = "/Applications/ChatGPT.app";
  const options = { processCommands: async () => [`${appPath}/Contents/MacOS/ChatGPT`] };
  assert.equal((await discoverCodexMacApplication(true, { ...options, readMetadata: async () => metadata })).appPath, appPath);
  await assert.rejects(discoverCodexMacApplication(true, {
    ...options, readMetadata: async () => ({ ...metadata, CFBundleIdentifier: "com.openai.chat" })
  }), /not running/);
});

test("renderer or other executables cannot prove the Codex main process is running", async () => {
  await assert.rejects(discoverCodexMacApplication(true, {
    processCommands: async () => ["/Applications/Codex.app/Contents/MacOS/Other"],
    readMetadata: async () => metadata
  }), /not running/);
});

test("usage discovery prefers the running bundle over installed copies", async () => {
  const appPath = "/Applications/ChatGPT.app";
  assert.equal((await discoverCodexMacApplication(false, {
    processCommands: async () => [`${appPath}/Contents/MacOS/ChatGPT`],
    installedApps: async () => ["/Applications/Codex.app"], readMetadata: async () => metadata
  })).appPath, appPath);
});

test("closed app discovery uses verified installed bundles but running-only discovery does not", async () => {
  const options = { processCommands: async () => [], installedApps: async () => ["/Users/tester/Applications/Codex.app"], readMetadata: async () => metadata };
  assert.equal((await discoverCodexMacApplication(false, options)).appPath, "/Users/tester/Applications/Codex.app");
  await assert.rejects(discoverCodexMacApplication(true, options), /not running/);
});

test("rejects an executable path escaping the bundle", async () => {
  await assert.rejects(discoverCodexMacApplication(false, {
    processCommands: async () => [], installedApps: async () => ["/Applications/Codex.app"],
    readMetadata: async () => ({ ...metadata, CFBundleExecutable: "../Other" })
  }), /No installed/);
});
