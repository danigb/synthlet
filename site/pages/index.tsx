import { Inter } from "@next/font/google";
import Head from "next/head";
import { AdsrExample } from "src/examples/AdsrExample";
import { KarplusExample } from "src/examples/KarplusExample";
import { LfoExample } from "src/examples/LfoExample";
import { PcmOscillatorExample } from "src/examples/PcmOscillatorExample";
import { SequencerExample } from "src/examples/SequencerExample";
import { VaFilterExample } from "src/examples/VaFilterExample";
import { VaOscillatorExample } from "src/examples/VaOscillatorExample";
import { WtOscillatorExample } from "src/examples/WtOscillatorExample";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <>
      <Head>
        <title>Synthlet</title>
        <meta name="description" content="Plug and play web instruments" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className={"max-w-4xl mx-auto my-8 p-4" + inter.className}>
        <div className="flex items-end mb-16">
          <h1 className="text-6xl font-bold moving-bg pb-4">Synthlet</h1>
        </div>

        <div className="flex flex-col gap-8">
          <VaOscillatorExample />
          <WtOscillatorExample />
          <PcmOscillatorExample />
          <VaFilterExample />
          <KarplusExample />
          <LfoExample />
          <AdsrExample />
          <SequencerExample />
        </div>
      </main>
    </>
  );
}
