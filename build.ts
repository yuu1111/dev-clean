import { build } from "esbuild";

const pkg = await Bun.file("package.json").json();

await build({
	entryPoints: ["src/cli.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	outfile: "dist/cli.js",
	banner: { js: "#!/usr/bin/env node" },
	minify: true,
	define: { __VERSION__: JSON.stringify(pkg.version) },
	plugins: [
		{
			name: "cs-minify",
			setup(build) {
				build.onLoad({ filter: /\.cs$/ }, async (args) => {
					const text = await Bun.file(args.path).text();
				const abbrevs: [string, string][] = [
						["PROCESS_BASIC_INFORMATION", "PBI"],
						["PROCESS_QUERY_INFORMATION", "PQI"],
						["PROCESS_VM_READ", "PVR"],
						["processParams", "pp"],
						["paramsPtr", "pPtr"],
						["pathBuf", "pB"],
						["Reserved", "R"],
					];
					let minified = text
						.split("\n")
						.filter((line) => !line.trimStart().startsWith("//"))
						.map((line) => line.trim())
						.filter((line) => line !== "")
						.join(" ")
						.replace(/ *([{};,()]) */g, "$1")
						.replace(/\s+/g, " ");
					for (const [from, to] of abbrevs) {
						minified = minified.replaceAll(from, to);
					}
					return { contents: minified, loader: "text" };
				});
			},
		},
	],
});
