export const SCREENSHOT_DATA_URL_PREFIX = 'data:image/png;base64,' as const;

export type DecodedPngBytes = Uint8Array;

export type ClippedTextStyle = {
	backgroundClip: string;
	webkitBackgroundClip?: string;
	webkitTextFillColor?: string;
	color: string;
};

export type TextPaintKind = 'opaque' | 'clipped' | 'transparent-fill';

const transparentValues = new Set([
	'transparent',
	'rgba(0, 0, 0, 0)',
	'rgba(0,0,0,0)',
	'hsla(0, 0%, 0%, 0)',
]);

const normalize = (value: string): string => value.trim().toLowerCase();

const base64ToBytes = (base64: string): Uint8Array => {
	if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
		return Uint8Array.from(Buffer.from(base64, 'base64'));
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
};

export const decodeScreenshotDataUrl = (dataUrl: string): DecodedPngBytes => {
	if (!dataUrl.startsWith(SCREENSHOT_DATA_URL_PREFIX)) {
		throw new Error(
			`screenshot data URL must start with ${SCREENSHOT_DATA_URL_PREFIX}`,
		);
	}
	const base64 = dataUrl.slice(SCREENSHOT_DATA_URL_PREFIX.length);
	if (base64.length === 0) {
		throw new Error('screenshot data URL has empty base64 payload');
	}
	return base64ToBytes(base64);
};

/**
 * Shared browser-side screenshot decoder — the exact
 * `dataUrl -> atob -> Uint8Array -> Blob -> createImageBitmap -> ImageData`
 * path duplicated in `measurePaintedContrast` and `assertPaintsPixels`.
 * Kept as a stringified helper so both evaluate blocks can call the same
 * source without drifting. Unit coverage lives in `decodeScreenshotDataUrl`
 * above; this is the browser twin that must stay in sync.
 */
export const BROWSER_SCREENSHOT_DECODER_SNIPPET = [
	'const __publyDecodeScreenshot = async (dataUrl) => {',
	`  const prefix = '${SCREENSHOT_DATA_URL_PREFIX}';`,
	'  const base64 = dataUrl.slice(prefix.length);',
	'  const binary = atob(base64);',
	'  const bytes = new Uint8Array(binary.length);',
	'  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);',
	'  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));',
	'  const canvas = document.createElement("canvas");',
	'  canvas.width = bitmap.width; canvas.height = bitmap.height;',
	'  const ctx = canvas.getContext("2d");',
	'  if (!ctx) throw new Error("Browser canvas colour resolver is unavailable");',
	'  ctx.drawImage(bitmap, 0, 0);',
	'  return ctx.getImageData(0, 0, canvas.width, canvas.height);',
	'};',
].join('\n');

export const classifyTextPaint = (style: ClippedTextStyle): TextPaintKind => {
	const clip = normalize(
		style.webkitBackgroundClip ?? style.backgroundClip ?? '',
	);
	const fill = normalize(style.webkitTextFillColor ?? '');
	const color = normalize(style.color);

	if (clip === 'text' || clip.includes('text')) {
		return 'clipped';
	}
	if (transparentValues.has(fill) || normalize(fill) === 'transparent') {
		return 'transparent-fill';
	}
	if (transparentValues.has(color) && clip !== '' && clip !== 'border-box') {
		return 'transparent-fill';
	}
	if (color === 'transparent') {
		return 'transparent-fill';
	}
	return 'opaque';
};

export const assertTextPaintIsMeasurable = (
	style: ClippedTextStyle,
	label: string,
): void => {
	const kind = classifyTextPaint(style);
	if (kind === 'clipped') {
		throw new Error(
			`${label} has undecidable text paint: background-clip:text — the glyph fill is the element's background, not a solid colour; treating the opaque background behind it as compliant ink would hide a 1:1 wash`,
		);
	}
	if (kind === 'transparent-fill') {
		throw new Error(
			`${label} has undecidable text paint: transparent text fill (webkit-text-fill-color: transparent or color: transparent) — the glyphs show the element's background through the text; the ink cannot be measured`,
		);
	}
};

export type Rect = { bottom: number; left: number; right: number; top: number };

export const unionRects = (rects: Rect[]): Rect => {
	if (rects.length === 0) {
		throw new Error('unionRects requires at least one rect');
	}
	return {
		left: Math.min(...rects.map((r) => r.left)),
		right: Math.max(...rects.map((r) => r.right)),
		top: Math.min(...rects.map((r) => r.top)),
		bottom: Math.max(...rects.map((r) => r.bottom)),
	};
};

export const STACKED_TOAST_COUNT = 4 as const;
export const STACKED_FIXTURE_VARIANTS = [
	'success',
	'error',
	'warning',
	'info',
] as const;

export type ToastStackSlot = {
	variant: (typeof STACKED_FIXTURE_VARIANTS)[number];
	index: number;
};
