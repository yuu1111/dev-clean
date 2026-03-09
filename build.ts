import { build } from "esbuild";

await build({
	entryPoints: ["src/cli.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	outfile: "dist/cli.js",
	banner: { js: "#!/usr/bin/env node" },
	minify: true,
	plugins: [
		{
			name: "cs-minify",
			setup(build) {
				build.onLoad({ filter: /\.cs$/ }, async (args) => {
					const text = await Bun.file(args.path).text();
					const minified = text
						.split("\n")
						.filter((line) => !line.trimStart().startsWith("//"))
						.map((line) => line.trim())
						.filter((line) => line !== "")
						.join("\n");
					return { contents: minified, loader: "text" };
				});
			},
		},
	],
});
