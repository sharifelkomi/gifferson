import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
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
      images: [{ url: "/og-v2.png", width: 1731, height: 909, alt: "Gifferson — Make a GIF. Leave no trace." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Gifferson — Make a GIF in your browser",
      description: "Drop in images, tune the timing, and export. Nothing gets uploaded or saved.",
      images: ["/og-v2.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem("gifferson-theme");var theme=saved==="light"||saved==="dark"?saved:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;var meta=document.createElement("meta");meta.name="theme-color";meta.content=theme==="dark"?"#161514":"#fbfaf9";document.head.appendChild(meta);}catch(e){document.documentElement.dataset.theme="light";}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
