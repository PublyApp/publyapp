#!/usr/bin/env node
// @ts-check
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { upload as dokployUpload } from 'dokploy-from-source';
import fse from 'fs-extra';
import { color, Listr } from 'listr2';

/** @typedef {import('listr2').ListrRendererValue} ListrRendererValue */
/** @typedef {import('listr2').ListrTaskWrapper<any, any, any>} ListrTaskWrapper */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

async function main() {
	process.chdir(repoRoot);

	const args = parseArgs(process.argv.slice(2));
	const listrOptions = createListrOptions(args);

	if (args.skipBuild && args.target !== 'front') {
		throw new Error(
			'--skip-build is supported for front only (API publish is required).',
		);
	}

	const release =
		args.release || (await tryGetGitSha()) || getTimestampRelease();
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

	const topLevelTasks = createTopLevelTasks({
		args,
		release,
		releaseRoot,
		frontPort,
		listrOptions,
	});

	const tasks = new Listr(
		withStepTitles(topLevelTasks, { level: 0 }),
		listrOptions,
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

function styleTaskTitle(title, level) {
	const styled = color.cyan(title);
	return level === 0 ? color.bold(styled) : styled;
}

function withStepTitles(tasks, options = {}) {
	const level = options.level ?? 0;
	const total = tasks.length;
	return tasks.map((task, index) => {
		const prefix = `${color.dim(`[${index + 1}/${total}]`)} `;
		if (typeof task.title === 'string') {
			return {
				...task,
				title: `${prefix}${styleTaskTitle(task.title, level)}`,
			};
		}
		if (typeof task.title === 'function') {
			const originalTitle = task.title;
			return {
				...task,
				title: (ctx, taskWrapper) => {
					return `${prefix}${styleTaskTitle(
						String(originalTitle(ctx, taskWrapper)),
						level,
					)}`;
				},
			};
		}
		return task;
	});
}

function createListrOptions(args) {
	/** @type {import('listr2').ListrBaseClassOptions<any, ListrRendererValue, ListrRendererValue>} */
	const listrOptions = {
		concurrent: false,
		renderer: /** @type {ListrRendererValue} */ (args.renderer),
	};

	// Keep subtasks visible after completion so the final output is still informative
	// (e.g. you can still see whether "Upload" ran).
	if (args.renderer === 'default') {
		listrOptions.rendererOptions = /** @type {any} */ ({
			showSubtasks: true,
			collapseSubtasks: false,
		});
	}

	return listrOptions;
}

function createReleaseTask(release) {
	return {
		title: `Release: ${release}`,
		task: () => {
			return undefined;
		},
	};
}

function createFrontTasks({ args, releaseRoot, frontPort, listrOptions }) {
	/** @type {any[]} */
	const tasks = [];

	if (!args.skipBuild) {
		tasks.push({
			title: 'Build (local)',
			task: async (_ctx, task) => {
				await run('pnpm', ['-C', 'apps/front', 'run', 'build'], {
					cwd: repoRoot,
					task,
				});
			},
		});
	}

	tasks.push({
		title: 'Assemble artifact',
		task: (ctx, task) => {
			ctx.frontArtifactDir = path.join(releaseRoot, 'front');
			return task.newListr(
				createFrontAssembleArtifactTasks({
					artifactDir: ctx.frontArtifactDir,
					frontPort,
				}),
				listrOptions,
			);
		},
	});

	if (args.upload) {
		tasks.push({
			title: 'Upload (dokploy-from-source)',
			task: async (ctx) => {
				await dokployUploadWithRetry(
					{
						appName: args.frontAppName,
						localPath: ctx.frontArtifactDir,
					},
					{ title: 'front upload' },
				);
			},
		});
	}

	return tasks;
}

function createApiTasks({ args, releaseRoot, listrOptions }) {
	/** @type {any[]} */
	const tasks = [
		{
			title: 'Assemble artifact',
			task: (ctx, task) => {
				ctx.apiArtifactDir = path.join(releaseRoot, 'api');
				return task.newListr(
					createApiAssembleArtifactTasks({
						artifactDir: ctx.apiArtifactDir,
					}),
					listrOptions,
				);
			},
		},
		{
			title: 'Publish (local)',
			task: async (ctx, task) => {
				if (!ctx.apiArtifactDir) {
					throw new Error('API artifact dir is missing (internal error).');
				}
				await run(
					'dotnet',
					[
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
					],
					{ task },
				);
			},
		},
	];

	if (args.upload) {
		tasks.push({
			title: 'Upload (dokploy-from-source)',
			task: async (ctx) => {
				await dokployUploadWithRetry(
					{
						appName: args.apiAppName,
						localPath: ctx.apiArtifactDir,
					},
					{ title: 'api upload' },
				);
			},
		});
	}

	return tasks;
}

function createTopLevelTasks({
	args,
	release,
	releaseRoot,
	frontPort,
	listrOptions,
}) {
	const shouldBuildFront = args.target === 'front' || args.target === 'all';
	const shouldBuildApi = args.target === 'api' || args.target === 'all';

	/** @type {any[]} */
	const tasks = [createReleaseTask(release)];

	if (shouldBuildFront) {
		const frontTasks = createFrontTasks({
			args,
			releaseRoot,
			frontPort,
			listrOptions,
		});
		tasks.push({
			title: 'Front (Node SSR)',
			task: () => {
				return new Listr(
					withStepTitles(frontTasks, { level: 1 }),
					listrOptions,
				);
			},
		});
	}

	if (shouldBuildApi) {
		const apiTasks = createApiTasks({ args, releaseRoot, listrOptions });
		tasks.push({
			title: 'API (.NET)',
			task: () => {
				return new Listr(withStepTitles(apiTasks, { level: 1 }), listrOptions);
			},
		});
	}

	return tasks;
}

function parseArgs(argv) {
	const args = {
		target: 'all',
		release: process.env.RELEASE_ID ?? '',
		runtime: process.env.DOTNET_PUBLISH_RUNTIME ?? 'linux-x64',
		skipBuild: false,
		upload: false,
		frontAppName: 'front',
		apiAppName: 'api',
		renderer: 'default',
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
		if (arg === '--renderer') {
			args.renderer = argv[i + 1] ?? '';
			i++;
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

	if (!['default', 'verbose', 'silent', 'simple'].includes(args.renderer)) {
		throw new Error(
			`--renderer must be one of: default, verbose, silent, simple (received: ${args.renderer})`,
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
  --renderer <name>          Console renderer: default|verbose|silent|simple (default: default)
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

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function spawnChild(command, args, options) {
	const cwd = options.cwd ?? repoRoot;
	const env = options.env ?? process.env;
	const stdio = options.stdio ?? 'inherit';

	// Avoid `shell: true` (DEP0190). On Windows, `pnpm` is typically a `.cmd` shim,
	// which can't be spawned directly without involving `cmd.exe`.
	if (isWindows) {
		const lower = command.toLowerCase();
		const shouldUseCmd =
			lower === 'pnpm' || lower.endsWith('.cmd') || lower.endsWith('.bat');

		if (shouldUseCmd) {
			const comspec = process.env.ComSpec ?? 'cmd.exe';
			return spawn(comspec, ['/d', '/s', '/c', command, ...args], {
				stdio,
				cwd,
				env,
				shell: false,
				windowsHide: true,
			});
		}
	}

	return spawn(command, args, {
		stdio,
		cwd,
		env,
		shell: false,
		windowsHide: true,
	});
}

function run(command, args, options = {}) {
	const cwd = options.cwd ?? repoRoot;
	const env = options.env ?? process.env;
	/** @type {ListrTaskWrapper | undefined} */
	const task = options.task;

	return new Promise((resolve, reject) => {
		const child = spawnChild(command, args, {
			cwd,
			env,
			stdio: task ? ['inherit', 'pipe', 'pipe'] : 'inherit',
		});

		/** @type {import('node:stream').Writable | undefined} */
		let stdoutWriter;
		/** @type {import('node:stream').Writable | undefined} */
		let stderrWriter;
		if (task) {
			stdoutWriter = task.stdout();
			stderrWriter = task.stdout();

			if (child.stdout) {
				child.stdout.pipe(stdoutWriter, { end: false });
			}
			if (child.stderr) {
				child.stderr.pipe(stderrWriter, { end: false });
			}
		}

		child.on('error', (err) => {
			reject(err);
		});

		child.on('close', (code) => {
			stdoutWriter?.end();
			stderrWriter?.end();

			if (code === 0) {
				resolve(void 0);
				return;
			}

			reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
		});
	});
}

async function runCapture(command, args, options = {}) {
	const cwd = options.cwd ?? repoRoot;
	const env = options.env ?? process.env;

	return new Promise((resolve, reject) => {
		const child = spawnChild(command, args, { cwd, env, stdio: 'pipe' });

		/** @type {Buffer[]} */
		const stdoutChunks = [];

		if (child.stdout) {
			child.stdout.on('data', (chunk) => {
				stdoutChunks.push(Buffer.from(chunk));
			});
		}

		child.on('error', (err) => {
			reject(err);
		});

		child.on('close', (code) => {
			if (code !== 0) {
				resolve('');
				return;
			}

			resolve(Buffer.concat(stdoutChunks).toString('utf8').trim());
		});
	});
}

async function tryGetGitSha() {
	return await runCapture('git', ['rev-parse', '--short=12', 'HEAD'], {
		cwd: repoRoot,
	});
}

function getTimestampRelease() {
	const iso = new Date().toISOString(); // UTC
	const yyyymmdd = iso.slice(0, 10).replaceAll('-', '');
	const hhmmss = iso.slice(11, 19).replaceAll(':', '');
	return `${yyyymmdd}-${hhmmss}`;
}

async function getPnpmVersionFromPackageManagerField() {
	try {
		const pkg = await fse.readJson(path.join(repoRoot, 'package.json'));
		const pkgManager =
			typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
		const match = pkgManager.match(/^pnpm@(.+)$/);
		return match?.[1] ?? '';
	} catch {
		return '';
	}
}

async function dokployUploadWithRetry(options, retryOptions = {}) {
	const title = retryOptions.title ?? 'upload';
	const maxAttempts = retryOptions.maxAttempts ?? 3;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await dokployUpload(options);
		} catch (err) {
			const statusCode =
				/** @type {any} */ (err)?.statusCode ??
				/** @type {any} */ (err)?.status ??
				/** @type {any} */ (err)?.response?.status ??
				0;

			const errorCode = String(/** @type {any} */(err)?.code ?? '');
			const message = String(/** @type {any} */(err)?.message ?? '');
			const isRetryable =
				statusCode === 499 ||
				errorCode === 'TIMEOUT' ||
				/Request timed out/i.test(message);

			if (!isRetryable || attempt === maxAttempts) {
				throw err;
			}

			const waitMs = 2000 * attempt;
			console.warn(
				`Retrying ${title} after error (attempt ${attempt}/${maxAttempts}, waiting ${waitMs}ms)...`,
			);
			await sleep(waitMs);
		}
	}

	throw new Error('Unreachable: upload retry loop exhausted.');
}

async function getFrontDockerfile({ port }) {
	const pnpmVersion = await getPnpmVersionFromPackageManagerField();
	const preparePnpm = pnpmVersion
		? `corepack prepare pnpm@${pnpmVersion} --activate`
		: 'corepack prepare pnpm@latest --activate';

	return `FROM node:24-alpine
WORKDIR /repo

COPY apps/front/package.json apps/front/package.json
COPY packages/shared-ts/package.json packages/shared-ts/package.json
COPY packages/client-ts/package.json packages/client-ts/package.json
COPY packages/_tsconfig/package.json packages/_tsconfig/package.json

COPY packages/shared-ts/scripts packages/shared-ts/scripts
COPY packages/shared-ts/lib/i18n/json packages/shared-ts/lib/i18n/json
COPY packages/client-ts/scripts packages/client-ts/scripts
COPY packages/_tsconfig/scripts packages/_tsconfig/scripts

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

	// Ensure `scripts/` exists so Dockerfile COPY directives can be unconditional.
	await fse.ensureDir(path.join(toAbs, 'scripts'));

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
	];

	return withStepTitles(
		[
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
						withStepTitles(
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
							{ level: 3 },
						),
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
						await getFrontDockerfile({ port: frontPort }),
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
		],
		{ level: 2 },
	);
}

function createApiAssembleArtifactTasks({ artifactDir }) {
	return withStepTitles(
		[
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
		],
		{ level: 2 },
	);
}
