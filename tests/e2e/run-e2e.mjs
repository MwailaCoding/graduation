import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const TIER_FILES = {
  1: "tests/e2e/tier1-features.test.mjs",
  2: "tests/e2e/tier2-boundaries.test.mjs",
  3: "tests/e2e/tier3-combinations.test.mjs",
  4: "tests/e2e/tier4-journeys.test.mjs",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFlagValue(flagName, rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error(`Missing or empty value for ${flagName}`);
  }
  return trimmed;
}

function formatErrorCause(err) {
  const parts = [];
  if (err instanceof Error) {
    parts.push(err.message);
    const cause = err.cause;
    if (cause && typeof cause === "object") {
      if ("code" in cause && cause.code) {
        parts.push(String(cause.code));
      }
      if ("message" in cause && cause.message) {
        parts.push(String(cause.message));
      }
      if ("errors" in cause && Array.isArray(cause.errors)) {
        for (const sub of cause.errors) {
          if (sub && typeof sub === "object") {
            if ("code" in sub && sub.code) parts.push(String(sub.code));
            if ("message" in sub && sub.message) parts.push(String(sub.message));
          }
        }
      }
    }
  } else {
    parts.push(String(err));
  }
  return [...new Set(parts.filter(Boolean))].join("; ");
}

function parseCliArgs(argv) {
  const result = {
    tiers: null,
    startServer: false,
    serverMode: null,
    baseUrl: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--start-server") {
      result.startServer = true;
    } else if (arg.startsWith("--tier=")) {
      result.tiers = readFlagValue("--tier", arg.slice("--tier=".length));
    } else if (arg === "--tier") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("Missing or empty value for --tier");
      }
      result.tiers = readFlagValue("--tier", argv[++i]);
    } else if (arg.startsWith("--server-mode=")) {
      result.serverMode = readFlagValue(
        "--server-mode",
        arg.slice("--server-mode=".length),
      );
    } else if (arg === "--server-mode") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("Missing or empty value for --server-mode");
      }
      result.serverMode = readFlagValue("--server-mode", argv[++i]);
    } else if (arg.startsWith("--base-url=")) {
      result.baseUrl = readFlagValue(
        "--base-url",
        arg.slice("--base-url=".length),
      );
    } else if (arg === "--base-url") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("Missing or empty value for --base-url");
      }
      result.baseUrl = readFlagValue("--base-url", argv[++i]);
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  let selectedTiers = [1, 2, 3, 4];
  if (result.tiers !== null) {
    selectedTiers = result.tiers.split(",").map((s) => {
      const token = s.trim();
      return token === "" ? NaN : Number(token);
    });
    if (
      selectedTiers.length === 0 ||
      selectedTiers.some(
        (n) => !Number.isInteger(n) || !Object.hasOwn(TIER_FILES, n),
      )
    ) {
      throw new Error(
        `Invalid --tier value "${result.tiers}". Expected 1, 2, 3, 4, or comma-separated subset.`,
      );
    }
  }

  if (
    result.serverMode !== null &&
    result.serverMode !== "start" &&
    result.serverMode !== "dev"
  ) {
    throw new Error(
      `Invalid --server-mode "${result.serverMode}". Expected "start" or "dev".`,
    );
  }

  return {
    selectedTiers,
    startServer: result.startServer,
    serverMode: result.serverMode,
    baseUrl: result.baseUrl,
  };
}

function getEphemeralPort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // process may already have exited
    }
  } else {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      proc.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function resolveServerTimeoutMs(serverMode) {
  const defaultTimeoutMs = serverMode === "dev" ? 150000 : 30000;
  const raw = process.env.E2E_SERVER_TIMEOUT_MS?.trim();
  if (!raw) {
    return defaultTimeoutMs;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `Invalid E2E_SERVER_TIMEOUT_MS "${raw}". Expected a positive integer.`,
    );
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid E2E_SERVER_TIMEOUT_MS "${raw}". Expected a positive integer.`,
    );
  }
  return parsed;
}

function validateBaseUrl(baseUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error(
      `Invalid --base-url / BASE_URL "${baseUrl}". Expected a valid http: or https: URL.`,
    );
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(
      `Invalid URL protocol "${parsedUrl.protocol}" in "${baseUrl}". Expected http: or https:.`,
    );
  }
  return parsedUrl;
}

async function verifyServerReachable(baseUrl) {
  try {
    const res = await fetch(baseUrl, {
      signal: AbortSignal.timeout(3000),
    });
    await res.body?.cancel();
  } catch (err) {
    const detail = formatErrorCause(err);
    throw new Error(
      `Target server at ${baseUrl} is unreachable (${detail}). Start the server or pass --start-server.`,
    );
  }
}

async function waitForServerReady(baseUrl, serverProc, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let earlyExitErr = null;
  let serverLogs = "";
  let lastStatusInfo = "no response received";

  const onData = (chunk) => {
    serverLogs += chunk.toString("utf8");
  };
  const onExit = (code, signal) => {
    earlyExitErr = new Error(
      `Next.js server exited early (code=${code}, signal=${signal}). Output:\n${serverLogs}`,
    );
  };

  serverProc.stdout?.on("data", onData);
  serverProc.stderr?.on("data", onData);
  serverProc.once("exit", onExit);

  try {
    while (Date.now() < deadline) {
      if (earlyExitErr) throw earlyExitErr;
      const perReqTimeoutMs = Math.min(
        timeoutMs > 30000 ? 30000 : 15000,
        Math.max(1000, deadline - Date.now()),
      );
      try {
        const res = await fetch(baseUrl, {
          signal: AbortSignal.timeout(perReqTimeoutMs),
        });
        await res.body?.cancel();
        if (res.status === 200) {
          return;
        }
        lastStatusInfo = `HTTP ${res.status}`;
      } catch (err) {
        lastStatusInfo = formatErrorCause(err);
      }
      if (Date.now() < deadline) {
        await delay(250);
      }
    }
    if (earlyExitErr) throw earlyExitErr;
    throw new Error(
      `Timed out waiting for server at ${baseUrl} (${timeoutMs}ms; last status/error: ${lastStatusInfo}). Output:\n${serverLogs}`,
    );
  } finally {
    serverProc.stdout?.off("data", onData);
    serverProc.stderr?.off("data", onData);
    serverProc.off("exit", onExit);
  }
}

async function main() {
  const cwd = process.cwd();
  const parsed = parseCliArgs(process.argv.slice(2));

  let baseUrl = parsed.baseUrl ?? (process.env.BASE_URL?.trim() || null);
  let parsedBaseUrl = null;
  if (baseUrl !== null) {
    parsedBaseUrl = validateBaseUrl(baseUrl);
  }

  let serverProc = null;
  let activeTestProc = null;
  let cleaningUp = false;

  const cleanup = () => {
    if (cleaningUp) return;
    cleaningUp = true;
    killProcessTree(activeTestProc);
    killProcessTree(serverProc);
  };

  const onSignal = (sig) => {
    cleanup();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    if (parsed.startServer) {
      const hasBuild = fs.existsSync(path.join(cwd, ".next", "BUILD_ID"));
      const serverMode = parsed.serverMode || (hasBuild ? "start" : "dev");

      if (serverMode === "start" && !hasBuild) {
        console.error(
          "Error: --server-mode=start requested, but .next/BUILD_ID does not exist. Run `npm run build` first or pass `--server-mode=dev`.",
        );
        process.exitCode = 1;
        return;
      }

      const timeoutMs = resolveServerTimeoutMs(serverMode);

      let host = "127.0.0.1";
      let port;
      if (parsedBaseUrl) {
        host = parsedBaseUrl.hostname || "127.0.0.1";
        port =
          Number(parsedBaseUrl.port) ||
          (parsedBaseUrl.protocol === "https:" ? 443 : 80);
      } else {
        port = await getEphemeralPort(host);
        baseUrl = `http://${host}:${port}`;
      }

      const nextBin = path.resolve(cwd, "node_modules/next/dist/bin/next");
      console.log(
        `[run-e2e] Starting Next.js (${serverMode}) on ${baseUrl}...`,
      );
      serverProc = spawn(
        process.execPath,
        [nextBin, serverMode, "-H", host, "-p", String(port)],
        {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      );

      await waitForServerReady(baseUrl, serverProc, timeoutMs);
      console.log(`[run-e2e] Server ready at ${baseUrl}`);
    } else {
      if (!baseUrl) {
        baseUrl = "http://127.0.0.1:3000";
      }
      await verifyServerReachable(baseUrl);
    }

    const childEnv = {
      ...process.env,
      BASE_URL: baseUrl,
    };

    let allPassed = true;
    for (const tierNum of parsed.selectedTiers) {
      const file = TIER_FILES[tierNum];
      console.log(`\n[run-e2e] Running Tier ${tierNum}: ${file}`);
      const res = await new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          ["--test", "--test-reporter=spec", file],
          {
            cwd,
            stdio: "inherit",
            env: childEnv,
          },
        );
        activeTestProc = child;
        child.on("exit", (code, signal) => {
          activeTestProc = null;
          resolve({ code: code ?? 1, signal });
        });
      });

      if (res.code !== 0) {
        allPassed = false;
        console.error(
          `[run-e2e] Tier ${tierNum} failed (exit=${res.code}, signal=${res.signal})`,
        );
      }
    }

    process.exitCode = allPassed ? 0 : 1;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    cleanup();
  }
}

await main();
