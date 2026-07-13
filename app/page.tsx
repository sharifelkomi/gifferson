import type { Metadata } from "next";
import GifMaker from "./GifMaker";

export const metadata: Metadata = {
  title: "Gifferson — Make a GIF in your browser",
  description: "A private, no-account GIF maker that runs entirely in your browser.",
};

export default function Home() {
  return <GifMaker />;
}
