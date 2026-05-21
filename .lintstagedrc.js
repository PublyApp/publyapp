const path = require('node:path');

const getRepoPath = (file) =>
	path.relative(process.cwd(), file).split(path.sep).join('/');

const isGeneratedFile = (file) => {
	const repoPath = getRepoPath(file);

	return (
		repoPath.startsWith('.artifacts/') ||
		repoPath.includes('/.artifacts/') ||
		repoPath.startsWith('packages/client-ts/') ||
		repoPath.startsWith('apps/api/Migrations/') ||
		repoPath.endsWith('.g.cs') ||
		repoPath === 'apps/api/openapi.json'
	);
};

const createOxfmtWriteCommand = (files) =>
	files.length > 0
		? `oxfmt --write --no-error-on-unmatched-pattern ${files.join(' ')}`
		: [];

module.exports = {
	'*.{js,ts,jsx,tsx,html,svelte}': (filenames) => {
		const filteredFiles = filenames.filter((file) => !isGeneratedFile(file));

		return createOxfmtWriteCommand(filteredFiles);
	},
	'*.{json,jsonc}': (filenames) => {
		const filteredFiles = filenames.filter((file) => !isGeneratedFile(file));

		return createOxfmtWriteCommand(filteredFiles);
	},
	'*.cs': (absolutePaths) => {
		const filteredPaths = absolutePaths.filter(
			(file) => !isGeneratedFile(file),
		);

		if (filteredPaths.length === 0) {
			return [];
		}

		const cwd = process.cwd();
		const relativePaths = filteredPaths.map((file) => path.relative(cwd, file));
		// dotnet format expects each file path as a separate --include parameter
		const includeParams = relativePaths
			.map((path) => `--include ${path}`)
			.join(' ');
		return `dotnet format ${includeParams} --exclude-diagnostics IDE0130`;
	},
};
