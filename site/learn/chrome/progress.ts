"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * How far you have read.
 *
 * No account, no server, no analytics: the tutorial keeps the set of lesson
 * urls you have opened in `localStorage` and nothing else. It is a convenience,
 * not a record - losing it costs a reader a tick on a list - and treating it as
 * one is what keeps the section a static export.
 *
 * Two properties everything below exists for:
 *
 * - **Nothing is rendered from it until the browser has it.** `ready` is state
 *   set in an effect, not a value read during render, so the exported HTML
 *   contains no progress at all and hydration cannot mismatch. Every component
 *   that shows progress returns `null` while `ready` is false.
 * - **Every read and write is guarded.** `localStorage` throws on access in a
 *   private window and in a browser with site data blocked, and a tutorial that
 *   goes blank because of a storage setting is worse than one with no ticks.
 */

const KEY = "learning-synthlet.visited";

/**
 * One parse for the whole page.
 *
 * The map renders a tick per lesson, and eleven chapters of them would
 * otherwise each read and parse the same string. The cache is also what lets a
 * lesson marking itself visited update a list that is already on screen.
 */
let cache: Set<string> | undefined;

const listeners = new Set<() => void>();

function load(): Set<string> {
  try {
    const stored = window.localStorage.getItem(KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function read(): Set<string> {
  cache ??= load();
  return cache;
}

function save(visited: Set<string>) {
  cache = visited;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...visited]));
  } catch {
    // A reader with storage switched off still gets the tutorial; they just do
    // not get the ticks.
  }
  for (const listener of listeners) listener();
}

export interface Progress {
  /** False on the server and on the first client render. */
  ready: boolean;
  visited: ReadonlySet<string>;
  /** Remember a lesson url. Idempotent. */
  mark: (url: string) => void;
  clear: () => void;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

export function useProgress(): Progress {
  const [visited, setVisited] = useState<Set<string> | undefined>(undefined);

  useEffect(() => {
    const update = () => setVisited(new Set(read()));
    update();

    listeners.add(update);
    // Another tab of the same tutorial is the same reader.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== KEY) return;
      cache = undefined;
      update();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const mark = useCallback((url: string) => {
    const current = read();
    if (current.has(url)) return;
    save(new Set(current).add(url));
  }, []);

  const clear = useCallback(() => {
    save(new Set());
  }, []);

  return {
    ready: visited !== undefined,
    visited: visited ?? EMPTY,
    mark,
    clear,
  };
}
