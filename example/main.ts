import { Mika, MikaPresets } from "../src";

const DEBUG = true;

main();

async function main() {
  const context = new AudioContext();
  context.resume();
  console.log("Mika");
  const synth = await new Mika(context).loaded();

  if (DEBUG && synth.worklet) {
    console.log(
      "WORKLET",
      synth.paramNames,
      synth.worklet.parameters,
      Array.from(synth.worklet.parameters.keys())
    );
    synth.worklet.port.onmessage = (e) => {
      console.log("MSG >>>", e.data);
    };
  }

  const presetsNames = MikaPresets.map((k) => k.name).sort();

  const presetDisplay = document.getElementById("preset") as HTMLPreElement;
  const select = document.getElementById("preset-select") as HTMLSelectElement;
  select.innerHTML = presetsNames
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("\n");

  function selectPreset(presetName: string) {
    const preset = MikaPresets.find((p) => p.name === presetName);
    if (!preset) return;

    synth.setPreset(preset);
    presetDisplay.innerText = JSON.stringify(preset, null, 2);
  }

  const randomPresetName =
    presetsNames[Math.floor(Math.random() * presetsNames.length)];
  selectPreset(randomPresetName);
  select.value = randomPresetName;

  select.addEventListener("change", (e) => {
    selectPreset((e?.target as any)?.value as string);
  });

  const noteButtons = document.getElementsByClassName("btn-note");
  for (const btn of noteButtons) {
    const note = parseInt(btn.getAttribute("data-note") ?? "60", 10);
    btn.addEventListener("mousedown", () => {
      synth.setNote(note);
      synth.start();
    });
    btn.addEventListener("mouseup", () => {
      synth.release();
    });
  }

  function resumeContext() {
    context.resume();
    document.body.classList.remove("opacity-20");
    document.body.removeEventListener("click", resumeContext);
  }

  document.body.classList.add("opacity-20");
  document.body.addEventListener("click", resumeContext);
}
