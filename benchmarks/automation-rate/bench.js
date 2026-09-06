// Automation-rate benchmark.
//
// Measures what it costs to DECLARE an AudioParam, separately from what it costs
// to USE one — because the two get conflated, and the repo holds two documented
// claims that disagree about the first.
//
// Everything renders through OfflineAudioContext, so there is no audio device,
// no SharedArrayBuffer, no COOP/COEP, and no dependency on `performance` being
// present in AudioWorkletGlobalScope (it is not specified there). The reported
// number is the REALTIME FACTOR: wall-clock seconds to render one second of
// audio. 0.10 means a tenth of one core; anything approaching 1.0 glitches.
//
// See thoughts/tickets/automation-rate/00-benchmark-parameter-count-against-rate.md

(function () {
  "use strict";

  var SAMPLE_RATE = 48000;
  var DURATION = 10; // seconds of audio rendered per run
  var REPEATS = 5; // median of
  var QUANTUM = 128;

  // ---------------------------------------------------------------------------
  // Processor source, built as a string and registered from a Blob URL - the
  // same way `createRegistrar` ships every processor in this library.
  // ---------------------------------------------------------------------------

  // opts: { name, declare, rate, read, tan, guard }
  //   declare  how many AudioParams the descriptor lists
  //   rate     "k-rate" | "a-rate" for every declared param
  //   read     how many of them process() actually reads (rate-agnostically)
  //   tan      run Math.tan per sample, driven by param p0
  //   guard    guard that tan with change detection
  function processorSource(opts) {
    var L = [];
    L.push(
      'registerProcessor("' +
        opts.name +
        '", class extends AudioWorkletProcessor {',
    );
    L.push("  static get parameterDescriptors() {");
    L.push("    var d = [];");
    L.push("    for (var i = 0; i < " + opts.declare + "; i++) {");
    // The range is deliberately wide. At [0, 1] a connected oscillator
    // saturates the clamp, the value is genuinely constant for most of each
    // cycle, and the observed-length column reads 1 for a reason that has
    // nothing to do with the question being asked.
    L.push(
      '      d.push({ name: "p" + i, defaultValue: 0.5, minValue: -10, maxValue: 10,',
    );
    L.push(
      '               automationRate: "' + (opts.rate || "k-rate") + '" });',
    );
    L.push("    }");
    L.push("    return d;");
    L.push("  }");
    L.push("  constructor() {");
    L.push("    super();");
    L.push("    this.phase = 0; this.blocks = 0; this.reported = false;");
    L.push("    this.last = -1; this.coef = 0;");
    L.push("  }");
    L.push("  process(inputs, outputs, params) {");
    L.push("    var out = outputs[0][0];");
    L.push("    var n = out.length;");
    L.push("    this.blocks++;");
    // Observation: report the array lengths actually delivered, once, well after
    // the render has settled. This is the measurement that settles the `MAY`.
    L.push("    if (!this.reported && this.blocks === 200) {");
    L.push("      this.reported = true;");
    L.push("      var lens = {};");
    L.push("      for (var k in params) lens[k] = params[k].length;");
    L.push('      this.port.postMessage({ type: "LENGTHS", lengths: lens });');
    L.push("    }");

    // Read `read` params rate-agnostically, hoisted - the house idiom.
    var r = Math.min(opts.read || 0, opts.declare);
    for (var i = 0; i < r; i++) {
      L.push("    var a" + i + " = params.p" + i + ";");
      L.push("    var r" + i + " = a" + i + ".length > 1;");
    }

    if (opts.tan) {
      L.push("    var A = params.p0, AR = A.length > 1;");
      L.push("    for (var i = 0; i < n; i++) {");
      L.push("      var v = AR ? A[i] : A[0];");
      if (opts.guard) {
        L.push(
          "      if (v !== this.last) { this.last = v; this.coef = Math.tan(Math.PI * 0.49 * v); }",
        );
      } else {
        L.push("      this.coef = Math.tan(Math.PI * 0.49 * v);");
      }
      L.push("      this.phase += 0.01; if (this.phase >= 1) this.phase -= 1;");
      L.push("      out[i] = this.phase * this.coef;");
      L.push("    }");
    } else {
      // Fixed DSP work in every case, so the only variable is the param surface.
      L.push("    for (var i = 0; i < n; i++) {");
      L.push("      var acc = 0;");
      for (var j = 0; j < r; j++) {
        L.push("      acc += r" + j + " ? a" + j + "[i] : a" + j + "[0];");
      }
      L.push("      this.phase += 0.01; if (this.phase >= 1) this.phase -= 1;");
      L.push("      out[i] = this.phase * 2 - 1 + acc * 1e-6;");
      L.push("    }");
    }

    L.push("    return true;");
    L.push("  }");
    L.push("});");
    return L.join("\n");
  }

  // ---------------------------------------------------------------------------
  // One render
  // ---------------------------------------------------------------------------

  function median(xs) {
    var s = xs.slice().sort(function (a, b) {
      return a - b;
    });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  async function renderOnce(spec, collectLengths) {
    var ctx = new OfflineAudioContext(1, SAMPLE_RATE * DURATION, SAMPLE_RATE);
    var url = URL.createObjectURL(
      new Blob([processorSource(spec)], { type: "application/javascript" }),
    );
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    var sink = new GainNode(ctx, { gain: 1e-9 });
    sink.connect(ctx.destination);

    var lengths = null;
    for (var i = 0; i < spec.instances; i++) {
      var node = new AudioWorkletNode(ctx, spec.name, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      if (i === 0 && collectLengths) {
        node.port.onmessage = function (e) {
          if (e.data && e.data.type === "LENGTHS") lengths = e.data.lengths;
        };
      }
      if (spec.connect) {
        // A node connected to an AudioParam - synthlet's "everything is a
        // signal" pattern.
        //
        // `connect: "const"` uses a ConstantSourceNode, `connect: "lfo"` an
        // OscillatorNode. The difference is the point: a constant source still
        // sums to a constant, so an engine may still collapse the array. Only a
        // genuinely varying source forces per-sample delivery.
        for (var c = 0; c < spec.declare; c++) {
          var src =
            spec.connect === "lfo"
              ? new OscillatorNode(ctx, { frequency: 5 + c })
              : new ConstantSourceNode(ctx, { offset: 0.5 });
          src.start();
          src.connect(node.parameters.get("p" + c));
        }
      }
      if (spec.automate) {
        for (var p = 0; p < spec.declare; p++) {
          var param = node.parameters.get("p" + p);
          // A ramp chain across the whole render: automation is scheduled in
          // every quantum, so the length-1 optimisation can never apply.
          param.setValueAtTime(0, 0);
          for (var t = 1; t <= DURATION * 4; t++) {
            param.linearRampToValueAtTime(t % 2 ? 1 : 0, t / 4);
          }
        }
      }
      node.connect(sink);
    }

    var t0 = performance.now();
    await ctx.startRendering();
    var ms = performance.now() - t0;

    // Port messages posted during the render can land after startRendering
    // resolves. Without this the observed-length column reads whatever arrived
    // early, which is a different question from the one being asked.
    if (collectLengths) {
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
    }

    return { ms: ms, lengths: lengths };
  }

  async function runCase(spec) {
    var runs = [];
    var lengths = null;
    // One warm-up render, discarded: first-touch JIT and worklet setup.
    await renderOnce(
      Object.assign({}, spec, { name: spec.name + "_warm" }),
      false,
    );
    for (var i = 0; i < REPEATS; i++) {
      var res = await renderOnce(
        Object.assign({}, spec, { name: spec.name + "_" + i }),
        i === 0,
      );
      runs.push(res.ms);
      if (res.lengths) lengths = res.lengths;
    }
    var ms = median(runs);
    return {
      label: spec.label,
      declare: spec.declare,
      rate: spec.rate || "-",
      read: spec.read || 0,
      instances: spec.instances,
      automate: !!spec.automate,
      medianMs: Math.round(ms * 10) / 10,
      // Wall-clock seconds per second of audio. The number that predicts glitching.
      realtimeFactor: Math.round((ms / 1000 / DURATION) * 10000) / 10000,
      perNodeUs:
        Math.round(
          ((ms * 1000) /
            spec.instances /
            ((DURATION * SAMPLE_RATE) / QUANTUM)) *
            100,
        ) / 100,
      runsMs: runs.map(function (x) {
        return Math.round(x * 10) / 10;
      }),
      observedLengths: lengths,
    };
  }

  // ---------------------------------------------------------------------------
  // The matrix
  // ---------------------------------------------------------------------------

  function cases() {
    var out = [];
    var id = 0;
    function add(spec) {
      spec.name = "BenchProc" + id++;
      out.push(spec);
    }

    // A. Plumbing: declare 0/2/8/16, READ ONLY 2 in every case. Any difference
    //    is the cost of declaring, not of using.
    add({ label: "A declare 0", declare: 0, read: 0, instances: 8 });
    [2, 8, 16].forEach(function (d) {
      ["k-rate", "a-rate"].forEach(function (rate) {
        add({
          label: "A declare " + d + " " + rate + " (read 2)",
          declare: d,
          rate: rate,
          read: 2,
          instances: 8,
        });
      });
    });

    // A2. Instance sweep at 16 params.
    [1, 32].forEach(function (n) {
      ["k-rate", "a-rate"].forEach(function (rate) {
        add({
          label: "A2 declare 16 " + rate + " x" + n + " (read 2)",
          declare: 16,
          rate: rate,
          read: 2,
          instances: n,
        });
      });
    });

    // B. Realistic: declare 16 and read all 16.
    ["k-rate", "a-rate"].forEach(function (rate) {
      add({
        label: "B declare 16 " + rate + " (read 16)",
        declare: 16,
        rate: rate,
        read: 16,
        instances: 8,
      });
    });

    // C. Automated: 16 a-rate params with automation in every quantum, so
    //    length-1 delivery is impossible.
    add({
      label: "C declare 16 a-rate AUTOMATED (read 16)",
      declare: 16,
      rate: "a-rate",
      read: 16,
      instances: 8,
      automate: true,
    });

    // E. Connected: a node driving every param. This is synthlet's normal
    //    pattern, and the case granite's cost argument is really about - the
    //    param can never be constant, so length-1 delivery cannot apply.
    ["const", "lfo"].forEach(function (kind) {
      ["k-rate", "a-rate"].forEach(function (rate) {
        // 3 params is the surface a real module has (`Svf`, `PolyblepOscillator`).
        [3, 16].forEach(function (d) {
          add({
            label:
              "E declare " +
              d +
              " " +
              rate +
              " <- " +
              kind +
              " (read " +
              d +
              ")",
            declare: d,
            rate: rate,
            read: d,
            instances: 8,
            connect: kind,
          });
        });
      });
    });

    // D. Coefficients: does change detection remove the cost of a per-sample
    //    Math.tan driven by an a-rate param? Run each unautomated and automated.
    [false, true].forEach(function (automate) {
      [false, true].forEach(function (guard) {
        add({
          label:
            "D tan " +
            (guard ? "guarded" : "unguarded") +
            (automate ? " AUTOMATED" : " constant"),
          declare: 2,
          rate: "a-rate",
          read: 2,
          instances: 8,
          tan: true,
          guard: guard,
          automate: automate,
        });
      });
    });

    return out;
  }

  // ---------------------------------------------------------------------------

  window.__run = async function (onProgress) {
    var specs = cases();
    var results = [];
    for (var i = 0; i < specs.length; i++) {
      if (onProgress) onProgress(i + 1, specs.length, specs[i].label);
      results.push(await runCase(specs[i]));
    }
    return {
      userAgent: navigator.userAgent,
      sampleRate: SAMPLE_RATE,
      durationSec: DURATION,
      repeats: REPEATS,
      quantum: QUANTUM,
      results: results,
    };
  };

  window.__caseCount = cases().length;
})();
