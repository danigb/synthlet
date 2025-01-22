import dynamic from "next/dynamic";

const GraniteDemo = dynamic(() => import("./GraniteDemo"), { ssr: false });

export default function GranitePage() {
  return (
    <main className="flex h-screen flex-col justify-center text-center">
      <h1 className="text-2xl font-bold">Granite</h1>
      <GraniteDemo />
    </main>
  );
}
