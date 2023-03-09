import { Synthlet } from "../src";

main();

async function main() {
  const context = new AudioContext();
  console.log("Synthlet");
  const synthlet = await new Synthlet(context).loaded();

  window.document.onclick = () => {
    console.log("Trigger");
    synthlet.setNote(60, context.currentTime);
    synthlet.start(context.currentTime);
    synthlet.setNote(64, context.currentTime + 1);
    synthlet.release(context.currentTime + 2);
  };
}
