import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import AutoImport from "unplugin-auto-import/vite";

import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";

export default defineConfig({
    plugins: [
        vue(),
        AutoImport({
            imports: ["vue"],
            resolvers: [ElementPlusResolver()],
            dts: "src/renderer/types/auto-import.d.ts",
        }),
        Components({
            resolvers: [ElementPlusResolver()],
            dts: "src/renderer/types/components.d.ts",
        }),
    ],
    base: "./",
    build: {
        outDir: "src/renderer/dist",
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src/renderer"),
        },
    },
    server: {
        port: 5173,
        host: "0.0.0.0",
    },
});
