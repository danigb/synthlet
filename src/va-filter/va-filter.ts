import { ParamsDef } from "../worklet-utils";
import { Korg35Filter } from "./korg35-filter";
import { Va1Filter } from "./va1-filter";
import { Va2Filter } from "./va2-filter";

export enum VaFilterType {
  BypassFilter,

  VA1_LP,
  VA1_HP,
  VA1_ALP,

  VA2_LP,
  VA2_HP,
  VA2_BP,
  VA2_BS,
  VA2_ALP,

  Korg35_LP,
  Korg35_HP,
}

export const VA_FILTER_TYPE_NAMES = [
  "Bypass",
  "VA 1-pole Low Pass",
  "VA 1-pole High Pass",
  "VA 1-pole Analog Low Pass",

  "VA 2-pole Low Pass",
  "VA 2-pole High Pass",
  "VA 2-pole Band Pass",
  "VA 2-pole Band Shelf",
  "VA 2-pole Analog Low Pass",

  "Korg35 Low Pass",
  "Korg35 High Pass",
];

export const VaFilterParams: ParamsDef = {
  type: { min: 0, max: 14, defaultValue: 1 },
  frequency: { min: 0, max: 10000, defaultValue: 1000 },
  resonance: { min: 0, max: 1, defaultValue: 0.5 },
} as const;

type Processor = (x: number) => number;

export class VaFilter {
  filterType: VaFilterType;
  va1: ReturnType<typeof Va1Filter>;
  va2: ReturnType<typeof Va2Filter>;
  korg35: ReturnType<typeof Korg35Filter>;
  processors: Processor[];
  process: (x: number) => number;

  constructor(public readonly sampleRate: number) {
    this.filterType = VaFilterType.BypassFilter;
    this.va1 = Va1Filter(sampleRate);
    this.va2 = Va2Filter(sampleRate);
    this.korg35 = Korg35Filter(sampleRate);
    this.process = (x: number) => x;
    this.processors = [
      // Bypass
      (x) => x,
      // VA 1-pole Low Pass
      (x) => this.va1.process(x).LP,
      // VA 1-pole High Pass
      (x) => this.va1.process(x).HP,
      // VA 1-pole Analog Low Pass
      (x) => this.va1.process(x).ALP,
      // VA 2-pole Low Pass
      (x) => this.va2.process(x).LP,
      // VA 2-pole High Pass
      (x) => this.va2.process(x).HP,
      // VA 2-pole Band Pass
      (x) => this.va2.process(x).BP,
      // VA 2-pole Band Shelf
      (x) => this.va2.process(x).BS,
      // VA 2-pole Analog Low Pass
      (x) => this.va2.process(x).ALP,
      // Korg35 Low Pass
      (x) => this.korg35.process(x).LP,
      // Korg35 High Pass
      (x) => this.korg35.process(x).HP,
    ];
    // Set default params
    this.setParams(
      VaFilterType.VA1_LP,
      VaFilterParams.frequency.defaultValue,
      VaFilterParams.resonance.defaultValue
    );
  }

  setParams(filterType: VaFilterType, frequency: number, resonance: number) {
    if (this.filterType !== filterType) {
      this.process = this.processors[filterType] ?? this.processors[0];
    }
    this.#update(frequency, resonance);
  }

  #update(frequency: number, resonance: number) {
    this.va1.update(frequency);
    this.va2.update(frequency, resonance);
    this.korg35.update(frequency, resonance);
  }
}
