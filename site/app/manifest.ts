import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fabrika Okulu",
    short_name: "Fabrika Okulu",
    description: "Kariyer gelişiminde yol arkadaşın.",
    start_url: "/panel",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#142b56",
    icons: [{ src: "/img/panel-icon.png", sizes: "512x512", type: "image/png" }],
  };
}
