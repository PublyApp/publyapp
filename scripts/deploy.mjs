#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { upload as dokployUpload } from 'dokploy-from-source';
import fse from 'fs-extra';
import { Listr } from 'listr2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

async function main() {
	process.chdir(repoRoot);

	const args = parseArgs(process.argv.slice(2));

	const shouldBuildFront = args.target === 'front' || args.target === 'all';
	const shouldBuildApi = args.target === 'api' || args.target === 'all';

	if (args.skipBuild && shouldBuildApi) {
		throw new Error(
			'--skip-build is supported for front only (API publish is required).',
		);
	}

	const release = args.release || tryGetGitSha() || getTimestampRelease();
	const releaseRoot = path.join(repoRoot, '.dump', 'deploy-artifacts', release);

	const frontPort = process.env.DEPLOY_FRONT_PORT
		? Number.parseInt(process.env.DEPLOY_FRONT_PORT, 10)
		: 5050;
	if (Number.isNaN(frontPort) || frontPort <= 0) {
		throw new Error('DEPLOY_FRONT_PORT must be a valid port number');
	}

	/** @type {{release: string, releaseRoot: string, frontPort: number, frontArtifactDir: string, apiArtifactDir: string}} */
	const ctx = {
		release,
		releaseRoot,
		frontPort,
		frontArtifactDir: '',
		apiArtifactDir: '',
	};

	const tasks = new Listr(
		[
			{
				title: `Release: ${release}`,
				task: () => {
					return undefined;
				},
			},
			{
				title: 'Front (Node SSR)',
				enabled: () => {
					return shouldBuildFront;
				},
				task: () => {
					// Listr2 nesting pattern #1:
					// Returning a `new Listr([...])` directly is the simplest when the subtask list is static.
					return new Listr(
						[
							{
								title: 'Build (local)',
								enabled: () => {
									return !args.skipBuild;
								},
								task: () => {
									run('pnpm', ['-C', 'apps/front', 'run', 'build'], {
										cwd: repoRoot,
									});
								},
							},
							{
								title: 'Assemble artifact',
								task: (ctx, task) => {
									// Listr2 nesting pattern #2:
									// Use `(ctx, task) => task.newListr([...])` when you want to do some work first
									// (like computing/storing paths in ctx) and then create/run subtasks.
									ctx.frontArtifactDir = path.join(releaseRoot, 'front');
									return task.newListr(
										createFrontAssembleArtifactTasks({
											artifactDir: ctx.frontArtifactDir,
											frontPort,
										}),
										{ concurrent: false },
									);
								},
							},
							{
								title: 'Upload (dokploy-from-source)',
								enabled: () => {
									return args.upload;
								},
								task: async (ctx) => {
									await dokployUpload({
										appName: args.frontAppName,
										localPath: ctx.frontArtifactDir,
									});
								},
							},
						],
						{ concurrent: false },
					);
				},
			},
			{
				title: 'API (.NET)',
				enabled: () => {
					return shouldBuildApi;
				},
				task: () => {
					return new Listr(
						[
							{
								title: 'Assemble artifact',
								task: (ctx, task) => {
									ctx.apiArtifactDir = path.join(releaseRoot, 'api');
									return task.newListr(
										createApiAssembleArtifactTasks({
											artifactDir: ctx.apiArtifactDir,
										}),
										{ concurrent: false },
									);
								},
							},
							{
								title: 'Publish (local)',
								task: (ctx) => {
									if (!ctx.apiArtifactDir) {
										throw new Error(
											'API artifact dir is missing (internal error).',
										);
									}
									run('dotnet', [
										'publish',
										'apps/api/MainApi.csproj',
										'-c',
										'Release',
										'-o',
										path.join(ctx.apiArtifactDir, 'publish'),
										'-p:OpenApiGenerateDocuments=false',
										'-r',
										args.runtime,
										'--self-contained',
										'false',
									]);
								},
							},
							{
								title: 'Upload (dokploy-from-source)',
								enabled: () => {
									return args.upload;
								},
								task: async (ctx) => {
									await dokployUpload({
										appName: args.apiAppName,
										localPath: ctx.apiArtifactDir,
									});
								},
							},
						],
						{ concurrent: false },
					);
				},
			},
		],
		{ concurrent: false },
	);

	await tasks.run(ctx);

	console.log('');
	console.log('Done.');
	console.log(`Artifacts: ${releaseRoot}`);
	if (ctx.frontArtifactDir) {
		console.log(`Front: ${ctx.frontArtifactDir}`);
	}
	if (ctx.apiArtifactDir) {
		console.log(`API: ${ctx.apiArtifactDir}`);
	}
}

main().catch((err) => {
	console.error(err?.stack || err);
	process.exit(1);
});

function parseArgs(argv) {
	const args = {
		target: 'all',
		release: process.env.RELEASE_ID ?? '',
		runtime: process.env.DOTNET_PUBLISH_RUNTIME ?? 'linux-x64',
		skipBuild: false,
		upload: false,
		frontAppName: 'front',
		apiAppName: 'api',
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--target') {
			args.target = argv[i + 1] ?? '';
			i++;
			continue;
		}
		if (arg === '--release') {
			args.release = argv[i + 1] ?? '';
			i++;
			continue;
		}
		if (arg === '--runtime') {
			args.runtime = argv[i + 1] ?? '';
			i++;
			continue;
		}
		if (arg === '--front-app-name') {
			args.frontAppName = argv[i + 1] ?? '';
			i++;
			continue;
		}
		if (arg === '--api-app-name') {
			args.apiAppName = argv[i + 1] ?? '';
			i++;
			continue;
		}
		if (arg === '--skip-build') {
			args.skipBuild = true;
			continue;
		}
		if (arg === '--upload') {
			args.upload = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			printHelpAndExit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!['front', 'api', 'all'].includes(args.target)) {
		throw new Error(
			`--target must be one of: front, api, all (received: ${args.target})`,
		);
	}

	if (!args.frontAppName) {
		throw new Error('--front-app-name is required');
	}
	if (!args.apiAppName) {
		throw new Error('--api-app-name is required');
	}

	return args;
}

function printHelpAndExit(exitCode) {
	console.log(`
Usage:
  node scripts/deploy.mjs [options]

Options:
  --target <front|api|all>   Which artifact(s) to build (default: all)
  --release <id>             Release identifier (default: git sha or timestamp)
  --runtime <rid>            .NET publish runtime (default: linux-x64)
  --front-app-name <name>    App key in dfs.config.cjs for front (default: front)
  --api-app-name <name>      App key in dfs.config.cjs for api (default: api)
  --skip-build               Skip local builds (front only; API publish is required)
  --upload                   Upload via dokploy-from-source (programmatic API)
  -h, --help                 Show help

Environment:
  RELEASE_ID                 Override release id
  DOTNET_PUBLISH_RUNTIME     Override .NET publish runtime (e.g. linux-x64, linux-musl-x64)
  DEPLOY_FRONT_PORT          Front container port (default: 5050)

Config:
  Upload uses dokploy-from-source config/auth:
  - dfs.config.cjs in repo root
  - ~/.config/dfs/auth.json (managed by the dfs CLI)
`);
	process.exit(exitCode);
}

function run(command, args, options = {}) {
	// On Windows, package managers are usually exposed as *.cmd shims.
	const resolvedCommand =
		isWindows && command === 'pnpm' ? 'pnpm.cmd' : command;
	const shouldUseShell =
		isWindows &&
		(resolvedCommand.toLowerCase().endsWith('.cmd') ||
			resolvedCommand.toLowerCase().endsWith('.bat'));
	const res = spawnSync(resolvedCommand, args, {
		stdio: 'inherit',
		cwd: options.cwd ?? repoRoot,
		env: options.env ?? process.env,
		shell: shouldUseShell,
	});
	if (res.error) {
		throw res.error;
	}
	if (res.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(' ')}`);
	}
}

function tryGetGitSha() {
	const res = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
		stdio: 'pipe',
		cwd: repoRoot,
		shell: false,
	});
	if (res.status !== 0) {
		return '';
	}
	return String(res.stdout).trim();
}

function getTimestampRelease() {
	const iso = new Date().toISOString(); // UTC
	const yyyymmdd = iso.slice(0, 10).replaceAll('-', '');
	const hhmmss = iso.slice(11, 19).replaceAll(':', '');
	return `${yyyymmdd}-${hhmmss}`;
}

function getPnpmVersionFromPackageManagerField() {
	try {
		const pkg = fse.readJsonSync(path.join(repoRoot, 'package.json'));
		const pkgManager =
			typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
		const match = pkgManager.match(/^pnpm@(.+)$/);
		return match?.[1] ?? '';
	} catch {
		return '';
	}
}

function getFrontDockerfile({ port }) {
	const pnpmVersion = getPnpmVersionFromPackageManagerField();
	const preparePnpm = pnpmVersion
		? `corepack prepare pnpm@${pnpmVersion} --activate`
		: 'corepack prepare pnpm@latest --activate';

	return `FROM node:24-alpine
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.paths.json ./

COPY apps/front/package.json apps/front/package.json
COPY packages/shared-ts/package.json packages/shared-ts/package.json
COPY packages/client-ts/package.json packages/client-ts/package.json
COPY packages/_tsconfig/package.json packages/_tsconfig/package.json

ENV HUSKY=0
RUN corepack enable \\
  && ${preparePnpm} \\
  && pnpm install --prod --frozen-lockfile

COPY apps/front/server.js apps/front/server.js
COPY apps/front/build apps/front/build
COPY packages/shared-ts packages/shared-ts
COPY packages/client-ts packages/client-ts
COPY packages/_tsconfig packages/_tsconfig

WORKDIR /repo/apps/front
EXPOSE ${port}
ENV NODE_ENV=production
ENV PORT=${port}
CMD ["node", "server.js"]
`;
}

function getApiDockerfile() {
	return `FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app
COPY publish/ ./
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENTRYPOINT ["dotnet", "MainApi.dll"]
`;
}

async function copyWorkspaceSkeleton({ fromRel, artifactDir }) {
	const fromAbs = path.join(repoRoot, fromRel);
	const toAbs = path.join(artifactDir, fromRel);

	const pkgJsonFrom = path.join(fromAbs, 'package.json');
	if (!(await fse.pathExists(pkgJsonFrom))) {
		throw new Error(`Missing required file: ${fromRel}/package.json`);
	}

	await fse.ensureDir(toAbs);
	await fse.copy(pkgJsonFrom, path.join(toAbs, 'package.json'), {
		overwrite: true,
	});

	const scriptsFrom = path.join(fromAbs, 'scripts');
	if (await fse.pathExists(scriptsFrom)) {
		await fse.copy(scriptsFrom, path.join(toAbs, 'scripts'), {
			overwrite: true,
			filter: (src) => {
				return !src.replaceAll('\\', '/').includes('/node_modules/');
			},
		});
	}
}

function createFrontAssembleArtifactTasks({ artifactDir, frontPort }) {
	const requiredRootFiles = [
		'package.json',
		'pnpm-lock.yaml',
		'pnpm-workspace.yaml',
		'tsconfig.paths.json',
	];

	return [
		{
			title: 'Clean artifact dir',
			task: async () => {
				await fse.remove(artifactDir);
				await fse.ensureDir(artifactDir);
			},
		},
		{
			title: 'Copy root files',
			task: async () => {
				for (const fileName of requiredRootFiles) {
					const src = path.join(repoRoot, fileName);
					if (!(await fse.pathExists(src))) {
						throw new Error(`Missing required file: ${fileName}`);
					}
					await fse.copy(src, path.join(artifactDir, fileName), {
						overwrite: true,
					});
				}
			},
		},
		{
			title: 'Patch artifact root package.json (remove husky prepare)',
			task: async () => {
				const artifactRootPkgPath = path.join(artifactDir, 'package.json');
				const artifactRootPkg = await fse.readJson(artifactRootPkgPath);
				if (
					artifactRootPkg &&
					typeof artifactRootPkg === 'object' &&
					artifactRootPkg.scripts &&
					typeof artifactRootPkg.scripts === 'object'
				) {
					delete artifactRootPkg.scripts.prepare;
					await fse.writeJson(artifactRootPkgPath, artifactRootPkg, {
						spaces: 2,
					});
				}
			},
		},
		{
			title: 'Copy front package.json',
			task: async () => {
				const fromRel = 'apps/front/package.json';
				const fromAbs = path.join(repoRoot, fromRel);
				if (!(await fse.pathExists(fromAbs))) {
					throw new Error(`Missing required path: ${fromRel}`);
				}
				await fse.copy(fromAbs, path.join(artifactDir, fromRel), {
					overwrite: true,
				});
			},
		},
		{
			title: 'Copy front server.js',
			task: async () => {
				const fromRel = 'apps/front/server.js';
				const fromAbs = path.join(repoRoot, fromRel);
				if (!(await fse.pathExists(fromAbs))) {
					throw new Error(`Missing required path: ${fromRel}`);
				}
				await fse.copy(fromAbs, path.join(artifactDir, fromRel), {
					overwrite: true,
				});
			},
		},
		{
			title: 'Copy front scripts (if any)',
			task: async (_ctx, task) => {
				const fromRel = 'apps/front/scripts';
				const fromAbs = path.join(repoRoot, fromRel);
				if (!(await fse.pathExists(fromAbs))) {
					task.skip('No apps/front/scripts');
					return;
				}

				await fse.copy(fromAbs, path.join(artifactDir, fromRel), {
					overwrite: true,
					filter: (src) => {
						return !src.replaceAll('\\', '/').includes('/node_modules/');
					},
				});
			},
		},
		{
			title: 'Copy front build output',
			task: async () => {
				const fromRel = 'apps/front/build';
				const fromAbs = path.join(repoRoot, fromRel);
				if (!(await fse.pathExists(fromAbs))) {
					throw new Error(`Missing required path: ${fromRel}`);
				}
				await fse.copy(fromAbs, path.join(artifactDir, fromRel), {
					overwrite: true,
					filter: (src) => {
						return !src.replaceAll('\\', '/').includes('/node_modules/');
					},
				});
			},
		},
		{
			title: 'Copy workspace skeletons',
			task: (_ctx, task) => {
				return task.newListr(
					[
						{
							title: 'packages/shared-ts',
							task: async () => {
								await copyWorkspaceSkeleton({
									fromRel: 'packages/shared-ts',
									artifactDir,
								});
							},
						},
						{
							title: 'packages/client-ts',
							task: async () => {
								await copyWorkspaceSkeleton({
									fromRel: 'packages/client-ts',
									artifactDir,
								});
							},
						},
						{
							title: 'packages/_tsconfig',
							task: async () => {
								await copyWorkspaceSkeleton({
									fromRel: 'packages/_tsconfig',
									artifactDir,
								});
							},
						},
					],
					{ concurrent: false },
				);
			},
		},
		{
			title: 'Ensure shared-ts postinstall output dir',
			task: async () => {
				await fse.ensureDir(
					path.join(artifactDir, 'packages/shared-ts/lib/i18n/json'),
				);
			},
		},
		{
			title: 'Write Dockerfile',
			task: async () => {
				await fse.writeFile(
					path.join(artifactDir, 'Dockerfile'),
					getFrontDockerfile({ port: frontPort }),
					'utf8',
				);
			},
		},
		{
			title: 'Write .dockerignore',
			task: async () => {
				await fse.writeFile(
					path.join(artifactDir, '.dockerignore'),
					`${[
						'node_modules',
						'.git',
						'.turbo',
						'**/node_modules',
						'**/.turbo',
						'**/logs',
					].join('\n')}\n`,
					'utf8',
				);
			},
		},
	];
}

function createApiAssembleArtifactTasks({ artifactDir }) {
	return [
		{
			title: 'Clean artifact dir',
			task: async () => {
				await fse.remove(artifactDir);
				await fse.ensureDir(artifactDir);
			},
		},
		{
			title: 'Ensure publish output dir',
			task: async () => {
				await fse.ensureDir(path.join(artifactDir, 'publish'));
			},
		},
		{
			title: 'Write Dockerfile',
			task: async () => {
				await fse.writeFile(
					path.join(artifactDir, 'Dockerfile'),
					getApiDockerfile(),
					'utf8',
				);
			},
		},
		{
			title: 'Write .dockerignore',
			task: async () => {
				await fse.writeFile(
					path.join(artifactDir, '.dockerignore'),
					`${['.git', '.turbo', 'node_modules', '**/node_modules'].join('\n')}\n`,
					'utf8',
				);
			},
		},
	];
}
