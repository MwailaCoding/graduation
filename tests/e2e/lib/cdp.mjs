import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_EDGE_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export function resolveEdgePath(overridePath) {
  const candidate = overridePath || process.env.EDGE_PATH || DEFAULT_EDGE_PATH;
  if (!fs.existsSync(candidate)) {
    throw new Error(`Microsoft Edge executable not found at: ${candidate}`);
  }
  return candidate;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePortFromWsUrl(wsUrl) {
  const parsed = new URL(wsUrl);
  return Number(parsed.port);
}

function connectWebSocketClient(wsUrl, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    let settled = false;
    let closed = false;
    const pending = new Map();
    const listeners = new Map();

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore close error on timeout
        }
        reject(new Error(`Timed out connecting to CDP WebSocket: ${wsUrl}`));
      }
    }, timeoutMs);

    function rejectAllPending(reason) {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(reason);
      }
      pending.clear();
    }

    function emit(eventName, params) {
      const set = listeners.get(eventName);
      if (!set) return;
      for (const handler of [...set]) {
        try {
          handler(params);
        } catch {
          // isolate listener exceptions
        }
      }
    }

    const client = {
      send(method, params = {}, callTimeoutMs = 15000) {
        if (closed || ws.readyState !== WebSocket.OPEN) {
          return Promise.reject(
            new Error(`CDP WebSocket is not open for ${method}`),
          );
        }
        const id = nextId++;
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            rej(new Error(`CDP command timed out (${callTimeoutMs}ms): ${method}`));
          }, callTimeoutMs);
          pending.set(id, { resolve: res, reject: rej, timer, method });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      on(eventName, handler) {
        let set = listeners.get(eventName);
        if (!set) {
          set = new Set();
          listeners.set(eventName, set);
        }
        set.add(handler);
        return () => client.off(eventName, handler);
      },
      off(eventName, handler) {
        const set = listeners.get(eventName);
        if (set) {
          set.delete(handler);
        }
      },
      once(eventName, waitTimeoutMs = 15000) {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            client.off(eventName, handler);
            rej(new Error(`Timed out waiting for CDP event: ${eventName}`));
          }, waitTimeoutMs);
          function handler(params) {
            clearTimeout(timer);
            client.off(eventName, handler);
            res(params);
          }
          client.on(eventName, handler);
        });
      },
      close() {
        if (closed) return;
        closed = true;
        rejectAllPending(new Error("CDP WebSocket closed"));
        try {
          ws.close();
        } catch {
          // ignore
        }
      },
    };

    ws.addEventListener("open", () => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        resolve(client);
      }
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(
            new Error(
              `CDP error for ${entry.method}: ${msg.error.message || JSON.stringify(msg.error)}`,
            ),
          );
        } else {
          entry.resolve(msg.result ?? {});
        }
        return;
      }
      if (msg.method) {
        emit(msg.method, msg.params ?? {});
      }
    });

    ws.addEventListener("error", () => {
      const err = new Error(`CDP WebSocket error on ${wsUrl}`);
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        reject(err);
      }
      closed = true;
      rejectAllPending(err);
    });

    ws.addEventListener("close", () => {
      closed = true;
      rejectAllPending(new Error("CDP WebSocket disconnected"));
    });
  });
}

function isProcAlive(proc) {
  return proc.exitCode === null && proc.signalCode === null;
}

function killProcTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // process may already have exited
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }
}

async function waitForProcExit(proc, timeoutMs) {
  if (!isProcAlive(proc)) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    proc.once("exit", onExit);
  });
}

async function removeDirWithRetries(dirPath, maxAttempts = 20, intervalMs = 150) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      if (!fs.existsSync(dirPath)) return;
    } catch {
      // handle locked files during Edge shutdown
    }
    if (attempt < maxAttempts) {
      await delay(intervalMs);
    }
  }
}

async function discoverBrowserWsUrl(proc, userDataDir, timeoutMs) {
  const activePortFile = path.join(userDataDir, "DevToolsActivePort");
  let stderrBuf = "";
  let earlyExitError = null;

  const onStderr = (chunk) => {
    stderrBuf += chunk.toString("utf8");
  };
  const onExit = (code, signal) => {
    earlyExitError = new Error(
      `Edge exited early (code=${code}, signal=${signal}). stderr: ${stderrBuf.trim()}`,
    );
  };

  proc.stderr?.on("data", onStderr);
  proc.once("exit", onExit);

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (earlyExitError) {
        throw earlyExitError;
      }
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\r\n]+)/);
      if (match) {
        return match[1].trim();
      }
      if (fs.existsSync(activePortFile)) {
        try {
          const lines = fs
            .readFileSync(activePortFile, "utf8")
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length >= 2 && /^\d+$/.test(lines[0])) {
            return `ws://127.0.0.1:${lines[0]}${lines[1]}`;
          }
        } catch {
          // file may still be flushing
        }
      }
      await delay(50);
    }
    throw new Error(
      `Timed out waiting for Edge DevTools endpoint (${timeoutMs}ms). stderr: ${stderrBuf.trim()}`,
    );
  } finally {
    proc.stderr?.off("data", onStderr);
    proc.off("exit", onExit);
  }
}

export async function launchEdge(options = {}) {
  const {
    edgePath: overridePath,
    headless = true,
    timeoutMs = 20000,
    extraArgs = [],
  } = options;

  const executable = resolveEdgePath(overridePath);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "grad-e2e-edge-"));

  const args = [
    ...(headless !== false ? ["--headless=new"] : []),
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    ...extraArgs,
    "about:blank",
  ];

  const proc = spawn(executable, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let browserCdp = null;
  let closePromise = null;

  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (browserCdp) {
        try {
          await browserCdp.send("Browser.close", {}, 3000);
        } catch {
          // ignore disconnect errors during close
        }
        try {
          browserCdp.close();
        } catch {
          // ignore
        }
      }
      const exited = await waitForProcExit(proc, 1500);
      if (!exited && isProcAlive(proc)) {
        killProcTree(proc.pid);
        await waitForProcExit(proc, 1000);
      }
      await removeDirWithRetries(userDataDir, 20, 150);
    })();
    return closePromise;
  }

  try {
    const browserWsUrl = await discoverBrowserWsUrl(proc, userDataDir, timeoutMs);
    const port = parsePortFromWsUrl(browserWsUrl);
    const cdpHttpBase = `http://127.0.0.1:${port}`;
    browserCdp = await connectWebSocketClient(browserWsUrl, { timeoutMs });

    async function getPageTargetWsUrl() {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const res = await fetch(`${cdpHttpBase}/json/list`);
        if (res.ok) {
          const targets = await res.json();
          const pageTarget = targets.find(
            (t) => t.type === "page" && t.webSocketDebuggerUrl,
          );
          if (pageTarget) {
            return pageTarget.webSocketDebuggerUrl;
          }
        }
        await delay(50);
      }
      throw new Error(`No CDP page target found at ${cdpHttpBase}/json/list`);
    }

    return {
      proc,
      pid: proc.pid,
      userDataDir,
      port,
      browserWsUrl,
      cdpHttpBase,
      browserCdp,
      getPageTargetWsUrl,
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}

export async function connectPage(target, options = {}) {
  const { timeoutMs = 15000 } = options;
  const wsUrl =
    typeof target === "string"
      ? target
      : await target.getPageTargetWsUrl();
  return connectWebSocketClient(wsUrl, { timeoutMs });
}

const KEY_DEFS = {
  Enter: {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    text: "\r",
    unmodifiedText: "\r",
  },
  Space: {
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
    text: " ",
    unmodifiedText: " ",
  },
  " ": {
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
    text: " ",
    unmodifiedText: " ",
  },
  Tab: {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  },
  Escape: {
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  },
  ArrowDown: {
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
  },
  ArrowUp: {
    key: "ArrowUp",
    code: "ArrowUp",
    windowsVirtualKeyCode: 38,
    nativeVirtualKeyCode: 38,
  },
  ArrowLeft: {
    key: "ArrowLeft",
    code: "ArrowLeft",
    windowsVirtualKeyCode: 37,
    nativeVirtualKeyCode: 37,
  },
  ArrowRight: {
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
    nativeVirtualKeyCode: 39,
  },
};

export async function createSession(browserOrClient, options = {}) {
  let cdp;
  let ownsClient = false;

  if (browserOrClient && typeof browserOrClient.send === "function") {
    cdp = browserOrClient;
  } else {
    cdp = await connectPage(browserOrClient, options);
    ownsClient = true;
  }

  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("DOM.enable"),
    cdp.send("Network.enable"),
    cdp.send("Log.enable"),
  ]);

  let consoleErrors = [];
  let pageErrors = [];
  let requests = [];
  let responses = [];
  let failedRequests = [];
  const pendingNavCancels = new Set();

  const offConsole = cdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      const text = (params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ");
      consoleErrors.push({ source: "console", text });
    }
  });

  const offLog = cdp.on("Log.entryAdded", (params) => {
    const entry = params.entry;
    if (entry && entry.level === "error") {
      consoleErrors.push({
        source: entry.source || "log",
        text: entry.text || "",
        url: entry.url || "",
      });
    }
  });

  const offException = cdp.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails || {};
    pageErrors.push({
      text:
        details.exception?.description ||
        details.text ||
        "Uncaught runtime exception",
      lineNumber: details.lineNumber,
      columnNumber: details.columnNumber,
    });
  });

  const offRequest = cdp.on("Network.requestWillBeSent", (params) => {
    const req = params.request || {};
    requests.push({
      requestId: params.requestId,
      url: req.url || "",
      method: (req.method || "GET").toUpperCase(),
      type: params.type || "Other",
    });
  });

  const offResponse = cdp.on("Network.responseReceived", (params) => {
    const resp = params.response || {};
    responses.push({
      requestId: params.requestId,
      url: resp.url || "",
      status: resp.status ?? 0,
      statusText: resp.statusText || "",
      mimeType: resp.mimeType || "",
      type: params.type || "Other",
    });
  });

  const offFailed = cdp.on("Network.loadingFailed", (params) => {
    failedRequests.push({
      requestId: params.requestId,
      errorText: params.errorText || "",
      canceled: Boolean(params.canceled),
      type: params.type || "Other",
    });
  });

  async function evaluate(fnOrExpr, ...args) {
    const expression =
      typeof fnOrExpr === "function"
        ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
        : String(fnOrExpr);

    const res = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (res.exceptionDetails) {
      const msg =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "Runtime.evaluate failed";
      throw new Error(msg);
    }
    return res.result ? res.result.value : undefined;
  }

  async function setViewport({
    width,
    height,
    deviceScaleFactor = 1,
    mobile = false,
  }) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
  }

  async function setCacheDisabled(disabled = true) {
    await cdp.send("Network.setCacheDisabled", {
      cacheDisabled: Boolean(disabled),
    });
  }

  function waitForNavigationComplete(timeoutMs) {
    let settled = false;
    let timer = null;
    let offLoad = () => {};
    let offSameDoc = () => {};
    let resolveFn = () => {};

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      offLoad();
      offSameDoc();
      pendingNavCancels.delete(cancel);
    };

    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFn();
    };

    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              `Timed out waiting for CDP navigation (${timeoutMs}ms)`,
            ),
          );
        }
      }, timeoutMs);

      function finish() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }

      offLoad = cdp.on("Page.loadEventFired", finish);
      offSameDoc = cdp.on("Page.navigatedWithinDocument", finish);
    });

    pendingNavCancels.add(cancel);
    return { promise, cancel };
  }

  async function goto(
    url,
    { waitFonts = true, waitImages = false, timeoutMs = 20000 } = {},
  ) {
    const { promise: loadPromise, cancel } =
      waitForNavigationComplete(timeoutMs);
    let nav;
    try {
      nav = await cdp.send("Page.navigate", { url }, timeoutMs);
    } catch (err) {
      cancel();
      throw err;
    }
    if (nav.errorText) {
      cancel();
      throw new Error(`Navigation to ${url} failed: ${nav.errorText}`);
    }
    try {
      await loadPromise;
    } catch (err) {
      cancel();
      throw err;
    }
    if (waitFonts) {
      await evaluate(() =>
        document.fonts ? document.fonts.ready.then(() => true) : true,
      );
    }
    if (waitImages) {
      await evaluate(async () => {
        const imgs = [...document.querySelectorAll("img")];
        await Promise.all(
          imgs.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              const timer = setTimeout(resolve, 4000);
              img.addEventListener(
                "load",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
              img.addEventListener(
                "error",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
            });
          }),
        );
        return true;
      });
    }
  }

  async function pressKey(key, { modifiers = 0 } = {}) {
    const def = KEY_DEFS[key] || {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      windowsVirtualKeyCode: key.length === 1 ? key.charCodeAt(0) : 0,
      nativeVirtualKeyCode: key.length === 1 ? key.charCodeAt(0) : 0,
      ...(key.length === 1 ? { text: key, unmodifiedText: key } : {}),
    };

    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      modifiers,
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.windowsVirtualKeyCode,
      nativeVirtualKeyCode: def.nativeVirtualKeyCode,
      ...(def.text ? { text: def.text, unmodifiedText: def.unmodifiedText } : {}),
    });

    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers,
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.windowsVirtualKeyCode,
      nativeVirtualKeyCode: def.nativeVirtualKeyCode,
    });
  }

  async function tab({ shift = false } = {}) {
    await pressKey("Tab", { modifiers: shift ? 8 : 0 });
  }

  async function activateFocused(key = "Enter") {
    await pressKey(key);
  }

  async function dispatchMouseClick(cx, cy) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: cx,
      y: cy,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: cx,
      y: cy,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: cx,
      y: cy,
      button: "left",
      clickCount: 1,
    });
  }

  async function clickSelector(selector) {
    const point = await evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, reason: `Selector not found: ${sel}` };
      el.scrollIntoView({ block: "center", inline: "center" });
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { found: false, reason: `Selector not visible: ${sel}` };
      }
      return {
        found: true,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
      };
    }, selector);

    if (!point || !point.found) {
      throw new Error(point?.reason || `Cannot click selector: ${selector}`);
    }
    await dispatchMouseClick(point.cx, point.cy);
  }

  async function clickElement(target, clickOpts = {}) {
    let point;
    if (typeof target === "string") {
      return clickSelector(target);
    } else if (typeof target === "function") {
      point = await evaluate(
        (fnSource) => {
          const fn = eval(`(${fnSource})`);
          let chosen = null;
          if (fn.length === 0) {
            chosen = fn();
          } else {
            const all = [...document.querySelectorAll("a, button, [role='button'], [tabindex]")];
            chosen =
              all.find((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return (
                  r.width > 0 &&
                  r.height > 0 &&
                  cs.display !== "none" &&
                  cs.visibility !== "hidden" &&
                  fn(el)
                );
              }) || null;
          }
          if (!chosen) return { found: false, reason: "Predicate matched no element" };
          chosen.scrollIntoView({ block: "center", inline: "center" });
          const rect = chosen.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return { found: false, reason: "Matched element has zero rect" };
          }
          return {
            found: true,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
          };
        },
        target.toString(),
      );
    } else if (target && typeof target === "object") {
      const {
        selector = "a, button",
        text = "",
        exact = false,
        insideSelector = null,
      } = { ...clickOpts, ...target };
      point = await evaluate(
        (sel, expectedText, isExact, containerSel) => {
          const root = containerSel
            ? document.querySelector(containerSel)
            : document;
          if (!root) {
            return { found: false, reason: `Container not found: ${containerSel}` };
          }
          const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
          const needle = norm(expectedText);
          const candidates = [...root.querySelectorAll(sel)].filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (
              r.width <= 0 ||
              r.height <= 0 ||
              cs.display === "none" ||
              cs.visibility === "hidden"
            ) {
              return false;
            }
            if (!needle) return true;
            const label = norm(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
            return isExact ? label === needle : label.includes(needle);
          });
          const el = candidates[0];
          if (!el) {
            return {
              found: false,
              reason: `Element not found for selector=${sel} text=${expectedText}`,
            };
          }
          el.scrollIntoView({ block: "center", inline: "center" });
          const rect = el.getBoundingClientRect();
          return {
            found: true,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
          };
        },
        selector,
        text,
        exact,
        insideSelector,
      );
    } else {
      throw new Error("Unsupported target passed to clickElement");
    }

    if (!point || !point.found) {
      throw new Error(point?.reason || "clickElement failed to locate visible element");
    }
    await dispatchMouseClick(point.cx, point.cy);
  }

  async function scrollTo(y) {
    return evaluate((top) => {
      window.scrollTo(0, top);
      return window.scrollY;
    }, y);
  }

  async function screenshotPng({ fullPage = false, clip } = {}) {
    if (clip) {
      const res = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      });
      return Buffer.from(res.data, "base64");
    }
    if (fullPage) {
      const dims = await evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight,
      }));
      const res = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: dims.width,
          height: dims.height,
          scale: 1,
        },
      });
      return Buffer.from(res.data, "base64");
    }
    const res = await cdp.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(res.data, "base64");
  }

  async function captureFullPagePng(targetWidth) {
    const dims = await evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    }));
    const width = targetWidth ?? dims.width;
    const res = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width,
        height: dims.height,
        scale: 1,
      },
    });
    return Buffer.from(res.data, "base64");
  }

  function getEvents() {
    return {
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      requests: [...requests],
      responses: [...responses],
      failedRequests: [...failedRequests],
    };
  }

  function clearEvents() {
    consoleErrors = [];
    pageErrors = [];
    requests = [];
    responses = [];
    failedRequests = [];
  }

  function close() {
    for (const cancel of [...pendingNavCancels]) {
      cancel();
    }
    pendingNavCancels.clear();
    offConsole();
    offLog();
    offException();
    offRequest();
    offResponse();
    offFailed();
    if (ownsClient) {
      cdp.close();
    }
  }

  return {
    cdp,
    setViewport,
    setCacheDisabled,
    goto,
    evaluate,
    pressKey,
    tab,
    activateFocused,
    clickSelector,
    clickElement,
    scrollTo,
    screenshotPng,
    captureFullPagePng,
    getEvents,
    clearEvents,
    close,
  };
}
