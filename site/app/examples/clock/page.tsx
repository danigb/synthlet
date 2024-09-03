import Link from "next/link";
import { ClockExample } from "./ClockExample";

export default function CrowSynthPage() {
  return (
    <div>
      <Link href={"/"}>&larr; Synthlet</Link>
      <div className="flex mt-4">
        <ClockExample />
      </div>
    </div>
  );
}
