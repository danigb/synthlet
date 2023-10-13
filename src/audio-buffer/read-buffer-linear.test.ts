import { readBufferLinear } from "./read-buffer-linear";

function setup(len = 10) {
  const buffer = new Float32Array(len);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = i;
  }

  const reader = readBufferLinear(buffer);

  return { buffer, reader };
}

describe("readBufferLinear", () => {
  it("reads the values if inc is an integer", () => {
    const { reader } = setup(10);
    const output = [1, 1, 1, 1, 1].map((inc) => reader.read(inc));
    expect(output).toEqual([0, 1, 2, 3, 4]);
  });
  it("reads the values when inc changes", () => {
    const { reader } = setup(10);
    const output = [1, 1, 2, 2, 3, 3].map((inc) => reader.read(inc));
    expect(output).toEqual([0, 1, 2, 4, 6, 9]);
  });
  it("reads backwards", () => {
    const { reader } = setup(10);
    const output = [-1, -1, -1, -1, -1].map((inc) => reader.read(inc));
    expect(output).toEqual([0, 9, 8, 7, 6]);
  });
  it("wraps around the buffer len by default", () => {
    const { reader } = setup(10);
    const output = [3, 3, 3, 3, 3].map((inc) => reader.read(inc));
    expect(output).toEqual([0, 3, 6, 9, 2]);
  });

  it("interpolates values if inc is not integer", () => {
    const { reader } = setup(10);
    const output = [0.5, 0.5, 0.5, 0.5, 0.5].map((inc) => reader.read(inc));
    expect(output).toEqual([0, 0.5, 1, 1.5, 2]);
  });
  it("interpolates backwards if inc is not integer", () => {
    const { reader } = setup(10);
    const output = [-0.5, -0.5, -0.5, -0.5, -0.5].map((inc) =>
      reader.read(inc)
    );
    expect(output).toEqual([0, 8.5, 9, 7.5, 8]);
  });

  it("interpolates values if inc is not integer and inc changes", () => {
    const { reader } = setup(10);
    const output = [0.5, 0.5, 0.25, 0.25, 0.4, 0.4].map((inc) =>
      reader.read(inc)
    );
    expect(output).toEqual([0, 0.5, 1, 1.25, 1.5, 1.9]);
  });

  it("can set the index", () => {
    const { reader } = setup(10);
    reader.set(1);
    expect(reader.read(1)).toEqual(1);
    reader.set(12);
    expect(reader.read(1)).toEqual(2);
  });

  it("can set window", () => {
    const { reader } = setup(10);
    reader.window(5, 3);
    let output = [1, 1, 1, 1, 1].map((inc) => reader.read(inc));
    expect(output).toEqual([5, 6, 7, 5, 6]);
    reader.window(5, 4);
    output = [-1, -1, -1, -1, -1].map((inc) => reader.read(inc));
    expect(output).toEqual([7, 6, 5, 8, 7]);
  });
});
