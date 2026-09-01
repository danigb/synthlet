# @synthlet/state-variable-filter

> State Variable Filter module for [synthlet](https://github.com/danigb/synthlet)

## Usage

If you're using synthlet, this filter is included by default and exposed by `patch.filter`:

```ts
import { Patch } from "synthlet";

const patch = new Patch();
await patch.create([patch.osc(), patch.filter({ type: "lowpass" })]);
```

## Credits

Ported from
[`SvfLinearTrapOptimised2.hpp`](https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp)
in FredAntonCorvest/Common-DSP, MIT licensed, Copyright (c) 2016 Fred Anton
Corvest (FAC).

The algorithm is Andrew Simper (Cytomic), [_Solving the continuous SVF equations
using trapezoidal integration and equivalent
currents_](https://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf).

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).
