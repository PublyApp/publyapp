import path from 'node:path';

// Wrap a shell argument in double-quotes so that paths containing spaces are
// passed as a single token rather than being split by the shell.
// JSON.stringify produces a valid double-quoted string for any path the OS allows.
const quoteArg = (value: string): string => JSON.stringify(value);

const getRepoPath = (file: string): string =>
	path.relative(process.cwd(), file).split(path.sep).join('/');

const isGeneratedFile = (file: string): boolean => {
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

const createOxfmtWriteCommand = (files: string[]): string | string[] =>
	files.length > 0
		? `oxfmt --write --no-error-on-unmatched-pattern ${files.map(quoteArg).join(' ')}`
		: [];

export default {
	// Extension list mirrors the globs in the root package.json "format" / "format:write" scripts
	// so that every file type oxfmt handles on a full run is also covered during staged-file runs.
	'*.{js,mjs,cjs,mts,cts,ts,jsx,tsx,html,svelte,css}': (
		filenames: string[],
	) => {
		const filteredFiles = filenames.filter((file) => !isGeneratedFile(file));

		return createOxfmtWriteCommand(filteredFiles);
	},
	'*.{json,jsonc}': (filenames: string[]) => {
		const filteredFiles = filenames.filter((file) => !isGeneratedFile(file));

		return createOxfmtWriteCommand(filteredFiles);
	},
	'*.cs': (absolutePaths: string[]) => {
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
			.map((file) => `--include ${quoteArg(file)}`)
			.join(' ');
		return `dotnet format ${includeParams} --exclude-diagnostics IDE0130`;
	},
};
