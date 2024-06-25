import { PROCESSOR } from "./processor";

export function getProcessorName() {
  return "AdsrWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export type ProcessorOptions = {
  mode?: "audio" | "control";
};
