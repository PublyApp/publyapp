// * solution found at:
// * https://github.com/oven-sh/bun/issues/5866#issuecomment-2691700945

import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const cwd = process.cwd();

function absolute(path/* : string */) {
	return resolve(cwd, path);
}

// async function getArtifactSources(artifact/* : BuildArtifact */) {
// 	const sourcemap = await artifact.sourcemap?.json();
// 	const sources = sourcemap ? (sourcemap.sources /* as string[] */) : [];
// 	return sources.map((source) => join(dirname(artifact.path), source));
// }
async function getArtifactSources(artifact/* : BuildArtifact */) {
	const sourcemap = await artifact.sourcemap?.json();
	if (!sourcemap) return [];
	return (sourcemap.sources/*  as string[] */).map((source) => join(dirname(artifact.path), source));
}

async function getOutputSources(output/* : BuildOutput */) {
	const sources = await Promise.all(output.outputs.map(getArtifactSources));
	return new Set(sources.flat().map(absolute));
}

// type BuildConfig = Parameters<typeof Bun.build>[0] & {
// 	watch?: string;
// 	onBuild?: (output: BuildOutput) => void;
// };
//  * @property {Parameters<typeof Bun.build>[0]} buildOptions - The build options for Bun.build

/**
 * @param {Parameters<typeof Bun.build>[0] & { watch?: string; onBuild: (output: BuildOutput) => Promise<void>}} config - The build configuration
 * @returns {Promise<BuildOutput>} - The build output
 */
export async function bunBuild(config/* : BuildConfig */) {
	const { watch, onBuild, sourcemap = "external", ...rest } = config;
	if (watch && config.sourcemap !== "external") {
		console.error("Watch requires external sourcemap, setting to external");
	}
	let output = await Bun.build({ ...rest, sourcemap });

	if (watch) {
		let sources = await getOutputSources(output);
		let debounce/* : Timer | null */ = null;
		let pending = false;

		const rebuild = async () => {
			if (pending) return;
			pending = true;
			output = await Bun.build({ ...rest, sourcemap });
			sources = await getOutputSources(output);
			onBuild?.(output);
			pending = false;
		};

		fs.watch(watch, { recursive: true }, (event, filename) => {
			if (!filename) return;
			const source = absolute(join(watch, filename));
			if (!sources.has(source)) return;
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(rebuild, 50);
		});
	}

	await onBuild?.(output);
	return output;
}
