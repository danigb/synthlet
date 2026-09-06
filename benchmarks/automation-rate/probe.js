// Focused probe: what does an AudioWorkletProcessor actually receive when an
// AudioNode is connected to one of its AudioParams?
//
// Reports, per case, the delivered array length AND whether the values within a
// block actually vary. Length alone is not enough: an engine that hands back
// length 1 for a modulated param is silently decimating the modulator.

(function () {
  "use strict";

  var SR = 48000;

  function source(name, rate) {
    return [
      'registerProcessor("' + name + '", class extends AudioWorkletProcessor {',
      "  static get parameterDescriptors() {",
      '    return [{ name: "p", defaultValue: 0.5, minValue: -10, maxValue: 10,',
      '              automationRate: "' + rate + '" }];',
      "  }",
      "  constructor() { super(); this.n = 0; this.sent = false; }",
      "  process(inputs, outputs, params) {",
      "    this.n++;",
      "    var p = params.p;",
      "    if (!this.sent && this.n === 100) {",
      "      this.sent = true;",
      "      var min = Infinity, max = -Infinity;",
      "      for (var i = 0; i < p.length; i++) { if (p[i] < min) min = p[i]; if (p[i] > max) max = p[i]; }",
      "      this.port.postMessage({",
      "        length: p.length,",
      "        min: min, max: max,",
      "        spreadWithinBlock: max - min,",
      "        first: p[0],",
      "      });",
      "    }",
      "    outputs[0][0][0] = p[0] * 1e-9;",
      "    return true;",
      "  }",
      "});",
    ].join("\n");
  }

  async function probe(label, rate, wire) {
    var ctx = new OfflineAudioContext(1, SR * 1, SR);
    var name = "Probe_" + label.replace(/\W/g, "_");
    var url = URL.createObjectURL(
      new Blob([source(name, rate)], { type: "application/javascript" }),
    );
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    var node = new AudioWorkletNode(ctx, name, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    var got = null;
    node.port.onmessage = function (e) {
      got = e.data;
    };
    node.connect(ctx.destination);
    wire(ctx, node.parameters.get("p"));

    await ctx.startRendering();
    // Port messages can land after startRendering resolves; give them a turn.
    await new Promise(function (r) {
      setTimeout(r, 50);
    });
    return Object.assign(
      { case: label, rate: rate },
      got || { error: "no message" },
    );
  }

  window.__probe = async function () {
    var out = [];
    for (var _i = 0, rates = ["k-rate", "a-rate"]; _i < rates.length; _i++) {
      var rate = rates[_i];
      out.push(await probe("nothing connected", rate, function () {}));
      out.push(
        await probe("constant source", rate, function (ctx, param) {
          var s = new ConstantSourceNode(ctx, { offset: 0.25 });
          s.start();
          s.connect(param);
        }),
      );
      out.push(
        await probe("oscillator 5 Hz", rate, function (ctx, param) {
          var o = new OscillatorNode(ctx, { frequency: 5 });
          o.start();
          o.connect(param);
        }),
      );
      out.push(
        await probe("oscillator 1000 Hz", rate, function (ctx, param) {
          var o = new OscillatorNode(ctx, { frequency: 1000 });
          o.start();
          o.connect(param);
        }),
      );
      out.push(
        await probe("scheduled ramp", rate, function (ctx, param) {
          param.setValueAtTime(0, 0);
          param.linearRampToValueAtTime(1, 1);
        }),
      );
    }
    return { userAgent: navigator.userAgent, probes: out };
  };
})();
