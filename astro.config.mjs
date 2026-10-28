import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  compressHTML: true,
  integrations: [react()],
});
