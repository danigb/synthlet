import Link from "next/link";
import { Drum8 } from "./Drum8";

export default function CrowSynthPage() {
  return (
    <main className="min-h-screen p-24">
      <Link href={"/"}>&larr; Synthlet</Link>
      <div className="flex mt-4">
        <Drum8 />
      </div>
    </main>
  );
}
