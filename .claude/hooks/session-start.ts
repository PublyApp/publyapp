// SessionStart hook for Claude Code cloud sessions only: installs what the
// repo's gates need (dotnet SDK, just, Docker daemon, node and NuGet deps) so
// `just ci`, `just test-api` and the front checks run without manual setup.
// Idempotent: every step checks before acting. Local machines are untouched.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, openSync } from 'node:fs';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') {
	process.exit(0);
}

process.chdir(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

const log = (message: string): void => {
	console.error(`[session-start] ${message}`);
};

/** Runs a command quietly; returns whether it exited 0. */
const ok = (cmd: string, args: string[], env?: NodeJS.ProcessEnv): boolean =>
	spawnSync(cmd, args, {
		stdio: ['ignore', 'ignore', 'inherit'],
		env: { ...process.env, ...env },
	}).status === 0;

/** Same, but aborts the hook on failure (the old `set -e`). */
const must = (cmd: string, args: string[], env?: NodeJS.ProcessEnv): void => {
	if (!ok(cmd, args, env)) {
		log(`FAILED: ${cmd} ${args.join(' ')}`);
		process.exit(1);
	}
};

// .NET SDK: global.json pins 10.0.1xx with rollForward latestPatch. The
// dot.net installer host is not reachable from cloud sessions; the Ubuntu
// archive package is (10.0.1xx band, so it satisfies the pin).
if (!ok('dotnet', ['--version'])) {
	log('installing dotnet-sdk-10.0 (apt)');
	const apt = { DEBIAN_FRONTEND: 'noninteractive' };
	must('apt-get', ['update', '-qq'], apt);
	must('apt-get', ['install', '-y', '-qq', 'dotnet-sdk-10.0'], apt);
}

// just: the justfile needs a recent just (the apt package is too old to parse
// it), so use the npm-distributed binary.
if (!ok('just', ['--list'])) {
	log('installing just (npm rust-just)');
	if (ok('dpkg', ['-s', 'just'])) {
		ok('apt-get', ['remove', '-y', '-qq', 'just']);
	}
	must('npm', ['install', '-g', 'rust-just']);
}

// Docker daemon: Testcontainers (API tests) needs it; cloud containers ship the
// client but do not start the daemon.
if (ok('dockerd', ['--version']) && !ok('docker', ['info'])) {
	log('starting dockerd');
	const out = openSync('/tmp/dockerd.log', 'w');
	spawn('dockerd', [], { detached: true, stdio: ['ignore', out, out] }).unref();
	for (let i = 0; i < 30 && !ok('docker', ['info']); i++) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	if (!ok('docker', ['info'])) {
		log('WARNING: dockerd did not come up (see /tmp/dockerd.log)');
	}
}

// Local env file the API loads in Development (gitignored).
if (!existsSync('.env.development') && existsSync('.env.example')) {
	log('creating .env.development from .env.example');
	copyFileSync('.env.example', '.env.development');
}

// Node workspace deps (also wires the versioned git hooks via `prepare`).
log('pnpm install');
must('pnpm', ['install', '--prefer-offline']);

// NuGet packages and local dotnet tools (Kiota, etc.).
log('dotnet restore + tool restore');
must('dotnet', ['tool', 'restore']);
must('dotnet', ['restore', 'apps/api/Tests/PublyApp.Api.Tests.csproj']);

log('done');
