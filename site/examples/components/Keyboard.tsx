"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Semitones of the white keys, in order, inside one octave. */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
/** The black keys: a semitone, and the white key it sits after. */
const BLACK_KEYS = [
  { semitone: 1, after: 0 },
  { semitone: 3, after: 1 },
  { semitone: 6, after: 3 },
  { semitone: 8, after: 4 },
  { semitone: 10, after: 5 },
];

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/**
 * The tracker layout every DAW uses: the `z` row is the lowest octave, the `q`
 * row the one above it. Values are semitones from the keyboard's base note.
 */
const COMPUTER_KEYS: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  q: 12,
  "2": 13,
  w: 14,
  "3": 15,
  e: 16,
  r: 17,
  "5": 18,
  t: 19,
  "6": 20,
  y: 21,
  "7": 22,
  u: 23,
};

const noteName = (midi: number) =>
  NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

/**
 * A playable keyboard: pointer events and the computer keyboard turned into
 * `onNoteOn`/`onNoteOff` with MIDI numbers.
 *
 * It holds no synth and no audio - it is the input device, so every instrument
 * page can use it. Which note is down is its own state, because a key held by
 * the computer keyboard and a key held by a pointer have to look the same.
 */
export function Keyboard({
  baseNote = 48,
  octaves = 2,
  computerKeys = true,
  onNoteOn,
  onNoteOff,
}: {
  /** MIDI number of the leftmost key. Default 48 (C3). */
  baseNote?: number;
  /** Default 2. */
  octaves?: number;
  /** Whether the `z`/`q` rows play. Default true. */
  computerKeys?: boolean;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}) {
  const [held, setHeld] = useState<ReadonlySet<number>>(() => new Set());
  const heldRef = useRef(new Set<number>());

  // The handlers change on every render of the page that owns the synth, and
  // resubscribing the window listeners on each of those would drop keys.
  const handlers = useRef({ onNoteOn, onNoteOff });
  handlers.current = { onNoteOn, onNoteOff };

  const noteOn = useCallback((note: number) => {
    if (heldRef.current.has(note)) return;
    heldRef.current.add(note);
    setHeld(new Set(heldRef.current));
    handlers.current.onNoteOn(note);
  }, []);

  const noteOff = useCallback((note: number) => {
    if (!heldRef.current.delete(note)) return;
    setHeld(new Set(heldRef.current));
    handlers.current.onNoteOff(note);
  }, []);

  useEffect(() => {
    if (!computerKeys) return;

    const isTyping = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    };
    const semitone = (event: KeyboardEvent) =>
      event.metaKey || event.ctrlKey || event.altKey || isTyping(event)
        ? undefined
        : COMPUTER_KEYS[event.key.toLowerCase()];

    const down = (event: KeyboardEvent) => {
      // Auto-repeat is not a second note-on: the key never came up.
      if (event.repeat) return;
      const offset = semitone(event);
      if (offset !== undefined) noteOn(baseNote + offset);
    };
    const up = (event: KeyboardEvent) => {
      const offset = semitone(event);
      if (offset !== undefined) noteOff(baseNote + offset);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [baseNote, computerKeys, noteOn, noteOff]);

  // A note whose key vanishes - the example rebuilds, the tab is left - has no
  // release coming, so the keyboard sends it on the way out.
  useEffect(
    () => () => {
      for (const note of heldRef.current) handlers.current.onNoteOff(note);
      heldRef.current.clear();
    },
    [],
  );

  const whites: number[] = [];
  const blacks: { note: number; position: number }[] = [];
  for (let octave = 0; octave < octaves; octave++) {
    for (const semitone of WHITE_KEYS) {
      whites.push(baseNote + octave * 12 + semitone);
    }
    for (const { semitone, after } of BLACK_KEYS) {
      blacks.push({
        note: baseNote + octave * 12 + semitone,
        position: octave * 7 + after + 1,
      });
    }
  }
  const width = 100 / whites.length;

  const keyProps = (note: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      // Without this the browser starts a text selection and the pointer-up
      // never lands on the key.
      event.preventDefault();
      noteOn(note);
    },
    onPointerUp: () => noteOff(note),
    onPointerLeave: () => noteOff(note),
    onPointerCancel: () => noteOff(note),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <div className="relative h-32 select-none touch-none" role="group">
      <div className="flex h-full w-full">
        {whites.map((note) => (
          <button
            key={note}
            aria-label={noteName(note)}
            className={
              "flex-1 border border-fd-border rounded-b flex items-end justify-center pb-1 text-[10px] " +
              (held.has(note)
                ? "bg-fd-primary text-fd-primary-foreground"
                : "bg-white text-neutral-500")
            }
            {...keyProps(note)}
          >
            {note % 12 === 0 ? noteName(note) : ""}
          </button>
        ))}
      </div>
      <div className="absolute inset-0 pointer-events-none">
        {blacks.map(({ note, position }) => (
          <button
            key={note}
            aria-label={noteName(note)}
            className={
              "absolute top-0 h-2/3 rounded-b border border-neutral-900 pointer-events-auto " +
              (held.has(note) ? "bg-fd-primary" : "bg-neutral-900")
            }
            style={{
              left: `${position * width}%`,
              width: `${width * 0.6}%`,
              transform: "translateX(-50%)",
            }}
            {...keyProps(note)}
          />
        ))}
      </div>
    </div>
  );
}
