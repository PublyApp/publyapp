import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.join(scriptsDirectory, 'verify-font-bundle.mts');

const createdDirectories = [];

after(() => {
	for (const directory of createdDirectories) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/**
 * Builds a throwaway dist tree: a CSS @font-face that declares a woff2 source,
 * the declared font file itself, and an empty locales directory. Returns the
 * `--dist` and `--locales-dir` values to hand to the verifier.
 */
const createFixture = (fontBytes) => {
	const root = mkdtempSync(path.join(tmpdir(), 'verify-font-bundle-'));
	createdDirectories.push(root);

	const distDir = path.join(root, 'dist');
	const fontDir = path.join(distDir, 'client', 'fonts', 'geist');
	const assetsDir = path.join(distDir, 'client', 'assets');
	mkdirSync(fontDir, { recursive: true });
	mkdirSync(assetsDir, { recursive: true });

	writeFileSync(
		path.join(assetsDir, 'app.css'),
		[
			'@font-face {',
			"	font-family: 'Geist';",
			"	src: url(/fonts/geist/Geist-Regular.woff2) format('woff2');",
			'	unicode-range: U+0000-00FF;',
			'}',
			'',
		].join('\n'),
	);
	writeFileSync(path.join(fontDir, 'Geist-Regular.woff2'), fontBytes);

	const localesDir = path.join(root, 'locales');
	mkdirSync(localesDir, { recursive: true });

	return { distDir, localesDir };
};

const runVerifier = async ({ distDir, localesDir }) => {
	try {
		await execFileAsync(process.execPath, [
			verifierPath,
			'--dist',
			distDir,
			'--locales-dir',
			localesDir,
		]);
		return { status: 0, stderr: '' };
	} catch (error) {
		return { status: error.code ?? 1, stderr: `${error.stderr ?? ''}` };
	}
};

// A 48-byte header that passes the signature, flavor and length guards but
// declares a compressed payload that cannot fit: the directory cursor sits at
// 48 and totalCompressedSize is 100, so the compressed range runs past the
// declared totalLength of 48.
const buildOverlongCompressedSizeHeader = () => {
	const buffer = Buffer.alloc(48);
	buffer.writeUInt32BE(0x774f4632, 0); // 'wOF2'
	buffer.writeUInt32BE(0x00010000, 4); // flavor
	buffer.writeUInt32BE(48, 8); // totalLength
	buffer.writeUInt32BE(100, 20); // totalCompressedSize
	return buffer;
};

test('rejection names the failing font file when compressed data overruns the payload', async () => {
	const { status, stderr } = await runVerifier(
		createFixture(buildOverlongCompressedSizeHeader()),
	);

	assert.equal(status, 1);
	assert.match(stderr, /Geist-Regular\.woff2/);
	assert.match(stderr, /declares compressed data longer than file length/);
	assert.doesNotMatch(stderr, /Font file\s{2}/);
});

// A header that declares one table directory entry while the file ends right
// after the 48-byte header: reading that entry's base-128 length runs off the
// end of the buffer, which is a helper-thrown error that must name the file too.
const buildTruncatedTableDirectoryHeader = () => {
	const buffer = Buffer.alloc(48);
	buffer.writeUInt32BE(0x774f4632, 0); // 'wOF2'
	buffer.writeUInt32BE(0x00010000, 4); // flavor
	buffer.writeUInt32BE(48, 8); // totalLength
	buffer.writeUInt16BE(1, 12); // numTables
	buffer.writeUInt32BE(0, 20); // totalCompressedSize
	return buffer;
};

test('rejection names the failing font file when the table directory is truncated', async () => {
	const { status, stderr } = await runVerifier(
		createFixture(buildTruncatedTableDirectoryHeader()),
	);

	assert.equal(status, 1);
	assert.match(stderr, /Geist-Regular\.woff2/);
	assert.match(stderr, /table directory truncated/);
	assert.doesNotMatch(stderr, /Font file\s{2}/);
});

test('rejection names the failing locale file when its JSON is malformed', async () => {
	const { distDir, localesDir } = createFixture(
		buildOverlongCompressedSizeHeader(),
	);
	writeFileSync(path.join(localesDir, 'fr.json'), '{"greeting": "salut",');

	const { status, stderr } = await runVerifier({ distDir, localesDir });

	assert.equal(status, 1);
	assert.match(stderr, /fr\.json/);
	assert.match(stderr, /is not valid JSON/);
	assert.doesNotMatch(stderr, /Locale file\s{2}/);
});

test('rejection surfaces a locale file read failure as a read error, not a JSON error', async () => {
	const { distDir, localesDir } = createFixture(
		buildOverlongCompressedSizeHeader(),
	);
	// A broken symlink keeps the .json entry visible to readdirSync while
	// making readFileSync fail: the verifier must surface that as a
	// file-naming read error, never relabel it as malformed JSON.
	symlinkSync(
		path.join(localesDir, 'missing-target.json'),
		path.join(localesDir, 'fr.json'),
	);

	const { status, stderr } = await runVerifier({ distDir, localesDir });

	assert.equal(status, 1);
	assert.match(stderr, /fr\.json/);
	assert.match(stderr, /ENOENT: no such file or directory/);
	assert.doesNotMatch(stderr, /is not valid JSON/);
});
