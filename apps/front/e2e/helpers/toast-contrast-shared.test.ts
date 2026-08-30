import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
	BROWSER_SCREENSHOT_DECODER_SNIPPET,
	BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET,
	SCREENSHOT_DATA_URL_PREFIX,
	__publyAssertTextPaintIsMeasurable,
	__publyClassifyTextPaint,
	__publyDecodeScreenshot,
	__publyIsTransparentColor,
	__publyNormalize,
	assertTextPaintIsMeasurable,
	classifyTextPaint,
	decodeScreenshotDataUrl,
	unionRects,
} from './toast-contrast-shared';

const tinyPngBase64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

describe('decodeScreenshotDataUrl', () => {
	test('decodes a 1x1 png data url to bytes', () => {
		const dataUrl = `${SCREENSHOT_DATA_URL_PREFIX}${tinyPngBase64}`;
		const bytes = decodeScreenshotDataUrl(dataUrl);
		expect(bytes.length).toBeGreaterThan(0);
		expect(bytes[0]).toBe(0x89);
		expect(bytes[1]).toBe(0x50);
	});

	test('throws on wrong prefix', () => {
		expect(() =>
			decodeScreenshotDataUrl('data:image/jpeg;base64,abcd'),
		).toThrow(/must start with/);
	});

	test('throws on empty payload', () => {
		expect(() => decodeScreenshotDataUrl(SCREENSHOT_DATA_URL_PREFIX)).toThrow(
			/empty base64/,
		);
	});

	test('browser decoder snippet is available for evaluate-side reuse', async () => {
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain('atob(base64)');
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain('createImageBitmap');
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain('new Blob([bytes]');
	});

	test('browser text-paint classifier snippet is available for evaluate-side reuse', () => {
		expect(BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET).toContain(
			'__publyClassifyTextPaint',
		);
		expect(BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET).toContain(
			'__publyAssertTextPaintIsMeasurable',
		);
		expect(BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET).toContain(
			'background-clip:text',
		);
	});

	test('spec wires the shared decoder through BROWSER_SCREENSHOT_DECODER_SNIPPET', () => {
		const specPath = fileURLToPath(
			new URL('../toast-contrast.spec.ts', import.meta.url),
		);
		const spec = readFileSync(specPath, 'utf8');
		expect(spec).toContain('BROWSER_SCREENSHOT_DECODER_SNIPPET');
		expect(spec).toContain('decoderSnippet');
		expect(spec).not.toMatch(/new Blob\(\[bytes\]/);
	});

	test('spec wires the shared classifier through BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET', () => {
		const specPath = fileURLToPath(
			new URL('../toast-contrast.spec.ts', import.meta.url),
		);
		const spec = readFileSync(specPath, 'utf8');
		expect(spec).toContain('BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET');
		expect(spec).toContain('classifierSnippet');
		expect(spec).not.toMatch(
			/clipValue && clipValue\.toLowerCase\(\)\.includes\('text'\)/,
		);
	});
});

describe('classifyTextPaint — clipped/transparent/masked fail-loud', () => {
	test('opaque plain text passes', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
			}),
		).toBe('opaque');
	});

	test('background-clip:text is undecidable — even if the background is opaque', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'text',
				color: 'rgba(0, 0, 0, 0)',
			}),
		).toBe('clipped');
		expect(
			classifyTextPaint({
				backgroundClip: 'text',
				webkitBackgroundClip: 'text',
				color: 'rgb(10, 10, 10)',
			}),
		).toBe('clipped');
	});

	test('webkit-text-fill-color transparent is undecidable', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(10, 10, 10)',
				webkitTextFillColor: 'transparent',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(10, 10, 10)',
				webkitTextFillColor: 'rgba(0, 0, 0, 0)',
			}),
		).toBe('transparent-fill');
	});

	test('color transparent is undecidable regardless of background-clip', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'transparent',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgba(0, 0, 0, 0)',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgba(10, 20, 30, 0)',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'hsla(0, 0%, 0%, 0)',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'hsla(200, 50%, 50%, 0)',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(0 0 0 / 0)',
			}),
		).toBe('transparent-fill');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'hsl(0 0% 0% / 0)',
			}),
		).toBe('transparent-fill');
	});

	test('opacity 0 is undecidable', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				opacity: '0',
			}),
		).toBe('transparent-opacity');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				opacity: '0.0',
			}),
		).toBe('transparent-opacity');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				opacity: '1',
			}),
		).toBe('opaque');
	});

	test('mask-image / mask is undecidable', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				maskImage: 'linear-gradient(black, transparent)',
			}),
		).toBe('masked');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				mask: 'url(#mask)',
			}),
		).toBe('masked');
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				maskImage: 'none',
				mask: 'none',
			}),
		).toBe('opaque');
	});

	test('assertTextPaintIsMeasurable throws on clipped/transparent/masked and passes on opaque', () => {
		expect(() =>
			assertTextPaintIsMeasurable(
				{ backgroundClip: 'border-box', color: 'rgb(0,0,0)' },
				'title',
			),
		).not.toThrow();
		expect(() =>
			assertTextPaintIsMeasurable(
				{ backgroundClip: 'text', color: 'transparent' },
				'title',
			),
		).toThrow(/background-clip:text/);
		expect(() =>
			assertTextPaintIsMeasurable(
				{
					backgroundClip: 'border-box',
					color: 'rgb(0,0,0)',
					webkitTextFillColor: 'transparent',
				},
				'title',
			),
		).toThrow(/transparent text fill/i);
		expect(() =>
			assertTextPaintIsMeasurable(
				{ backgroundClip: 'border-box', color: 'rgb(0,0,0)', opacity: '0' },
				'title',
			),
		).toThrow(/transparent opacity 0/i);
		expect(() =>
			assertTextPaintIsMeasurable(
				{
					backgroundClip: 'border-box',
					color: 'rgb(0,0,0)',
					maskImage: 'linear-gradient(black, transparent)',
				},
				'title',
			),
		).toThrow(/masked text/i);
		expect(() =>
			assertTextPaintIsMeasurable(
				{ backgroundClip: 'border-box', color: 'rgba(0, 0, 0, 0)' },
				'title',
			),
		).toThrow(/transparent text fill/i);
		expect(() =>
			assertTextPaintIsMeasurable(
				{ backgroundClip: 'border-box', color: 'hsla(0, 0%, 0%, 0)' },
				'title',
			),
		).toThrow(/transparent text fill/i);
	});
});

describe('single source — browser snippets are derived, not hand-typed twins', () => {
	test('BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET is exactly the const-declaration join of the __publy* functions', () => {
		const expected = [
			__publyNormalize,
			__publyIsTransparentColor,
			__publyClassifyTextPaint,
			__publyAssertTextPaintIsMeasurable,
		]
			.map((fn) => `const ${fn.name} = ${fn.toString()};`)
			.join('\n');
		expect(BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET).toBe(expected);
	});

	test('BROWSER_SCREENSHOT_DECODER_SNIPPET declares the named binding the browser returns', () => {
		// Le consommateur fait `new Function(snippet + 'return __publyDecodeScreenshot;')`.
		// Sans declaration `const <nom> =`, une fonction flechee stringifiee est anonyme
		// et ce `return` leve un ReferenceError (22 tests e2e rouges, #1834).
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toBe(
			`const ${__publyDecodeScreenshot.name} = ${__publyDecodeScreenshot.toString()};`,
		);
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain(
			'const __publyDecodeScreenshot =',
		);
	});

	test('Node aliases are the same reference as the __publy* source (no second body to drift)', () => {
		expect(classifyTextPaint).toBe(__publyClassifyTextPaint);
		expect(assertTextPaintIsMeasurable).toBe(
			__publyAssertTextPaintIsMeasurable,
		);
	});

	test('the shared source file contains no hand-typed snippet arrays and no duplicated regex', () => {
		const source = readFileSync(
			fileURLToPath(new URL('./toast-contrast-shared.ts', import.meta.url)),
			'utf8',
		);
		// No hand-maintained string snippet twins (the old defect).
		expect(source).not.toContain("'const __publyNormalize");
		expect(source).not.toContain("'const __publyIsTransparentColor");
		expect(source).not.toContain("'const __publyDecodeScreenshot");
		// Duplicated modern-slash regex removed: snippet must contain it exactly once.
		expect(
			BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET.match(/\\\/\\s\*0/g) ?? [],
		).toHaveLength(1);
		// Source itself must contain the slash pattern exactly once (in __publyIsTransparentColor).
		const sourceSlashMatches = source.match(/\\\/\\s\*0/g) ?? [];
		expect(sourceSlashMatches).toHaveLength(1);
	});

	test('the browser artifact (new Function of the snippet) classifies the same as the Node alias', () => {
		// This is the artifact the spec actually evaluates via new Function — prove unit tests exercise it.
		// eslint-disable-next-line no-new-func
		const classify = new Function(
			`${BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET}
return __publyClassifyTextPaint;`,
		)() as typeof classifyTextPaint;
		expect(
			classify({
				backgroundClip: 'border-box',
				color: 'rgb(15, 23, 42)',
				mask: 'url(#mask)',
			}),
		).toBe('masked');
		expect(
			classify({ backgroundClip: 'border-box', color: 'rgba(0,0,0,0)' }),
		).toBe('transparent-fill');
		expect(
			classify({
				backgroundClip: 'border-box',
				color: 'rgb(0,0,0)',
				opacity: '0',
			}),
		).toBe('transparent-opacity');
		// eslint-disable-next-line no-new-func
		const assert = new Function(
			`${BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET}
return __publyAssertTextPaintIsMeasurable;`,
		)() as typeof assertTextPaintIsMeasurable;
		expect(() =>
			assert(
				{
					backgroundClip: 'border-box',
					color: 'rgb(0,0,0)',
					maskImage: 'linear-gradient(black, transparent)',
				},
				'title',
			),
		).toThrow(/masked text/i);
	});
});

describe('unionRects', () => {
	test('unions two rects', () => {
		expect(
			unionRects([
				{ left: 0, right: 10, top: 0, bottom: 10 },
				{ left: 5, right: 20, top: 5, bottom: 20 },
			]),
		).toEqual({ left: 0, right: 20, top: 0, bottom: 20 });
	});

	test('throws on empty', () => {
		expect(() => unionRects([])).toThrow(/at least one/);
	});
});
