const path = require('node:path');

module.exports = {
	'*.{js,ts,jsx,tsx,html,svelte}': 'biome format --write',
	'*.{json,jsonc}': 'biome format --write --no-errors-on-unmatched',
	'*.cs': (absolutePaths) => {
		const cwd = process.cwd();
		const relativePaths = absolutePaths.map((file) => path.relative(cwd, file));
		return `dotnet format --include ${relativePaths.join(' ')}"`;
	},
};
