import Link from "next/link";
import { CrowMono } from "./CrowMono";

export default function CrowSynthPage() {
  return (
    <main className="min-h-screen p-24">
      <Link href={"/"}>&larr; Synthlet</Link>
      <div className="flex mt-4">
        <CrowMono />
      </div>
    </main>
  );
}