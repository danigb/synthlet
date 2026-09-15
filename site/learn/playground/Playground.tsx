"use client";

import { useEffect, useState } from "react";
import { PlaygroundRig } from "./PlaygroundRig";
import { decodePlaygroundState, type PlaygroundState } from "./state";

/*
 * The link, read once.
 *
 * `window.location.hash` does not exist while the page is being built, and a
 * first client render that disagreed with the exported HTML would be a hydration
 * error in everybody's console. So the rig renders at its defaults first -
 * exactly what the export contains - and the link is read in an effect, which is
 * the same rule the progress bar follows in `learn/chrome`. Nothing has been
 * built at that point (a Playground, like a lesson, arrives having built
 * nothing), so the swap costs an audio graph nothing.
 *
 * The rig is keyed on the seed, because it hands that seed to a ref on its first
 * render and a ref does not take a second one.
 */

const DEFAULTS: PlaygroundState = {};

export function Playground() {
  const [seed, setSeed] = useState<PlaygroundState>(DEFAULTS);
  const [read, setRead] = useState(false);

  useEffect(() => {
    setSeed(decodePlaygroundState(window.location.hash));
    setRead(true);
  }, []);

  return <PlaygroundRig key={read ? "link" : "defaults"} seed={seed} />;
}
