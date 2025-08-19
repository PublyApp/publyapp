// @ts-check
import { bunBuild } from './_bun-build.mjs';
import { buildOptions, createI18nResourcesFiles } from './config.mjs';

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
