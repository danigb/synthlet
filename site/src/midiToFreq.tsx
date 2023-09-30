"use client";
export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
