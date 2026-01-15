import { defineConfig } from "tsup";
import { access, mkdir, rm } from "node:fs/promises";
import config from "./package.json";
//@ts-expect-error missing types for bestzip
import bestzip from "bestzip";

const outDir = "app";

async function bundleApp() {
	try {
		console.info("Cleaning up bundle directory");
		await access("./bundle");
		await rm("./bundle", { recursive: true });
	} catch (e) {}
	console.info("Creating bundle directory");
	await mkdir("./bundle");
	console.info("Packaging app...");
	const name = `${config.name}-${config.version}.zip`;
	await bestzip({
		source: [`./${outDir}/*`, `./.env.example`],
		destination: `./bundle/${name}`,
	});
}

export default defineConfig({
	entry: ["src/app.ts", "src/routes/**/*.ts"],
	minify: false,
	format: ["esm"],
	splitting: false,
	outDir,
	sourcemap: false,
	bundle: true,
	clean: true,
	treeshake: "safest",
	platform: "node",
	target: "esnext",
	noExternal: ["@packages/shared"],
	onSuccess: async () => {
		await bundleApp();
	},
});
