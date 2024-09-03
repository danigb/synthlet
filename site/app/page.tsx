import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex h-screen flex-col justify-center text-center">
      <h1 className="text-2xl font-bold">Synthlet</h1>
      <p className="mb-4 opacity-75 italic">
        Modular synthesis in your browser
      </p>
      <p className="text-fd-muted-foreground">
        You can open{" "}
        <Link
          href="/docs"
          className="text-fd-foreground font-semibold underline"
        >
          /docs
        </Link>{" "}
        and see the documentation.
      </p>
    </main>
  );
}
