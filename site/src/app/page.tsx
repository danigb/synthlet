import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col p-24">
      <h1 className="text-2xl">Synthlet</h1>
      <p className="text-gray-400">
        A collection of synth modules implemented as AudioWorklets
      </p>
      <div className="mt-8 flex flex-col gap-2">
        <h2 className="text-xl">Examples</h2>
        <Link href={`/synths/fly`}>Fly monophonic synthesizer</Link>
      </div>
    </main>
  );
}
