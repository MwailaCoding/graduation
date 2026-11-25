import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getEphemeralPort(host = "127.0.0.1") {
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

export function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // ignore if already exited
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

export async function startNextServer(extraEnv = {}) {
  const cwd = process.cwd();
  const buildIdPath = path.join(cwd, ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) {
    throw new Error(
      "Missing .next/BUILD_ID. Run `npm run build` before starting production server tests.",
    );
  }

  const host = "127.0.0.1";
  const port = await getEphemeralPort(host);
  const baseUrl = `http://${host}:${port}`;
  const nextBin = path.resolve(cwd, "node_modules/next/dist/bin/next");

  const proc = spawn(
    process.execPath,
    [nextBin, "start", "-H", host, "-p", String(port)],
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        ...extraEnv,
      },
    },
  );

  let logs = "";
  let earlyExitErr = null;

  const onData = (chunk) => {
    logs += chunk.toString("utf8");
  };
  const onExit = (code, signal) => {
    earlyExitErr = new Error(
      `Next.js server exited early (code=${code}, signal=${signal}). Logs:\n${logs}`,
    );
  };

  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);
  proc.once("exit", onExit);

  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      if (earlyExitErr) throw earlyExitErr;
      try {
        const res = await fetch(`${baseUrl}/api/rsvp`, {
          signal: AbortSignal.timeout(5000),
        });
        await res.body?.cancel();
        if (res.status === 200) {
          return {
            baseUrl,
            port,
            proc,
            stop: async () => {
              killProcessTree(proc);
              await delay(200);
            },
          };
        }
      } catch {
        // wait and retry
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for Next.js server at ${baseUrl}. Logs:\n${logs}`);
  } catch (err) {
    killProcessTree(proc);
    throw err;
  } finally {
    proc.stdout?.off("data", onData);
    proc.stderr?.off("data", onData);
    proc.off("exit", onExit);
  }
}
