// DON'T EDIT THIS FILE unless inside scripts/_voices.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Which voice sounds which note, and which note a monosynth sounds.
//
// Two independent questions, so two independent factories:
//
//   createVoiceAllocator  which *slot* plays a note, when there are n slots
//   createNoteStack       which *note* should sound, when only one can
//
// Yarns keeps the same separation - one note stack drives mono priority and
// the arpeggiator, a separate voice allocator drives polyphony - and it is
// what lets an arpeggiator be "no new state": it reads the stack the mono
// priority already maintains.
//
// This file is pure. It has no imports, it knows nothing about the audio
// graph, and it never asks what time it is: every decision is made from the
// order in which notes arrived. The caller owns the clock.
//
// ## What "touched" means
//
// The allocator keeps one monotonically increasing counter and stamps a slot
// with it on every event that concerns that slot - a note starting on it, a
// note ending on it, a note being retriggered on it. That stamp is the slot's
// *touch*. "Least recently touched" therefore means least recently *involved*,
// which is not the same as least recently *started*: a voice whose key went up
// a moment ago is more recently touched than one still being held from a
// minute ago. That is deliberate, and it is stmlib's rule
// (`voice_allocator.h`: `NoteOff` calls `Touch`). It makes the slots that
// released longest ago the first to be reused, which is what "the voice most
// likely to be silent" means when you cannot ask.
//
// ## Why "released" is a proxy for "silent"
//
// The honest question - is this voice still making sound? - cannot be answered
// here. The envelope that would know lives on the audio thread, behind a
// message port, and it does not report its end. stmlib does not ask either: it
// asks only whether the key is up, and takes the one that has been up longest.
// A released voice may still be in a long release tail, and taking it will cut
// that tail short; the owner of the pool is expected to fade the slot's gain
// before it writes the new note, which is why `Allocation` reports a steal and
// names the note that lost. That fade, not a silence test, is the whole
// click-avoidance strategy.
//
// ## Where each rule comes from
//
// - The three ordered rules of `noteOn` - reuse, then least-recently-touched
//   released, then steal - and `noteOff` clearing the active bit and touching
//   the slot: stmlib `algorithms/voice_allocator.h`, MIT, (c) 2012 Emilie
//   Gillet. The algorithm is followed; the data structure is not copied (its
//   LRU permutation array becomes a counter here, because the shuffling loop
//   exists to avoid a comparison that JavaScript gives away free).
// - `StealMode.Protect`: JUCE's `Synthesiser::findVoiceToSteal`, described
//   from its documentation - the lowest and the highest sounding note are
//   protected, and the oldest of the rest is taken - so that a bass line and a
//   melody both survive a dense chord.
// - The four mono priorities and the claim that they are not reducible to each
//   other: Sound On Sound, *Synth Secrets* Part 18, "Priorities & Triggers"
//   (Gordon Reid, October 2000). `Last` is the default because it is the only
//   one that always speaks on the beat.
// - The two orderings of the note stack, and eviction of the least recently
//   played note on overflow: stmlib `algorithms/note_stack.h`. The intrusive
//   linked list becomes two flat arrays: at a capacity of 16 a linear scan
//   beats pointer chasing, and the shifting is what keeps both orders exact.
//
// ## No allocation in the hot path
//
// After construction, `noteOn`, `noteOff`, `push` and `remove` allocate
// nothing: every array is a typed array sized once, and every insertion and
// removal is a shift within it. The readers (`noteOn`'s `Allocation`, and the
// stack's `top`/`sorted`/`played`) each return one small object, which is the
// only allocation any of this performs. That matters because this file is
// written to be copied into a worklet one day, where a per-block allocation is
// a per-block garbage collection.

/** What to do when every voice is busy and another note arrives. */
export enum StealMode {
  /** Take the oldest voice that is neither the lowest nor the highest note. */
  Protect = 0,
  /** Take the least recently touched voice. */
  Lru = 1,
  /** Take the most recently touched voice. */
  Mru = 2,
  /** Take nothing: the note does not sound. */
  Drop = 3,
}

/** Which held note a monophonic instrument sounds. */
export enum NotePriority {
  /** The most recently pressed. The only one that always speaks on the beat. */
  Last = 0,
  /** The lowest pitch held. American monosynths: Minimoog, ARP. */
  Low = 1,
  /** The highest pitch held. Japanese monosynths: Korg 700S, Roland SH09. */
  High = 2,
  /** The first still-held note pressed. */
  First = 3,
}

/**
 * What `noteOn` did.
 *
 * `reused` means the note was already sounding on that slot and the slot is
 * expected to retrigger rather than start. `stolen` means a note that was
 * still being held lost its voice, and names it: the pool has to fade that
 * slot down before it writes the new note, and it cannot know what to fade
 * unless it is told.
 */
export type Allocation =
  | { index: number; reused: boolean; stolen: false }
  | { index: number; reused: false; stolen: true; stolenNote: number }
  | null;

export type VoiceAllocatorOptions = {
  /** Default `StealMode.Protect`. */
  steal?: StealMode;
  /**
   * Whether a note already sounding reuses its voice. Default `true`, which is
   * the keyboard-instrument answer. A plucked string wants `false`: a repeated
   * note is a second string, not a retrigger of the first.
   */
  sameNoteReuse?: boolean;
};

export type VoiceAllocator = {
  /** Assign a voice to `note`, touching whichever slot it returns. */
  noteOn(note: number): Allocation;
  /** Release `note`, touching its slot. Returns the slot, or -1. */
  noteOff(note: number): number;
  /** Forget everything: no slot is active, and the touch order resets. */
  clear(): void;
  /** The note a slot is sounding with its key still down, or -1. */
  activeNote(index: number): number;
  /** Whether a slot's key is still down. */
  isActive(index: number): boolean;
};

/**
 * A fixed pool of `size` voice slots, and the rule for which one plays next.
 *
 * ```ts
 * const voices = createVoiceAllocator(8);
 * const a = voices.noteOn(60); // { index: 0, reused: false, stolen: false }
 * voices.noteOff(60);          // 0
 * ```
 */
export function createVoiceAllocator(
  size: number,
  options: VoiceAllocatorOptions = {},
): VoiceAllocator {
  const mode = options.steal ?? StealMode.Protect;
  const sameNoteReuse = options.sameNoteReuse ?? true;
  const count = Math.max(0, size | 0);

  // One note and one active bit per slot, plus the touch stamp. `notes` holds
  // the last note assigned to a slot whether or not its key is still down;
  // `active` is what makes it a sounding note rather than a memory.
  const notes = new Int16Array(count).fill(-1);
  const active = new Uint8Array(count);
  // Float64 rather than Int32: the stamp is exact to 2^53, which at one event
  // per millisecond is a few hundred thousand years of playing.
  const touch = new Float64Array(count);
  let clock = 0;

  /** The slot to take when every slot is active. Never -1 when `count > 0`. */
  function victim(): number {
    if (mode === StealMode.Mru) {
      let index = 0;
      for (let i = 1; i < count; i++) {
        if (touch[i] > touch[index]) index = i;
      }
      return index;
    }

    if (mode === StealMode.Protect && count > 2) {
      // JUCE's rule: the outer voices are the ones a listener is following.
      let low = 0;
      let high = 0;
      for (let i = 1; i < count; i++) {
        if (notes[i] < notes[low]) low = i;
        if (notes[i] > notes[high]) high = i;
      }
      let index = -1;
      for (let i = 0; i < count; i++) {
        if (i === low || i === high) continue;
        if (index === -1 || touch[i] < touch[index]) index = i;
      }
      // Fewer than three distinct slots survive the exclusion only when the
      // pool is tiny; falling through to LRU is what keeps Protect from ever
      // refusing to allocate.
      if (index !== -1) return index;
    }

    let index = 0;
    for (let i = 1; i < count; i++) {
      if (touch[i] < touch[index]) index = i;
    }
    return index;
  }

  return {
    noteOn(note: number): Allocation {
      if (count === 0) return null;

      // 1. The voice already sounding this note retriggers it.
      if (sameNoteReuse) {
        for (let i = 0; i < count; i++) {
          if (active[i] && notes[i] === note) {
            touch[i] = ++clock;
            return { index: i, reused: true, stolen: false };
          }
        }
      }

      // 2. The released voice that has been released longest.
      let index = -1;
      for (let i = 0; i < count; i++) {
        if (active[i]) continue;
        if (index === -1 || touch[i] < touch[index]) index = i;
      }
      if (index !== -1) {
        notes[index] = note;
        active[index] = 1;
        touch[index] = ++clock;
        return { index, reused: false, stolen: false };
      }

      // 3. Everything is held: steal, or refuse.
      if (mode === StealMode.Drop) return null;
      index = victim();
      const stolenNote = notes[index];
      notes[index] = note;
      active[index] = 1;
      touch[index] = ++clock;
      return { index, reused: false, stolen: true, stolenNote };
    },

    noteOff(note: number): number {
      // The most recently touched slot holding it, so that two voices on one
      // note (`sameNoteReuse: false`) release in the order a keyboard would
      // pair them: last down, first up.
      let index = -1;
      for (let i = 0; i < count; i++) {
        if (!active[i] || notes[i] !== note) continue;
        if (index === -1 || touch[i] > touch[index]) index = i;
      }
      if (index === -1) return -1;
      active[index] = 0;
      touch[index] = ++clock;
      return index;
    },

    clear(): void {
      notes.fill(-1);
      active.fill(0);
      touch.fill(0);
      clock = 0;
    },

    activeNote(index: number): number {
      if (index < 0 || index >= count || !active[index]) return -1;
      return notes[index];
    },

    isActive(index: number): boolean {
      return index >= 0 && index < count && active[index] === 1;
    },
  };
}

/** One held key: what was pressed, and how hard. */
export type NoteEntry = { note: number; velocity: number };

export type NoteStack = {
  /**
   * Press `note`. Pressing one already held moves it to the top and updates
   * its velocity; pressing past capacity evicts the least recently played.
   */
  push(note: number, velocity: number): void;
  /** Release `note`. Releasing one that is not held does nothing. */
  remove(note: number): void;
  /** Release everything. */
  clear(): void;
  /** How many keys are down. */
  readonly size: number;
  has(note: number): boolean;
  /** The note this priority scheme would sound, or `null` if none is held. */
  top(priority: NotePriority): NoteEntry | null;
  /** The `i`th held note by ascending pitch. */
  sorted(i: number): NoteEntry;
  /** The `i`th held note in press order, oldest first. */
  played(i: number): NoteEntry;
};

/** Out of range, which stmlib answers with a dummy node rather than a check. */
const NO_NOTE: NoteEntry = { note: -1, velocity: 0 };

/**
 * The keys currently down, in both of the orders anything ever wants them.
 *
 * ```ts
 * const held = createNoteStack();
 * held.push(60, 100);
 * held.push(64, 100);
 * held.top(NotePriority.Last); // { note: 64, velocity: 100 }
 * held.top(NotePriority.Low);  // { note: 60, velocity: 100 }
 * ```
 *
 * A note appears at most once: pressing a held note moves it rather than
 * duplicating it, so both orderings can be searched by note value.
 */
export function createNoteStack(capacity = 16): NoteStack {
  const room = Math.max(0, capacity | 0);
  // Press order, oldest first.
  const playedNote = new Int16Array(room);
  const playedVelocity = new Int16Array(room);
  // Ascending pitch. The same set, kept in step by `push` and `remove`.
  const sortedNote = new Int16Array(room);
  const sortedVelocity = new Int16Array(room);
  let held = 0;

  function entry(note: number, velocity: number): NoteEntry {
    return { note, velocity };
  }

  function drop(note: number): void {
    let at = -1;
    for (let i = 0; i < held; i++) {
      if (playedNote[i] === note) {
        at = i;
        break;
      }
    }
    if (at === -1) return;
    for (let i = at; i < held - 1; i++) {
      playedNote[i] = playedNote[i + 1];
      playedVelocity[i] = playedVelocity[i + 1];
    }
    for (let i = 0; i < held; i++) {
      if (sortedNote[i] !== note) continue;
      for (let j = i; j < held - 1; j++) {
        sortedNote[j] = sortedNote[j + 1];
        sortedVelocity[j] = sortedVelocity[j + 1];
      }
      break;
    }
    held--;
  }

  return {
    push(note: number, velocity: number): void {
      if (room === 0) return;
      drop(note); // a re-press is a move to the top, not a second entry
      // The Juno-60 rule: "if more than 6 keys have been played, the last six
      // keys will remain."
      if (held === room) drop(playedNote[0]);

      playedNote[held] = note;
      playedVelocity[held] = velocity;

      let i = held;
      while (i > 0 && sortedNote[i - 1] > note) {
        sortedNote[i] = sortedNote[i - 1];
        sortedVelocity[i] = sortedVelocity[i - 1];
        i--;
      }
      sortedNote[i] = note;
      sortedVelocity[i] = velocity;

      held++;
    },

    remove(note: number): void {
      drop(note);
    },

    clear(): void {
      held = 0;
    },

    get size(): number {
      return held;
    },

    has(note: number): boolean {
      for (let i = 0; i < held; i++) {
        if (playedNote[i] === note) return true;
      }
      return false;
    },

    top(priority: NotePriority): NoteEntry | null {
      if (held === 0) return null;
      switch (priority) {
        case NotePriority.Low:
          return entry(sortedNote[0], sortedVelocity[0]);
        case NotePriority.High:
          return entry(sortedNote[held - 1], sortedVelocity[held - 1]);
        case NotePriority.First:
          return entry(playedNote[0], playedVelocity[0]);
        default:
          return entry(playedNote[held - 1], playedVelocity[held - 1]);
      }
    },

    sorted(i: number): NoteEntry {
      if (i < 0 || i >= held) return NO_NOTE;
      return entry(sortedNote[i], sortedVelocity[i]);
    },

    played(i: number): NoteEntry {
      if (i < 0 || i >= held) return NO_NOTE;
      return entry(playedNote[i], playedVelocity[i]);
    },
  };
}
