# Ideas

## API

Use a "universal" Connect module:

```ts
// OLD
const clock = Clock(ac, { bpm: 60 });
const euclid = Euclid(ac, { steps: 16, beats: 4, clock });
const clave = ClaveDrum(ac, { trigger: euclid });
clave.connect(ac.destination);

// NEW
const clock = Clock(ac, { bpm: 60 });
const euclid = Euclid(ac, { steps: 16, beats: 4 });
const clave = ClaveDrum(ac);
Connect([clock, euclid.clock], [euclid, clave.trigger]);
const out = Serial([clave, Output(ac, { db: -24 })]);
Patch(out, { clave, clock, euclid });
```

```ts
/// FROM README

// Create modules
const osc = Polybleb.saw(ac, { frequency: 440 });
const filter = Svg.lp(ac, { frequency: 1000 });
const amp = Amp.adsr(ac, { trigger, attack: 0.01, release: 0.3 });
const out = Output(ac, { db: -3 });
// Connect modules
Serial([osc, filter, amp, out]);

// Create patch
const patch = Patch(out, { osc, filter, amp });

// Use patch
patch.connect(ac.destination);
patch.osc.frequency.value = 300;
patch.amp.gate.value = 1; // start sound
patch.amp.gate.value = 0; // stop sound

// OLD
const trigger = Param(ac);
const volume = Param(ac, -24);
const out = Output(ac);
const ks = KarplusStrong(ac);

Connect([trigger, ks.trigger], [volume, out.db], [ks, out]);

return Object.assign(ConnSerial([ks, Gain.val(ac, volume)]), {
  ks,
  volume: volume.input,
  trigger: trigger.input,
});

/// NEW
const trigger = Param(ac);
const volume = Param(ac, -24);
const osc = KarplusStrong(ac, { trigger });
const out = Serial(osc, Output(ac, { db: volume }));
return Patch(out, { osc, trigger, volume }); // out.osc.frequency.value = 300

// OLD
const VcaSynth = (context: AudioContext) => {
  const s = getSynthlet(context);
  const trigger = s.param();
  const attack = s.param(0.01);
  const release = s.param(0.3);

  return s.withParams(
    s.conn.serial(s.osc.sin(440), s.amp.perc(trigger, attack, release)),
    {
      trigger,
      attack,
      release,
    }
  );
};

/// ALTERNATIVE
const VcaSynth = (ac: AudioContext) => {
  const s = Patch(ac, {
    gate: Gate,
    attack: 0.01,
    release: 0.3,
    volume: -12,
    osc: [BlepOsc, { frequency: 440 }],
    amp: [PercAmp, { attack: 0.01, release: 0.3 }],
    out: [Output, { destination: true }],
  });

  s.patch(
    [s.gate, s.amp.Gate],
    [s.attack, s.amp.attack],
    [s.release, s.amp.release],
    [s.volume, s.out.db],
    [s.osc, s.amp, s.out, s.destination]
  );
};

/// ALTERNATIVE
const KickDrum = (ac: AudioContext, inputs: DrumInputs = {}) => {
  const p = Patch(ac, {
    ...Inputs(ac, inputs, { decay: 0.5, volume: -12, tone: 0.5, trigger: 0 }),
    osc: BlepOsc,
    oscEnv: [EnvDecay, { gain: -50 }],
    impulse: Impulse,
    amp: AmpEnv,
    clip: Clip,
    out: Output,
  });
  p.patch(
    [p.trigger, [p.osc.trigger, p.impulse.trigger]],
    [p.decay, p.oscEnv.decay],
    [p.offset, p.osc.frequency],
    [p.osc, p.amp, p.clip, p.out]
  );
};

/// ALT 3
const trigger = Param(ac, input.trigger ?? 0);
const decay = Param(ac, input.decay ?? 0.5);
const volume = Param(ac, input.volume ?? -12);
const tone = Param(ac, input.tone ?? 0.5);
const frequency = Param.linear(tone, 20, 100);
const osc = Osc(ac, {
  frequency: Mix([
    frequency,
    Ramp(ac, { trigger, start: 0, end: -50, duration: Param.div(decay, 2) }),
  ]),
});
const click = Impulse(ac, { trigger });
const amp = Amp.ad(ac, { trigger, attack: 0.01, release: decay });
const clip = Clip.soft({ pre: 5, post: 0.6 });
const out = Output(ac, { db: volume });
Connect([Mix([osc, click]), amp, clip, out]);
Patch(out, { trigger, decay, volume, tone });

/// ALT 3
const trigger = Param(ac, input.trigger ?? 0);
const decay = Param(ac, input.decay ?? 0.5);
const volume = Param(ac, input.volume ?? -12);
const tone = Param(ac, input.tone ?? 0.5);

const osc = Mix(
  [263, 400, 421, 474, 587, 845].map((f) => Osc(ac, { frequency: f }))
);
const out = Serial([
  osc,
  Biquad.bp(ac, { frequency: Param.linear(tone, 20, 100) }),
  Biquad.hp(ac, { frequency: Param.add(loFreq, -2000) }),
  Amp.ad(ac, { trigger, attack: 0.01, release: decay }),
  Output(ac, { db: volume }),
]);
Patch(out, { trigger, decay, volume, tone });

/// ALT 3
export const CowBellDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const trigger = Param(ac, input.trigger ?? 0);
  const decay = Param(ac, input.decay ?? 0.5);
  const volume = Param(ac, input.volume ?? -12);
  const tone = Param(ac, input.tone ?? 0.5);

  const hiFreq = Param.linear(tone, 700, 900);
  const lowFreq = Param.linear(tone, 440, 540);
  const shortDecay = Param.mul(decay, 0.1);

  const voice1 = Serial([
    Osc.square(ac, { frequency: hiFreq }),
    Amp.perc(ac, { trigger, attack: 0.001, release: shortDecay }),
  ]);
  const voice2 = Serial([
    Osc.square(ac, { frequency: lowFreq }),
    Amp.perc(ac, { trigger, attack: 0.001, release: shortDecay }),
  ]);
  const out = Serial(Mix([voice1, voice2]), Output(ac, { db: volume }));
  Patch(out, { trigger, decay, volume, tone });
};
```

## Modules

- Snarebuzz

  - https://github.com/RCJacH/ReaScripts/blob/master/JSFX/Audio/RCNoiseBuzz.jsfx
  - https://www.kvraudio.com/product/snarebuzz-by-wavesfactory

- Chorus
  - https://github.com/SpotlightKid/ykchorus

```

```
