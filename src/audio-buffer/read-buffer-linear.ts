export type ReadAudioBufferLinear = ReturnType<typeof readBufferLinear>;

export function readBufferLinear(buffer: Float32Array) {
  const $buffer = buffer;
  let $len = buffer.length;
  let $index = 0;
  let $bottom = 0;

  function read(inc: number) {
    const index = Math.floor($index);
    const frac = $index - index;
    const next = inc > 0 ? index + 1 : index - 1;
    const nextIndex = next < 0 ? $len - 1 : next >= $len ? 0 : next;
    const y1 = $buffer[$bottom + index];
    const y2 = $buffer[$bottom + nextIndex];
    const y = y1 + (y2 - y1) * frac;
    $index += inc;
    if ($index >= $len) $index -= $len;
    if ($index < 0) $index += $len;
    return y;
  }

  function window(bottom: number, len: number) {
    $bottom = Math.floor(bottom ?? 0);
    $len = Math.floor(Math.min(len ?? $len, $buffer.length));
    $index = $index % $len;
  }

  function set(index: number) {
    $index = index % $len;
  }

  return { read, set, window };
}
