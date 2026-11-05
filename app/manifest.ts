import type { MetadataRoute } from "next";
import { PERSON } from "@/content/worlds";

// Installed, the site opens where a visit does: the black page with the one
// sentence, so it starts on black. The icon is the mat's (app/icon.svg), with
// PNGs for launchers that want them and a maskable one whose letters sit
// inside the circle Android may cut it to.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PERSON.name,
    short_name: PERSON.first,
    description: "Hi, my name is Aiden. Founder, student, builder and designer.",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
