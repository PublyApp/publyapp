export const SCREENSHOT_DATA_URL_PREFIX = 'data:image/png;base64,' as const;

export type DecodedPngBytes = Uint8Array;

export type ClippedTextStyle = {
	backgroundClip: string;
	webkitBackgroundClip?: string;
	webkitTextFillColor?: string;
	color: string;
	opacity?: string;
	maskImage?: string;
	mask?: string;
};

export type TextPaintKind =
	| 'opaque'
	| 'clipped'
	| 'transparent-fill'
	| 'masked'
	| 'transparent-opacity';

const normalize = (value: string): string => value.trim().toLowerCase();

const isTransparentColor = (value: string): boolean => {
	const normalized = normalize(value);
	if (normalized === 'transparent') {
		return true;
	}
	// Modern slash syntax: rgb(0 0 0 / 0) or hsl(0 0% 0% / 0)
	if (/\/\s*0(\.0+)?\s*\)$/u.test(normalized)) {
		return true;
	}
	// Legacy comma syntax: rgba(0,0,0,0) or hsla(0,0%,0%,0) — needs 4 components (3 commas)
	if (/,\s*0(\.0+)?\s*\)$/u.test(normalized)) {
		const open = normalized.indexOf('(');
		const close = normalized.lastIndexOf(')');
		if (open !== -1 && close !== -1) {
			const inner = normalized.slice(open + 1, close);
			const commas = (inner.match(/,/gu) ?? []).length;
			if (commas >= 3) {
				return true;
			}
		}
	}
	return false;
};

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

export const BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET = [
	'const __publyNormalize = (value) => value.trim().toLowerCase();',
	'const __publyIsTransparentColor = (value) => {',
	'  const n = __publyNormalize(value);',
	'  if (n === "transparent") return true;',
	'  if (/\\/\\s*0(\\.0+)?\\s*\\)$/u.test(n)) return true;',
	'  if (/\\/\\s*0(\\.0+)?\\s*\\)$/u.test(n)) return true;',
	'  if (/,\\s*0(\\.0+)?\\s*\\)$/u.test(n)) {',
	'    const open = n.indexOf("(");',
	'    const close = n.lastIndexOf(")");',
	'    if (open !== -1 && close !== -1) {',
	'      const inner = n.slice(open + 1, close);',
	'      const commas = (inner.match(/,/gu) ?? []).length;',
	'      if (commas >= 3) return true;',
	'    }',
	'  }',
	'  return false;',
	'};',
	'const __publyClassifyTextPaint = (style) => {',
	'  const clip = __publyNormalize(style.webkitBackgroundClip ?? style.backgroundClip ?? "");',
	'  const fill = __publyNormalize(style.webkitTextFillColor ?? "");',
	'  const color = __publyNormalize(style.color);',
	'  const opacity = style.opacity !== undefined ? __publyNormalize(style.opacity) : "1";',
	'  const maskImage = style.maskImage !== undefined ? __publyNormalize(style.maskImage) : "none";',
	'  const mask = style.mask !== undefined ? __publyNormalize(style.mask) : "none";',
	'  if (clip === "text" || clip.includes("text")) return "clipped";',
	'  if (Number(opacity) === 0) return "transparent-opacity";',
	'  if (maskImage !== "none" && maskImage !== "") return "masked";',
	'  if (mask !== "none" && mask !== "") return "masked";',
	'  if (fill !== "" && __publyIsTransparentColor(fill)) return "transparent-fill";',
	'  if (__publyIsTransparentColor(color)) return "transparent-fill";',
	'  return "opaque";',
	'};',
	'const __publyAssertTextPaintIsMeasurable = (style, label) => {',
	'  const kind = __publyClassifyTextPaint(style);',
	'  if (kind === "clipped") throw new Error(`${label} has undecidable text paint: background-clip:text — the glyph fill is the element\\u0027s background, not a solid colour; treating the opaque background behind it as compliant ink would hide a 1:1 wash`);',
	'  if (kind === "transparent-fill") throw new Error(`${label} has undecidable text paint: transparent text fill (webkit-text-fill-color: transparent or color: transparent) — the glyphs show the element\\u0027s background through the text; the ink cannot be measured`);',
	'  if (kind === "transparent-opacity") throw new Error(`${label} has undecidable text paint: transparent opacity 0 — the glyphs are fully transparent and cannot be measured`);',
	'  if (kind === "masked") throw new Error(`${label} has undecidable text paint: masked text (mask-image/mask) — the glyphs are masked and cannot be measured`);',
	'};',
].join('\n');

export const classifyTextPaint = (style: ClippedTextStyle): TextPaintKind => {
	const clip = normalize(
		style.webkitBackgroundClip ?? style.backgroundClip ?? '',
	);
	const fill = normalize(style.webkitTextFillColor ?? '');
	const color = normalize(style.color);
	const opacity = style.opacity !== undefined ? normalize(style.opacity) : '1';
	const maskImage =
		style.maskImage !== undefined ? normalize(style.maskImage) : 'none';
	const mask = style.mask !== undefined ? normalize(style.mask) : 'none';

	if (clip === 'text' || clip.includes('text')) {
		return 'clipped';
	}
	if (Number(opacity) === 0) {
		return 'transparent-opacity';
	}
	if (maskImage !== 'none' && maskImage !== '') {
		return 'masked';
	}
	if (mask !== 'none' && mask !== '') {
		return 'masked';
	}
	if (fill !== '' && isTransparentColor(fill)) {
		return 'transparent-fill';
	}
	if (isTransparentColor(color)) {
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
	if (kind === 'transparent-opacity') {
		throw new Error(
			`${label} has undecidable text paint: transparent opacity 0 — the glyphs are fully transparent and cannot be measured`,
		);
	}
	if (kind === 'masked') {
		throw new Error(
			`${label} has undecidable text paint: masked text (mask-image/mask) — the glyphs are masked and cannot be measured`,
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
