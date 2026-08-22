import { describe, expect, test } from 'vitest';

import {
	SCREENSHOT_DATA_URL_PREFIX,
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

	test('browser helper snippet is available for evaluate-side reuse', async () => {
		const { BROWSER_SCREENSHOT_DECODER_SNIPPET } =
			await import('./toast-contrast-shared');
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain('atob(base64)');
		expect(BROWSER_SCREENSHOT_DECODER_SNIPPET).toContain('createImageBitmap');
	});
});

describe('classifyTextPaint — clipped/transparent fail-loud', () => {
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

	test('color transparent is undecidable', () => {
		expect(
			classifyTextPaint({
				backgroundClip: 'border-box',
				color: 'transparent',
			}),
		).toBe('transparent-fill');
	});

	test('assertTextPaintIsMeasurable throws on clipped/transparent and passes on opaque', () => {
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
