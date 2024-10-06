# synthlet

## 0.10.0

- New VirtualAnalogFilter module `@synthlet/virtual-analog-filter`

## 0.9.0

- New ReverbDelay effect `@synthlet/reverb-delay`

## 0.8.0

- New KarplusStrong audio source `@synthlet/karplus-strong`

## 0.7.0

- Add `detune` parameter to Polyblep oscillator

## 0.6.0

- State Variable Filter improvements:
  - It uses a better algorithm (by Andrew Simper and Freq Anton Corvest)
  - `frequency` is now a a-rate parameter suitable for modulation
  - Renamed `resonance` to `Q` to match Web Audio API standard

## 0.5.0

- New chorus `@synthlet/chorus`

## 0.4.0

- New arpeggiator `@synthlet/arp` package

## 0.3.0

- New reverb `@synthlet/dattorro-reverb`
- Function `registerSynthlet` renamed to `registerAllWorklets`

## 0.2.0

- Initial release of the following modules:

  - @synthlet/param@0.1.0
  - @synthlet/ad@0.1.0
  - @synthlet/adsr@0.1.0
  - @synthlet/chorus-t@0.1.0
  - @synthlet/clip-amp@0.1.0
  - @synthlet/clock@0.1.0
  - @synthlet/euclid@0.1.0
  - @synthlet/impulse@0.1.0
  - @synthlet/lfo@0.1.0
  - @synthlet/noise@0.1.0
  - @synthlet/polyblep-oscillator@0.1.0
  - @synthlet/state-variable-filter@0.1.0
  - @synthlet/wavetable-oscillator@0.1.0

## 0.1.0

Initial implementation of:

- ADSR
- White Noise
- State Variable Filter
- Wavetable Oscillator
