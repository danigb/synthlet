import { ParamsDef } from "../worklet-utils";
import { VA1Filter } from "./va1-filter";

export enum VaFilterType {
  BypassFilter = 0,
  VF_LP = 1,
  VF_HP = 2,
  VF_AP = 3,
  SVF_LP = 4,
  SVF_HP = 5,
  SVF_BP = 6,
  SVF_BS = 7,
  Korg35_LP = 8,
  Korg35_HP = 9,
  Moog_LP1 = 10,
  Moog_LP2 = 11,
  Moog_LP3 = 12,
  Moog_LP4 = 13,
  Diode_LP4 = 14,
}

export const VA_FILTER_TYPE_NAMES = [
  "Bypass",
  "VA LowPass",
  "VA HighPass",
  "VA AllPass",
  "SVF LowPass",
  "SVF HighPass",
  "SVF BandPass",
  "SVF BandShelf",
  "Korg35 LowPass",
  "Korg35 HighPass",
  "Moog LowPass1",
  "Moog LowPass2",
  "Moog LowPass3",
  "Moog LowPass4",
  "Diode LowPass4",
];

export const VaFilterParams: ParamsDef = {
  filterType: { min: 0, max: 14, defaultValue: 1 },
  frequency: { min: 0, max: 10000, defaultValue: 1000 },
  resonance: { min: 0, max: 1, defaultValue: 0.5 },
} as const;

export class VaFilter {
  filterType: VaFilterType;
  filterVa1: VA1Filter;
  process: (x: number) => number;

  constructor(public readonly sampleRate: number) {
    this.filterType = VaFilterType.BypassFilter;
    this.filterVa1 = new VA1Filter(sampleRate);
    this.process = (x: number) => x;
    this.setParams(
      VaFilterType.VF_LP,
      VaFilterParams.frequency.defaultValue,
      VaFilterParams.resonance.defaultValue
    );
  }

  setParams(filterType: VaFilterType, frequency: number, resonance: number) {
    if (this.filterType !== filterType) {
      this.#setType(filterType);
    }
    this.#update(frequency, resonance);
  }

  #setType(filterType: VaFilterType) {
    this.filterType = filterType;
    switch (filterType) {
      case VaFilterType.VF_LP:
        this.process = (x: number) => this.filterVa1.process(x).LPF1;
        break;
      case VaFilterType.VF_HP:
        this.process = (x: number) => this.filterVa1.process(x).HPF1;
        break;
      case VaFilterType.VF_AP:
        this.process = (x: number) => this.filterVa1.process(x).APF1;
        break;
      default:
        this.process = (x: number) => x;
        break;
    }
  }

  #update(frequency: number, resonance: number) {
    switch (this.filterType) {
      case VaFilterType.VF_LP:
      case VaFilterType.VF_HP:
      case VaFilterType.VF_AP:
        this.filterVa1.update(frequency);
    }
  }
}
