import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ignite — FIRE budgeting",
    short_name: "Ignite",
    description:
      "Spending-focused budgeting. Ignite your path to financial independence.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0B1219",
    theme_color: "#0B1219",
    icons: [
      {
        src: "/brand/ignite-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/ignite-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
