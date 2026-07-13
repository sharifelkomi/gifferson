import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Gifferson — Make a GIF in your browser",
    description: "A private, no-account GIF maker that runs entirely in your browser.",
    openGraph: {
      title: "Gifferson — Make a GIF in your browser",
      description: "Drop in images, tune the timing, and export. Nothing gets uploaded or saved.",
      type: "website",
      images: [{ url: "/og.png", width: 1733, height: 907, alt: "Gifferson — Make a GIF. Leave no trace." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Gifferson — Make a GIF in your browser",
      description: "Drop in images, tune the timing, and export. Nothing gets uploaded or saved.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
