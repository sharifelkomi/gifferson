import type { Metadata } from "next";
import { preload } from "react-dom";
import "@fontsource-variable/inter";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import "./globals.css";

const title = "Gifferson — Make a GIF in your browser";
const description = "A private, no-account GIF maker that runs entirely in your browser.";
const shareDescription = "Drop in images, tune the timing, and export. Nothing gets uploaded or saved.";
const ogImage = { url: "/og-image.png", width: 1200, height: 630, alt: "Gifferson" };

export const metadata: Metadata = {
  metadataBase: new URL("https://gifferson.com"),
  title,
  description,
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title,
    description: shareDescription,
    url: "/",
    siteName: "Gifferson",
    type: "website",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: shareDescription,
    images: [ogImage.url],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Only the Latin file: the other subsets load on demand via unicode-range.
  preload(interLatin, { as: "font", type: "font/woff2", crossOrigin: "" });
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
