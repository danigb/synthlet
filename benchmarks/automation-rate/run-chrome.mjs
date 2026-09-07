// Runs the automation-rate benchmark in headless Chrome and prints JSON.
//
// Zero dependencies: a small static server, Chrome's own remote-debugging
// endpoint, and Node's global WebSocket (Node >= 22).
//
//   node benchmarks/automation-rate/run-chrome.mjs [--out results.json] [--head]
//   node benchmarks/automation-rate/run-chrome.mjs --probe [--out probe.json]
//
// --probe runs probe.js instead: the focused check of what an AudioWorklet
// actually receives when a node is connected to one of its AudioParams.
//
// For Firefox or Safari, serve this directory and open index.html by hand -
// there is no cross-browser driver here and adding one would mean adding a
// dependency this repo does not otherwise carry.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const headless = !args.includes("--head");
// --probe runs the focused param-delivery probe instead of the timing matrix.
const probe = args.includes("--probe");
const PAGE = probe ? "probe.html" : "index.html";
const READY = probe ? "window.__probe ? 1 : 0" : "window.__caseCount ?? 0";
const ENTRY = probe ? "window.__probe()" : "window.__run()";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const name = (req.url === "/" ? "/index.html" : req.url).split("?")[0];
      try {
        const body = await readFile(join(HERE, name.replace(/^\/+/, "")));
        res.writeHead(200, {
          "content-type": TYPES[extname(name)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });
}

async function poll(fn, { tries = 100, delay = 200, what = "condition" } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`timed out waiting for ${what}`);
}

class CDP {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(url) {
    const cdp = new CDP();
    cdp.#ws = new WebSocket(url);
    cdp.#ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      const p = cdp.#pending.get(msg.id);
      if (!p) return;
      cdp.#pending.delete(msg.id);
      msg.error
        ? p.reject(new Error(JSON.stringify(msg.error)))
        : p.resolve(msg.result);
    });
    await new Promise((resolve, reject) => {
      cdp.#ws.addEventListener("open", resolve, { once: true });
      cdp.#ws.addEventListener(
        "error",
        () => reject(new Error("CDP connect failed")),
        {
          once: true,
        },
      );
    });
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description ??
          JSON.stringify(r.exceptionDetails),
      );
    }
    return r.result.value;
  }

  close() {
    try {
      this.#ws.close();
    } catch {
      /* already gone */
    }
  }
}

async function main() {
  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/${PAGE}`;
  const profile = await mkdtemp(join(tmpdir(), "synthlet-bench-"));
  const debugPort = 9333 + Math.floor(Math.random() * 400);

  const chrome = spawn(
    CHROME,
    [
      headless ? "--headless=new" : "--new-window",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--autoplay-policy=no-user-gesture-required",
      url,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  chrome.stderr.on("data", (b) => {
    const s = String(b);
    if (/error|fail/i.test(s) && !/DevTools listening/.test(s)) {
      process.stderr.write(`[chrome] ${s}`);
    }
  });

  let cdp;
  try {
    const target = await poll(
      async () => {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        const list = await res.json();
        return list.find((t) => t.type === "page" && t.url.startsWith(url));
      },
      { what: "the benchmark page" },
    );

    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");

    const count = await poll(() => cdp.eval(READY), {
      what: "the page script to load",
    });
    process.stderr.write(
      `running ${probe ? "probe" : count + " cases"} in headless Chrome…\n`,
    );

    const data = await cdp.eval(ENTRY, { awaitPromise: true });

    const json = JSON.stringify(data, null, 2);
    if (outPath) {
      await writeFile(outPath, json + "\n");
      process.stderr.write(`wrote ${outPath}\n`);
    }
    process.stdout.write(json + "\n");
  } finally {
    cdp?.close();
    chrome.kill("SIGKILL");
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
