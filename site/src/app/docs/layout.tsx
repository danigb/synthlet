import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Synthlet",
  description: "Synthlet site",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <article className="markdown">
          <Link href="/">&larr; Synthlet</Link>
          {children}
        </article>
      </body>
    </html>
  );
}
