#!/usr/bin/env node
//
// Every lesson makes a sound, and stops making one when the reader leaves.
//
// A tutorial is a sequence, and a lesson that loads silent, throws in the
// console, or leaves a worklet running is a reader who stops. None of that is
// visible in a build log: the page renders, the links resolve, the tests pass,
// and only somebody opening the page in order finds out. Four chapter plans in
// a row ended by describing this pass in prose - open each lesson in headless
// Chromium, read `window.__learn__`, press Play, navigate away - in four
// slightly different forms, with four different floors, and nobody could run it
// from a clean checkout without writing it again. This is that paragraph.
//
//   npm --prefix site run check:sound
//   node site/scripts/check-learn-sound.mjs --url http://127.0.0.1:3000
//   node site/scripts/check-learn-sound.mjs --only /learn/sound --floor -60
//   node site/scripts/check-learn-sound.mjs --list
//   node site/scripts/check-learn-sound.mjs --export out
//
// What it asserts, on every page under `/learn` in reading order:
//
//   1. The page arrives silent - `level()` is exactly `-Infinity`, because
//      before any interaction no probe is registered at all.
//   2. Nothing is left live from the page before it - `live()` is 0.
//   3. Every widget makes a sound: Play, then a gate press, then the `z` key,
//      then a sweep of the sliders the lesson shows, until the level rises
//      above the floor inside the budget.
//   4. The console carries nothing but the allowlist below.
//
// **It runs against `next dev`, and that is forced rather than preferred.**
// `test-hooks.ts` gates itself on `process.env.NODE_ENV !== "production"`,
// webpack inlines that, and `next build` always sets it - so an exported page
// has no `window.__learn__` to read. `next start` is not an option either:
// `next.config.mjs` sets `output: "export"` unconditionally and Next refuses to
// serve an exported build. The runtime under test is the same code in both
// builds; what differs is the hooks (the thing being read), StrictMode's
// double-mounted effects (which `trackLive`'s `released` guard nets out) and
// dev-only console chatter (which `IGNORED` names). The *export* is checked by
// `check:links`, and by `--export` below.
//
// `next dev` writes `site/.next`, which is the directory `DEPLOY=true next
// build` writes too. Hold the same lock for a run of this as for a build when
// more than one agent is working in the checkout.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { chromium } from "playwright-core";

const SITE = resolve(import.meta.dirname, "..");
const CONTENT = join(SITE, "content", "learn");

/** The section this walks. Everything else in the site is somebody else's. */
const SECTION = "/learn";

/** `next.config.mjs` serves the whole site from a subdirectory. */
const DEFAULT_BASE = "/synthlet";

/** A route rather than content, so discovery cannot find it in `content/`. */
const PLAYGROUND = `${SECTION}/playground`;

/**
 * Console messages that are not this check's business, each with its reason.
 *
 * An entry here is a claim that the message is harmless *and why*, in the same
 * spirit as `check-learn-links.mjs`'s ALLOWLIST. A message is matched against
 * its text and the URL it came from, because Chrome reports a failed request as
 * "Failed to load resource: …" and puts the file in the location.
 */
const IGNORED = [
  {
    pattern: /favicon\.ico/,
    why: "the document asks for /favicon.ico, which is outside the base path",
  },
  {
    pattern: /Download the React DevTools/,
    why: "dev-only advice, and an `info` in any case",
  },
];

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};

const has = (name) => process.argv.includes(name);

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** The first line of anything that was thrown, for a one-line report. */
const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** `ready`, or `blocked: <what it waits for>`, or nothing. */
function statusOf(file) {
  if (!file || !isFile(file)) return undefined;
  try {
    return matter(readFileSync(file, "utf8")).data?.status;
  } catch {
    return undefined;
  }
}

/** Every `.mdx` under `content/learn`, at any depth. */
function mdxFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (isDirectory(path)) found.push(...mdxFiles(path));
    else if (entry.endsWith(".mdx")) found.push(path);
  }
  return found;
}

/**
 * The URL a content file is served at.
 *
 * The same arithmetic `learn/chrome/lesson-patches.ts` does, for the same
 * reason it is this simple: the tutorial's chapters are plain folders.
 * `sound/index.mdx` is the chapter, `index.mdx` is the map.
 */
function urlOf(file) {
  const parts = relative(CONTENT, file).split(sep);
  const last = parts.pop().replace(/\.mdx$/, "");
  if (last !== "index") parts.push(last);
  return parts.length === 0 ? SECTION : `${SECTION}/${parts.join("/")}`;
}

/**
 * Every page under `/learn`, in reading order, with what it declares.
 *
 * Two sources that have to agree. The `meta.json` files hold the *order*, which
 * is the order a reader meets the pages in; the `.mdx` files on disk hold the
 * *membership*. A file that is in no `meta.json` is invisible to the reader and
 * to this check, so it is a failure rather than an extra page.
 *
 * A chapter contributes its front door whether or not it wrote an `index.mdx`:
 * `app/learn/chapter-page.tsx` exports one route per chapter folder, and a page
 * that exists is a page that can carry a console error.
 */
function discover() {
  const pages = [];
  const missing = [];

  const add = (url, file) =>
    pages.push({ url, file, status: statusOf(file), sourced: Boolean(file) });

  add(SECTION, join(CONTENT, "index.mdx"));

  const top = readJson(join(CONTENT, "meta.json"));
  for (const entry of top?.pages ?? []) {
    const folder = join(CONTENT, entry);

    if (isDirectory(folder)) {
      const intro = join(folder, "index.mdx");
      add(`${SECTION}/${entry}`, isFile(intro) ? intro : undefined);

      const chapter = readJson(join(folder, "meta.json"));
      for (const name of chapter?.pages ?? []) {
        const file = join(folder, `${name}.mdx`);
        if (!isFile(file)) {
          missing.push(
            `${entry}/meta.json lists "${name}", which is not a file`,
          );
          continue;
        }
        add(`${SECTION}/${entry}/${name}`, file);
      }
      continue;
    }

    const file = join(CONTENT, `${entry}.mdx`);
    if (isFile(file)) {
      add(`${SECTION}/${entry}`, file);
      continue;
    }

    // A chapter `content/learn/meta.json` plans and nobody has written yet.
    // `chrome/tree.ts` renders it on the map as a chapter to come; it is not a
    // route, so it is not a page, and it is not a failure either.
  }

  add(PLAYGROUND, undefined);

  const known = new Set(pages.map((page) => page.url));
  const orphans = mdxFiles(CONTENT)
    .filter((file) => !known.has(urlOf(file)))
    .map((file) => `${relative(CONTENT, file)} is in no meta.json`);

  return { pages, problems: [...missing, ...orphans] };
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

function freePort() {
  return new Promise((ok, no) => {
    const socket = createSocketServer();
    socket.on("error", no);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close(() => ok(port));
    });
  });
}

async function answers(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * `next dev` on a port nobody else has.
 *
 * `detached`, because Next 14's dev command runs its compiler in a child and
 * killing only the parent leaves the port held; the teardown kills the whole
 * process group. The first page compile is the slowest thing in the run, so how
 * long it took is printed rather than hidden.
 */
async function startDevServer(base) {
  const port = await freePort();
  const child = spawn(
    "npx",
    ["--no-install", "next", "dev", "--port", String(port)],
    { cwd: SITE, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );

  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));

  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone, which is the state we wanted.
    }
  };

  const origin = `http://127.0.0.1:${port}`;
  const began = Date.now();
  const deadline = began + 120_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    if (await answers(`${origin}${base}${SECTION}`)) {
      const seconds = ((Date.now() - began) / 1000).toFixed(0);
      console.log(
        `check-learn-sound: dev server ready on ${port} in ${seconds} s.`,
      );
      return { origin, stop };
    }
    await sleep(500);
  }

  stop();
  console.error(
    `check-learn-sound: next dev never answered ${origin}${base}${SECTION}.\n\n${log.trim()}\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

/**
 * A browser, from wherever this machine keeps one.
 *
 * `playwright-core` downloads nothing on install - which is the whole reason it
 * is the dependency and `playwright` is not - so the browser is resolved here,
 * at run time, in the order that is right for both a developer's Mac and a
 * GitHub runner. A missing browser must not read like a silent lesson, so all
 * three fixes are printed rather than the last error.
 */
async function launchBrowser(headed) {
  const args = ["--autoplay-policy=no-user-gesture-required"];
  if (process.env.CI) args.push("--no-sandbox", "--disable-dev-shm-usage");

  const tries = [];
  if (process.env.CHROME_PATH) {
    tries.push({
      what: `CHROME_PATH (${process.env.CHROME_PATH})`,
      fix: "point CHROME_PATH at a Chrome or Chromium binary that runs",
      options: { executablePath: process.env.CHROME_PATH },
    });
  }
  tries.push({
    what: "the system Google Chrome",
    fix: "install Google Chrome, or set CHROME_PATH",
    options: { channel: "chrome" },
  });
  tries.push({
    what: "a Chromium in the ms-playwright cache",
    fix: "npx playwright install chromium",
    options: {},
  });

  const refused = [];
  for (const attempt of tries) {
    try {
      const browser = await chromium.launch({
        headless: !headed,
        args,
        ...attempt.options,
      });
      return { browser, using: attempt.what };
    } catch (error) {
      refused.push({ ...attempt, why: firstLine(error) });
    }
  }

  console.error("check-learn-sound: found no browser to run in.\n");
  for (const attempt of refused) {
    console.error(`  ${attempt.what}: ${attempt.why}`);
    console.error(`    ${attempt.fix}`);
  }
  console.error(
    "\nThis is a missing browser, not a silent lesson. See\n" +
      'site/learn/README.md, "Every lesson makes a sound".',
  );
  process.exit(1);
}

/**
 * The page's loudest widget, in dBFS.
 *
 * `-Infinity` crosses the protocol as a token rather than as JSON, and the
 * whole on-load assertion turns on the difference between "silent" and "very
 * quiet", so it is sent as `null` and rebuilt here rather than trusted to a
 * serializer. `undefined` means the page installed no hooks at all.
 */
async function levelOf(page) {
  const db = await page.evaluate(() => {
    const hooks = window.__learn__;
    if (!hooks) return "none";
    const value = hooks.level();
    return value === -Infinity ? null : value;
  });
  if (db === "none") return undefined;
  return db === null ? -Infinity : db;
}

/** Built synths plus live meter taps, or `undefined` where there are no hooks. */
async function liveOf(page) {
  const count = await page.evaluate(() => window.__learn__?.live() ?? "none");
  return count === "none" ? undefined : count;
}

async function until(test, ms, step = 50) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await test()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(step);
  }
}

/**
 * Get to `url`, by clicking a link to it when the page has one.
 *
 * This is the whole reason the walk is one page in reading order rather than a
 * worker per lesson: `page.goto` destroys the JavaScript context, so `live()`
 * on arrival would be 0 whatever the lesson before it did, and the leak
 * assertion would mean nothing. A **client-side** navigation is what makes "a
 * synth not disposed on unmount fails on the next lesson" true.
 *
 * `a[rel="next"]` is the link the chrome renders for exactly this journey
 * (`chrome/lesson-chrome.tsx`), so it is tried first. Any other link to the
 * same page - a chapter's lesson list, the map's chapter list - is the same
 * kind of navigation and is taken when there is no `rel="next"` to take, which
 * is what keeps the chapter boundaries soft. A page nothing links to is loaded.
 */
async function arrive(page, origin, base, url, first) {
  const to = `${origin}${base}${url}`;

  if (!first) {
    const hrefs = [`${base}${url}`, `${base}${url}/`];
    const selectors = [
      hrefs.map((href) => `a[rel="next"][href="${href}"]`).join(", "),
      hrefs.map((href) => `a[href="${href}"]`).join(", "),
    ];

    for (const selector of selectors) {
      const link = page.locator(selector).first();
      try {
        if ((await link.count()) === 0) continue;
        if (!(await link.isVisible())) continue;
        await link.click({ timeout: 5000 });
        await page.waitForURL(
          (current) =>
            current.pathname.replace(/\/$/, "") === `${base}${url}` ||
            current.pathname === `${base}${url}`,
          { timeout: 15_000 },
        );
        return "soft";
      } catch {
        // The link moved, or the route did not settle. A hard load still
        // checks the page; the summary's soft count is what notices a run
        // that lost them all.
      }
    }
  }

  await page.goto(to, { waitUntil: "load" });
  return "hard";
}

/**
 * Unmount this page's widgets inside the app before leaving it for good.
 *
 * The leak assertion is made on arrival and is only worth anything after a
 * client-side navigation, and reading order does not always give one. The last
 * lesson of a chapter is followed, in the book, by the next chapter's front
 * door; the chrome links it to the next chapter's first *lesson*. So the page
 * that has to be loaded is loaded - but not before the reader's own exit has
 * been taken and what it left behind has been looked at.
 *
 * Which is not a nicety. Ticket 06c is a throw out of the meter's effect
 * cleanup that only happens on an in-app unmount, and the one lesson in the
 * section whose widget shows a meter is the only lesson in its chapter: with
 * reading order alone, the pass walked straight past it.
 */
async function leaveSoftly(page, base) {
  const link = page.locator('a[rel="next"]').first();
  if ((await link.count()) === 0) return undefined;

  const href = (await link.getAttribute("href"))?.replace(/\/$/, "");
  if (!href || !href.startsWith(base)) return undefined;

  try {
    await link.click({ timeout: 5000 });
    await page.waitForURL(
      (current) => current.pathname.replace(/\/$/, "") === href,
      { timeout: 15_000 },
    );
  } catch {
    return undefined;
  }

  const clean = await until(async () => (await liveOf(page)) === 0, 1000);
  return { href, clean, left: await liveOf(page) };
}

/**
 * Press a gate until it sounds, or until the budget runs out.
 *
 * `Gate` answers `pointerdown`, not a bare `click` (`kit/controls/Gate.tsx`),
 * which is why this is a hover and a mouse pair. It is a loop rather than one
 * press because the markup does not say which kind of gate this is: a `hold`
 * sounds for as long as the pointer is down, and a `trigger` is a 20 ms pulse
 * whose envelope may have decayed before the next poll.
 */
async function pressGate(page, gate, rise, budget) {
  const deadline = Date.now() + budget;
  const left = () => Math.max(0, deadline - Date.now());

  do {
    await gate.hover();
    await page.mouse.down();
    const sounded = await rise(Math.min(400, left()));
    await page.mouse.up();
    if (sounded) return true;
    if (await rise(Math.min(150, left()))) return true;
  } while (Date.now() < deadline);

  return false;
}

/**
 * Sweep each of the lesson's sliders to both ends.
 *
 * The last rung, and the one that saves a lesson whose *default is a null*.
 * `filters/comb` is the example that made this necessary: its prose says "it is
 * almost silent" of the setting it opens on, because a 5 ms delay cancels a
 * 100 Hz sine, and a check that demanded sound from the default state would be
 * demanding that the lesson stop teaching its point. Moving a knob the lesson
 * chose to show is the reader's next gesture in that situation, so it is this
 * one's. `End` and `Home`, because a range input answers them natively - a real
 * event, not a value written past React.
 */
async function sweepSliders(page, widget, rise, budget) {
  const sliders = widget.locator('[data-kind="slider"] input[type="range"]');
  const count = await sliders.count();
  const deadline = Date.now() + budget;
  const left = () => Math.max(0, deadline - Date.now());

  for (let at = 0; at < count && Date.now() < deadline; at++) {
    const slider = sliders.nth(at);
    await slider.focus();
    for (const end of ["End", "Home"]) {
      await slider.press(end);
      if (await rise(Math.min(400, left()))) return true;
    }
  }

  return false;
}

/**
 * How long a Stop needs before the page reads quiet again.
 *
 * Not the 20 ms the output gain ramps in. `level()` is the maximum over every
 * probe, and one of them is `MeterView`'s `LevelMeter` peak, which is a meter
 * and so has ballistics: it falls at `releaseDbPerSecond`, 8.7 dB/s by default
 * (`packages/level-meter/src/index.ts`), after parking at a new maximum for
 * `holdMs`. From a patch's usual −18 dBFS to a −60 floor is five seconds, and
 * from a loud one, eight.
 */
const QUIET_MS = 8000;

/**
 * One widget: make it sound, then make it stop.
 *
 * The stop matters as much as the sound. `level()` is a page-wide maximum
 * (`kit/test-hooks.ts`), so a second widget on the same page would otherwise
 * pass on the first widget's noise - `isolate` is that case, and the only one
 * that waits for the meter to fall. Where nothing follows, the Stop is still
 * clicked (a page must not be left making a noise) but the reading afterwards
 * is the meter's ballistics rather than the patch's, and is not evidence.
 */
async function playWidget(page, widget, floor, riseMs, isolate) {
  const id = (await widget.getAttribute("data-patch")) ?? "?";
  const play = widget
    .locator('button[aria-label="Play"], button[aria-label="Stop"]')
    .first();

  if ((await play.count()) === 0) {
    return { id, ok: false, why: "has no Play button" };
  }
  if (await play.isDisabled()) {
    // `PlayToggle` disables itself on `failed`, and `useLessonPatch` has
    // already written `learn: <id> failed to build` to the console.
    return {
      id,
      ok: false,
      why: "Play is disabled - the patch failed to build",
    };
  }

  let peak = -Infinity;
  const rise = (ms) =>
    until(
      async () => {
        const db = await levelOf(page);
        if (db !== undefined && db > peak) peak = db;
        return db !== undefined && db > floor;
      },
      ms,
      25,
    );

  const before = (await liveOf(page)) ?? 0;
  await play.click();

  // Built before judged silent. Nothing is built until the reader touches the
  // widget, and the first build after a hard load also pays for
  // `registerAllWorklets` (`app/audio-context.ts`) - which is the second in
  // `--rise-ms`, and is not lesson latency. Waiting for it here is what lets
  // each rung of the ladder below have a budget of its own.
  const built = await until(
    async () => ((await liveOf(page)) ?? 0) > before,
    riseMs,
  );
  if (!built) {
    return { id, ok: false, why: `nothing was built ${riseMs} ms after Play` };
  }

  let rung = "Play";
  let sounded = await rise(riseMs);

  // Play opens the compound's output gain, and an envelope, a keyboard or an
  // arpeggiator patch is still silent until a note. These are the two gestures
  // the kit has that make one. Never an arrow key: `chrome/LessonKeys.tsx`
  // turns those into a page.
  if (!sounded) {
    const gate = widget.locator('[data-kind="gate"] button').first();
    if ((await gate.count()) > 0) {
      rung = "a gate press";
      sounded = await pressGate(page, gate, rise, riseMs);
    }
  }
  if (!sounded) {
    rung = "the z key";
    await page.keyboard.down("z");
    sounded = await rise(riseMs);
    await page.keyboard.up("z");
  }
  if (!sounded) {
    rung = "a slider swept";
    sounded = await sweepSliders(page, widget, rise, riseMs);
  }

  const stop = widget.locator('button[aria-label="Stop"]');
  if ((await stop.count()) > 0) await stop.click();
  const quiet = await until(
    async () => {
      const db = await levelOf(page);
      return db !== undefined && db < floor;
    },
    isolate ? QUIET_MS : 100,
    50,
  );

  if (!sounded) {
    return {
      id,
      ok: false,
      why: `silent ${riseMs} ms after Play, a gate press, a key and a slider sweep`,
    };
  }
  if (isolate && !quiet) {
    return {
      id,
      ok: false,
      why: `still above the floor ${QUIET_MS} ms after Stop, so the next widget on this page cannot be measured`,
    };
  }
  return { id, ok: true, peak, rung };
}

/** Everything wrong with the console since the last arrival. */
function consoleFailures(messages) {
  return messages.filter(
    (message) => !IGNORED.some(({ pattern }) => pattern.test(message.text)),
  );
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

async function walk({ pages, origin, base, floor, riseMs, headed }) {
  const { browser, using } = await launchBrowser(headed);
  console.log(`check-learn-sound: driving ${using}.`);

  const context = await browser.newContext();
  const page = await context.newPage();

  let messages = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    messages.push({
      text: `${message.text()} ${message.location()?.url ?? ""}`.trim(),
    });
  });
  page.on("pageerror", (error) =>
    messages.push({ text: `uncaught: ${firstLine(error)}` }),
  );

  const failures = [];
  let widgets = 0;
  let soft = 0;
  /** The page the walk is arriving from, so a leak can name both slugs. */
  let came;

  try {
    for (const [index, target] of pages.entries()) {
      messages = [];
      const problems = [];
      const sounds = [];

      // A page that throws out of the driver - a navigation that never lands, a
      // control that vanishes mid-press - is one failing page, not the end of
      // the run. The next page arrives with a hard load, which resyncs.
      let transition;
      try {
        transition = await arrive(page, origin, base, target.url, index === 0);
      } catch (error) {
        console.log(`  FAIL  ${target.url}  unreachable`);
        failures.push(
          `${target.url}  could not be opened: ${firstLine(error)}`,
        );
        continue;
      }
      if (transition === "soft") soft += 1;

      try {
        const live = await liveOf(page);
        if (live === undefined) {
          // Nothing on this page imported the kit, so there is nothing to
          // leak and nothing to read. A page *with* a widget that says this
          // is the whole-run failure below.
        } else {
          const level = await levelOf(page);
          if (level !== -Infinity) {
            problems.push(`arrived at ${level.toFixed(1)} dBFS, not silent`);
          }
          const clean = await until(
            async () => (await liveOf(page)) === 0,
            1000,
          );
          if (!clean) {
            const left = await liveOf(page);
            // Both slugs, because the page that failed is not the page with
            // the bug: a widget that does not tear down is found by whoever
            // comes after it.
            problems.push(
              `${left} live object${left === 1 ? "" : "s"} arrived from ${came ?? "the page before"}`,
            );
          }
        }

        const blocked = /^blocked:/.test(target.status ?? "");

        // A widget fetches its own patch (02c), so `figure[data-patch]` arrives
        // a moment after the page does and `kit/Patch.tsx` holds its place with
        // a frame that says so. Wait for the last of those to go before
        // counting: a lesson whose chunk was still in the air would otherwise
        // be read as a lesson with no widget, which is silently a pass.
        const loaded = await until(
          async () =>
            (await page.locator("[data-patch-loading]").count()) === 0,
          10_000,
        );
        if (!loaded) {
          problems.push("a widget was still loading its patch after 10 s");
        }

        const frames = page.locator("figure[data-patch]");
        const count = await frames.count();

        if (blocked) {
          const placeholder = await page
            .locator("[data-blocked-patch]")
            .count();
          if (placeholder === 0) {
            problems.push("is blocked but renders no placeholder");
          }
          if (count > 0) {
            problems.push(`is blocked but renders ${count} widgets`);
          }
        } else {
          if (count > 0 && live === undefined) {
            console.error(
              "check-learn-sound: no window.__learn__ on a page with a widget -\n" +
                "is this a production build? The hooks are gated on NODE_ENV in\n" +
                "site/learn/kit/test-hooks.ts, so this check needs `next dev`.",
            );
            process.exit(1);
          }

          for (let at = 0; at < count; at++) {
            widgets += 1;
            const result = await playWidget(
              page,
              frames.nth(at),
              floor,
              riseMs,
              at < count - 1,
            );
            if (result.ok) {
              sounds.push(
                `${result.id} ${result.peak.toFixed(1)} dBFS, ${result.rung}`,
              );
            } else {
              problems.push(`(${result.id})  ${result.why}`);
            }
          }
        }
        // Something was built here and the next page in reading order is not
        // where this page's `Next` goes, so this page would be left by a hard
        // load and its teardown would never run in the app. Take the reader's
        // exit first.
        const next = pages[index + 1];
        const linked = next
          ? (await page
              .locator(`a[href="${base}${next.url}"]`)
              .first()
              .count()) > 0
          : false;
        if (sounds.length > 0 && next && !linked) {
          const left = await leaveSoftly(page, base);
          if (left) {
            soft += 1;
            if (!left.clean) {
              problems.push(
                `left ${left.left} live object${left.left === 1 ? "" : "s"} behind on ${left.href}`,
              );
            }
          }
        }
      } catch (error) {
        problems.push(`the driver gave up on this page: ${firstLine(error)}`);
      }

      for (const message of consoleFailures(messages)) {
        problems.push(`console: ${message.text}`);
      }

      if (problems.length === 0) {
        const what = sounds.length > 0 ? sounds.join("; ") : "no widget";
        console.log(`  ok    ${target.url}  ${transition}  ${what}`);
      } else {
        console.log(`  FAIL  ${target.url}  ${transition}`);
        for (const problem of problems) {
          failures.push(`${target.url}  ${problem}`);
        }
      }

      came = target.url;
    }
  } finally {
    await browser.close();
  }

  return { failures, widgets, soft };
}

// ---------------------------------------------------------------------------
// The export owes the test nothing
// ---------------------------------------------------------------------------

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

/** `<path>.html`, then `<path>/index.html`, then the literal file. */
function candidates(dir, path) {
  const clean = path.replace(/\/+$/, "") || "/index";
  return [
    join(dir, `${clean}.html`),
    join(dir, clean, "index.html"),
    join(dir, clean),
  ];
}

/** A static host, as `check-learn-links.mjs` already documents one. */
async function serveExport(dir, base) {
  const port = await freePort();
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url.split("?")[0]);
    // On a path boundary, not on a prefix: `/synthlet.txt` is a sibling of the
    // base path, not a file inside it, and a host that confused the two would
    // answer requests this one is supposed to 404.
    const inBase = path === base || path.startsWith(`${base}/`);
    const within = inBase ? path.slice(base.length) || "/" : path;
    const file = candidates(dir, within).find(isFile);
    if (!file) {
      response.writeHead(404).end("not found");
      return;
    }
    const extension = file.slice(file.lastIndexOf("."));
    response.writeHead(200, {
      "content-type": TYPES.get(extension) ?? "application/octet-stream",
    });
    response.end(readFileSync(file));
  });

  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  return {
    origin: `http://127.0.0.1:${port}`,
    stop: () => server.close(),
  };
}

/**
 * The deployed export installs no `window.__learn__` at all.
 *
 * A grep would be the obvious implementation and would be wrong. Webpack folds
 * `hooksEnabled` to a constant and minifies around it, so the module's text
 * survives with the assignment intact and unreachable - in one export,
 * `out/_next/static/chunks/327-….js` reads `let a=!1; … function r(){!i&&a&&
 * (i=!0,window.__learn__=…)}`. The only honest assertion is behavioural: load
 * the page and ask the page.
 */
async function checkExport(dir, base, pages, headed) {
  const out = resolve(dir);
  if (!isFile(join(out, "index.html"))) {
    console.error(
      `check-learn-sound: ${out} does not look like an export (no index.html).\n` +
        "Build the site first: DEPLOY=true npm --prefix site run build",
    );
    process.exit(1);
  }

  const lesson = pages.find((page) => page.url.split("/").length === 4);
  const wanted = [SECTION, lesson?.url].filter(Boolean);

  const { browser, using } = await launchBrowser(headed);
  console.log(`check-learn-sound: driving ${using}.`);
  const server = await serveExport(out, base);
  const page = await browser.newPage();

  const thrown = [];
  page.on("pageerror", (error) => thrown.push(firstLine(error)));

  const problems = [];
  try {
    for (const url of wanted) {
      thrown.length = 0;
      await page.goto(`${server.origin}${base}${url}`, { waitUntil: "load" });
      // The hooks install on import, so what matters is that the client bundle
      // ran. A beat after load is what that costs.
      await sleep(500);
      const installed = await page.evaluate(
        () => typeof window.__learn__ !== "undefined",
      );
      if (installed) problems.push(`${url} installed window.__learn__`);
      for (const error of thrown) problems.push(`${url} threw: ${error}`);
    }
  } finally {
    await browser.close();
    server.stop();
  }

  if (problems.length === 0) {
    console.log("check-learn-sound: the export installs no test hooks.");
    process.exit(0);
  }

  console.error(
    `check-learn-sound: the export ships the test hooks.\n\n` +
      problems.map((problem) => `  ${problem}`).join("\n") +
      "\n\nThe gate is `hooksEnabled` in site/learn/kit/test-hooks.ts:\n" +
      '`process.env.NODE_ENV !== "production"`, which webpack inlines. If that\n' +
      "line changed, or something now imports the hooks outside it, a visitor\n" +
      "downloads a global that exists for a test they are not running.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const base = flag("--base", DEFAULT_BASE);
const floor = Number(flag("--floor", "-60"));
const riseMs = Number(flag("--rise-ms", "3000"));
const only = flag("--only", undefined);
const exportDir = flag("--export", undefined);
const url = flag("--url", undefined);
const headed = has("--headed");

const { pages: everything, problems } = discover();

// A checker that quietly checks nothing passes forever. Both halves of
// discovery have to agree, and there has to be something there at all.
if (problems.length > 0) {
  console.error(
    `check-learn-sound: the tutorial's order and its files disagree.\n\n` +
      problems.map((problem) => `  ${problem}`).join("\n") +
      "\n\nA lesson that is in no meta.json is invisible to the reader as well\n" +
      "as to this check, and a meta.json entry with no file is a dead link.",
  );
  process.exit(1);
}

const lessons = everything.filter((page) => page.url.split("/").length === 4);
if (lessons.length === 0) {
  console.error(
    `check-learn-sound: found no lessons under ${CONTENT}.\n` +
      "Either the section is not there, or the meta.json files no longer look\n" +
      "the way this script expects. Both need looking at.",
  );
  process.exit(1);
}

const pages = only
  ? everything.filter((page) => page.url.startsWith(only))
  : everything;

if (pages.length === 0) {
  console.error(`check-learn-sound: --only ${only} matched no page.`);
  process.exit(1);
}

if (has("--list")) {
  for (const page of pages) {
    const note =
      page.status && page.status !== "ready" ? `  (${page.status})` : "";
    console.log(`  ${page.url}${note}`);
  }
  console.log(
    `check-learn-sound: ${pages.length} pages, ${lessons.length} lessons.`,
  );
  process.exit(0);
}

if (exportDir) {
  await checkExport(exportDir, base, everything, headed);
}

let server = { origin: url, stop: () => {} };
if (!url) server = await startDevServer(base);

// Ctrl-C has to leave no `next` holding the port, which is the whole reason the
// child is a process group.
process.on("SIGINT", () => {
  server.stop();
  process.exit(130);
});

let result;
try {
  result = await walk({
    pages,
    origin: server.origin,
    base,
    floor,
    riseMs,
    headed,
  });
} finally {
  server.stop();
}

const { failures, widgets, soft } = result;

if (failures.length === 0) {
  console.log(
    `check-learn-sound: ${pages.length} pages, ${widgets} widgets, ` +
      `${soft} soft transitions, all sound.`,
  );
  process.exit(0);
}

console.error(
  `\ncheck-learn-sound: ${failures.length} failure${
    failures.length === 1 ? "" : "s"
  } of ${pages.length} pages.\n`,
);
for (const failure of failures) console.error(`  ${failure}`);
console.error(
  "\nA leak - live objects arriving from the page before - is a compound whose\n" +
    "`dispose()` does not tear down everything it made, and it fails on\n" +
    "somebody else's lesson. A silent widget is usually a patch that does not\n" +
    "end in a gain, so Play has nothing to open, or a patch that needs a note\n" +
    "and shows no gate, keyboard or slider for this to touch. A disabled Play is a\n" +
    "`ready` that never resolved, and the console says which patch. A dirty\n" +
    "console is most often a hydration error - markup the browser will not accept,\n" +
    "which React answers by re-rendering the document.\n\n" +
    "What this does *not* catch is a misspelled `exposes` name: `useLessonPatch`\n" +
    "swallows a dead accessor on purpose, so the control does nothing and the page\n" +
    "still sounds. Rule 3 in `learn/rules.test.ts` owns that one.",
);
process.exit(1);
