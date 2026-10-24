import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the reel player as one IIFE script + one stylesheet. The CLI inlines
// both into each reel's index.html so a reel is a single portable file.
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "skills/mutoscope/runtime/player",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "src/player/main.tsx",
      name: "MutoscopePlayer",
      formats: ["iife"],
      fileName: () => "player.js",
      cssFileName: "player",
    },
  },
});
