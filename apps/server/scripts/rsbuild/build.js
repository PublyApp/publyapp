/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const { createRsbuild, build, createI18nResourcesFiles } = require("./config");

const toDeploy = ["preprod", "production"].includes(process.env.MODE || "");

if (toDeploy) {
	process.env.NODE_ENV = "production";
} else {
	process.env.NODE_ENV = "development";
}

const run = async () => {
	const rsbuild = await createRsbuild();

	rsbuild.onAfterBuild(async () => {
		// create the i18n resources files in .jsonc format
		const { resources } = await import(
			`../../dist/i18n.mjs?update=${Date.now()}`
		); // we want the updated version and not the cached one
		await createI18nResourcesFiles(resources);
	});

	build(rsbuild);
};

run();
