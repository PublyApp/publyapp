import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

type ChildResult = { stdout: string; stderr: string; signal: string | null };
type ChildBundle = { dir: string; script: string };

/** A real Node process: only a process-level signal proves the hook fires. */
const bundleChild = async (): Promise<ChildBundle> => {
	const dir = await mkdtemp(join(tmpdir(), 'logger-sigterm-'));
	await build({
		configFile: false,
		logLevel: 'silent',
		root: process.cwd(),
		build: {
			outDir: dir,
			emptyOutDir: true,
			minify: false,
			ssr: 'src/lib/logger/__tests__/fixtures/sigterm-child.ts',
			rolldownOptions: { output: { entryFileNames: 'sigterm-child.mjs' } },
		},
	});
	const [file] = (await readdir(dir)).filter((name) => name.endsWith('.mjs'));
	if (!file) {
		throw new Error('the child bundle was not written');
	}
	return { dir, script: join(dir, file) };
};

const runChild = async (script: string): Promise<ChildResult> =>
	new Promise<ChildResult>((resolve, reject) => {
		const child = spawn(process.execPath, [script], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			const text = Buffer.concat(stderr).toString();
			if (!text.includes('ready')) {
				reject(
					new Error(`child died before ready (code=${code} signal=${signal})`),
				);
				return;
			}
			resolve({
				stdout: Buffer.concat(stdout).toString(),
				stderr: text,
				signal,
			});
		});
		child.stderr.once('data', () => child.kill('SIGTERM'));
	});

describe('StdoutJsonLoggerAdapter in a real process', () => {
	it('flushes the buffered lines on SIGTERM and the process still dies by SIGTERM', async () => {
		const { dir, script } = await bundleChild();
		try {
			const { stdout, signal } = await runChild(script);
			const messages = stdout
				.split('\n')
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line).message);
			expect(messages).toEqual(['first line', 'second line']);
			expect(signal).toBe('SIGTERM');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}, 30_000);
});
