import { ParamsDef } from "../worklet-utils";
import { VA1Filter } from "./va1-filter";

export enum VAFilterAlgorithm {
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

export const FilterParams: ParamsDef = {
  filterType: { min: 0, max: 14, defaultValue: 1 },
  frequency: { min: 0, max: 10000, defaultValue: 1000 },
  resonance: { min: 0, max: 1, defaultValue: 0.5 },
} as const;

export class Filter {
  filterType: VAFilterAlgorithm;
  filterVa1: VA1Filter;
  process: (x: number) => number;

  constructor(public readonly sampleRate: number) {
    this.filterType = VAFilterAlgorithm.BypassFilter;
    this.filterVa1 = new VA1Filter(sampleRate);
    this.process = (x: number) => x;
    this.setParams(
      VAFilterAlgorithm.VF_LP,
      FilterParams.frequency.defaultValue,
      FilterParams.resonance.defaultValue
    );
  }

  setParams(
    filterType: VAFilterAlgorithm,
    frequency: number,
    resonance: number
  ) {
    if (this.filterType !== filterType) {
      this.#setType(filterType);
    }
    this.#update(frequency, resonance);
  }

  #setType(filterType: VAFilterAlgorithm) {
    this.filterType = filterType;
    switch (filterType) {
      case VAFilterAlgorithm.VF_LP:
        this.process = (x: number) => this.filterVa1.process(x).LPF1;
        break;
      case VAFilterAlgorithm.VF_HP:
        this.process = (x: number) => this.filterVa1.process(x).HPF1;
        break;
      case VAFilterAlgorithm.VF_AP:
        this.process = (x: number) => this.filterVa1.process(x).APF1;
        break;
      default:
        this.process = (x: number) => x;
        break;
    }
  }

  #update(frequency: number, resonance: number) {
    switch (this.filterType) {
      case VAFilterAlgorithm.VF_LP:
      case VAFilterAlgorithm.VF_HP:
      case VAFilterAlgorithm.VF_AP:
        this.filterVa1.update(frequency);
    }
  }
}
