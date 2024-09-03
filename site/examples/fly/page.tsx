import Link from "next/link";
import { FlyMono } from "./FlyMono";

export default function FlySynthPage() {
  return (
    <main className="min-h-screen p-24">
      <Link href={"/"}>&larr; Synthlet</Link>
      <div className="flex mt-4">
        <FlyMono />
      </div>
    </main>
  );
}
