import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Smokes the built front production server the way the workflow did: start it,
// poll the home page until it answers, then prove the served HTML links a
// stylesheet.
//
// Formerly the `run:` block of ci.yml::front-build::Smoke front production
// server: a backgrounded `pnpm --filter front start`, a `trap` kill, a 20-iteration
// `for` poll with `sleep 1`, and a final `grep -aEq` on the fetched HTML
// (docs/guides/languages.md: logic, so it is a script).

const origin = 'http://127.0.0.1:3000/';
const serverLog = '/tmp/front-ci-server.log';
const attempts = 20;

export const STYLESHEET_LINK = /rel="stylesheet"[^>]*href="[^"]+\.css"/;

/** True when the served page links a stylesheet — the assertion this step makes. */
export const hasStylesheetLink = (html: string): boolean =>
	STYLESHEET_LINK.test(html);

const fetchHome = () =>
	spawnSync('curl', ['-fsS', origin], { encoding: 'utf8' });

const sleep = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

const run = async () => {
	const log = openSync(serverLog, 'w');
	const server = spawn('pnpm', ['--filter', 'front', 'start'], {
		detached: true,
		stdio: ['ignore', log, log],
	});

	try {
		for (let attempt = 1; attempt <= attempts; attempt++) {
			if (fetchHome().status === 0) {
				break;
			}

			await sleep(1000);
		}

		const response = fetchHome();

		if (response.status !== 0) {
			console.error(`front server never answered ${origin} — see ${serverLog}`);
			process.exit(1);
		}

		if (!hasStylesheetLink(response.stdout)) {
			console.error(`front home page at ${origin} links no stylesheet`);
			process.exit(1);
		}
	} finally {
		// The shell killed the pnpm process only; the detached flag keeps the
		// group killable on the runner without changing that contract.
		server.kill('SIGTERM');
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run();
}
