const path = require('node:path');

module.exports = {
	'*.{js,ts,jsx,tsx,html,svelte}': (filenames) => {
		// Filter out files in packages/client-ts since they are auto-generated
		const filteredFiles = filenames.filter(
			(file) => !file.includes('packages/client-ts/'),
		);
		return filteredFiles.length > 0
			? `biome format --write ${filteredFiles.join(' ')}`
			: [];
	},
	'*.{json,jsonc}': 'biome format --write --no-errors-on-unmatched',
	'*.cs': (absolutePaths) => {
		const cwd = process.cwd();
		const relativePaths = absolutePaths.map((file) => path.relative(cwd, file));
		// dotnet format expects each file path as a separate --include parameter
		const includeParams = relativePaths
			.map((path) => `--include ${path}`)
			.join(' ');
		return `dotnet format ${includeParams} --exclude-diagnostics IDE0130`;
	},
};
