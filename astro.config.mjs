import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://horus-heresy-read-order-chart.voilin.net",
  output: "static",
  compressHTML: true,
  integrations: [react()],
});
