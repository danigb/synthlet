type Event = {
  time: number;
  value: number;
};

export type Sequence = {
  events: Event[];
  duration: number;
};

export function rhythmic(pattern: string): Sequence {
  const events = pattern
    .split("")
    .map((c, time): Event => ({ time, value: c === "." ? 0 : 1 }));

  return { events, duration: events.length };
}

export function sequence(seq: Array<[number, number]>): Sequence {
  const sequence: Sequence = { events: [], duration: 0 };
  let offset = 0;
  seq.forEach(([value, duration]) => {
    sequence.events.push({ time: offset, value });
    offset += duration;
  });
  sequence.duration = offset;
  return sequence;
}
