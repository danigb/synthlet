import dynamic from "next/dynamic";

const GraniteDemo = dynamic(() => import("./GraniteDemo"), { ssr: false });

export default function GranitePage() {
  return (
    <main className="flex h-screen flex-col justify-center text-center">
      <h1 className="text-2xl font-bold">Granite</h1>
      <GraniteDemo />

      <p>
        Song by
        <a href="https://freemusicarchive.org/music/Handheld_Recordings/Wolaita__Derashe_Ethiopia_2009/14_Track_14_1/">
          Handheld Recordings
        </a>
      </p>
    </main>
  );
}
