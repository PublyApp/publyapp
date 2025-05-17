// @ts-check
import { createI18nResourcesFiles } from '../rsbuild/config.mjs';
import { bunBuild } from "./_bun-build.mjs";
import { buildOptions } from "./config.mjs";

bunBuild({
	...buildOptions,
	minify: true,
	onBuild: async () => {
		// create the i18n resources files in .jsonc format
		const { resources } = await import(
			`../../dist/_i18n.mjs?update=${Date.now()}`
		); // we want the updated version and not the cached one
		await createI18nResourcesFiles(resources);
	},
});
