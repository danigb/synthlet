import { Inter } from "@next/font/google";
import Head from "next/head";
import { AdsrExample } from "src/examples/AdsrExample";
import { KarplusExample } from "src/examples/KarplusExample";
import { LfoExample } from "src/examples/LfoExample";
import { VaOscillatorExample } from "src/examples/VaOscillatorExample";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <>
      <Head>
        <title>Synthlet</title>
        <meta name="description" content="Plug and play web instruments" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className={"max-w-4xl mx-auto my-20 p-4" + inter.className}>
        <div className="flex items-end mb-16">
          <h1 className="text-6xl font-bold">Synthlet</h1>
        </div>

        <div className="flex flex-col gap-8">
          <VaOscillatorExample />
          <KarplusExample />
          <LfoExample />
          <AdsrExample />
        </div>
      </main>
    </>
  );
}
