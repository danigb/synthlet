# @synthlet/state-variable-filter

> State Variable Filter module for [synthlet](https://github.com/danigb/synthlet)

## Usage

If you're using synthlet, this filter is included by default and exposed by `patch.filter`:

```ts
import { Patch } from "synthlet";

const patch = new Patch();
await patch.create([patch.osc(), patch.filter({ type: "lowpass" })]);
```
