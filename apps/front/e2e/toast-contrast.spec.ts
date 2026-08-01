import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

/**
 * #998 browser-side toast contrast guard.
 *
 * This spec deliberately measures the real Sonner DOM after Chromium has
 * resolved the cascade. Sonner's un-layered stylesheet can beat app.css's
 * layered rules, so a source parser cannot know what the toast actually paints.
 *
 * Browser measurements: computed foreground paint, the hit-tested background
 * stack at each target's midpoint, flat computed gradients, and the close
 * button's actual offset parent/geometry. Modelled operations: alpha-compositing
 * those browser-reported sRGB layers and the WCAG 2 contrast formula. The model
 * never reads or resolves a source token.
 *
 * Known boundary: elementsFromPoint cannot report pseudo-elements. The guard
 * therefore cannot detect a future positioned pseudo-element painted across
 * only the sampled midpoint. Real element overlays fail closed, as do
 * unsupported images, non-flat gradients, opacity, filters, blend modes, or
 * inset shadows. Closing the pseudo-element boundary requires screenshot pixel
 * sampling with a deterministic way to remove the foreground glyph/text.
 */

const TEXT_CONTRAST_FLOOR = 4.5;
const GLYPH_CONTRAST_FLOOR = 3;

const THEMES = ['light', 'dark'] as const;
const VARIANTS = ['success', 'error', 'warning', 'info'] as const;

type Theme = (typeof THEMES)[number];
type Variant = (typeof VARIANTS)[number];
type TargetKind = 'glyph' | 'text';
type Rgba = { r: number; g: number; b: number; a: number };
type BackgroundLayer = { color: string; element: string; source: string };
type BrowserPaint = {
	backgroundLayers: BackgroundLayer[];
	foregrounds: string[];
};
type ContrastMeasurement = {
	background: Rgba;
	foreground: Rgba;
	ratio: number;
};

const parseComputedColor = (value: string): Rgba => {
	const match =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (!match) {
		throw new Error(`Unparseable browser-reported colour: ${value}`);
	}

	return {
		r: Number(match[1]),
		g: Number(match[2]),
		b: Number(match[3]),
		a: match[4] === undefined ? 1 : Number(match[4]),
	};
};

const alphaComposite = (over: Rgba, under: Rgba): Rgba => {
	const resultAlpha = over.a + under.a * (1 - over.a);
	if (resultAlpha === 0) {
		return { r: 0, g: 0, b: 0, a: 0 };
	}

	const compositeChannel = (
		overChannel: number,
		underChannel: number,
	): number =>
		(overChannel * over.a + underChannel * under.a * (1 - over.a)) /
		resultAlpha;

	return {
		r: compositeChannel(over.r, under.r),
		g: compositeChannel(over.g, under.g),
		b: compositeChannel(over.b, under.b),
		a: resultAlpha,
	};
};

const relativeLuminance = ({ r, g, b }: Rgba): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: Rgba, background: Rgba): number => {
	const lighter = Math.max(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);
	const darker = Math.min(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);

	return (lighter + 0.05) / (darker + 0.05);
};

const readBrowserPaint = async (
	target: Locator,
	kind: TargetKind,
): Promise<BrowserPaint> =>
	target.evaluate((element, targetKind) => {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Browser canvas colour resolver is unavailable');
		}

		const toSrgb = (color: string, source: string): string => {
			if (!CSS.supports('color', color)) {
				throw new Error(
					`${source} is not a browser-parseable colour: ${color}`,
				);
			}
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
			return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
		};

		const splitTopLevel = (value: string): string[] => {
			const parts: string[] = [];
			let depth = 0;
			let start = 0;
			for (let index = 0; index < value.length; index += 1) {
				const character = value[index];
				if (character === '(') {
					depth += 1;
				} else if (character === ')') {
					depth -= 1;
				} else if (character === ',' && depth === 0) {
					parts.push(value.slice(start, index).trim());
					start = index + 1;
				}
			}
			parts.push(value.slice(start).trim());
			return parts;
		};

		const colorFromStop = (stop: string): string => {
			const openingParenthesis = stop.indexOf('(');
			if (openingParenthesis === -1) {
				return stop.split(/\s+/u)[0] ?? '';
			}

			let depth = 0;
			for (let index = openingParenthesis; index < stop.length; index += 1) {
				const character = stop[index];
				if (character === '(') {
					depth += 1;
				} else if (character === ')') {
					depth -= 1;
					if (depth === 0) {
						return stop.slice(0, index + 1);
					}
				}
			}

			throw new Error(`Unbalanced computed gradient colour stop: ${stop}`);
		};

		const flatGradientColor = (image: string, source: string): string => {
			if (!image.startsWith('linear-gradient(') || !image.endsWith(')')) {
				throw new Error(`${source} has unsupported background image: ${image}`);
			}

			const inner = image.slice('linear-gradient('.length, -1);
			const parts = splitTopLevel(inner);
			const colors: string[] = [];
			for (const part of parts) {
				const candidate = colorFromStop(part);
				if (CSS.supports('color', candidate)) {
					colors.push(toSrgb(candidate, `${source} gradient stop`));
				}
			}

			if (colors.length !== 2) {
				throw new Error(
					`${source} gradient must have exactly two parseable colour stops: ${image}`,
				);
			}
			if (colors[0] !== colors[1]) {
				throw new Error(
					`${source} gradient is not a flat painted tint: ${image}`,
				);
			}

			return colors[0];
		};

		const elementName = (layer: Element): string =>
			layer.getAttribute('data-slot') ??
			layer.getAttribute('data-testid') ??
			layer.getAttribute('data-sonner-toast') ??
			layer.tagName.toLowerCase();

		const assertSupportedPaint = (
			style: CSSStyleDeclaration,
			source: string,
		): void => {
			if (style.opacity !== '1') {
				throw new Error(`${source} has unsupported opacity ${style.opacity}`);
			}
			if (style.filter !== 'none' || style.backdropFilter !== 'none') {
				throw new Error(
					`${source} has unsupported filter paint (${style.filter}; ${style.backdropFilter})`,
				);
			}
			if (style.mixBlendMode !== 'normal') {
				throw new Error(
					`${source} has unsupported mix-blend-mode ${style.mixBlendMode}`,
				);
			}
			if (/\binset\b/u.test(style.boxShadow)) {
				throw new Error(
					`${source} has unsupported inset shadow ${style.boxShadow}`,
				);
			}
		};

		const rect = element.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			throw new Error('Contrast target has no painted box');
		}
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const hitStack = document.elementsFromPoint(x, y);
		const targetIndex = hitStack.indexOf(element);
		if (targetIndex === -1) {
			throw new Error(
				'Contrast target is absent from its own painted hit stack',
			);
		}
		for (const paintedAbove of hitStack.slice(0, targetIndex)) {
			if (!element.contains(paintedAbove)) {
				throw new Error(
					`${elementName(paintedAbove)} unexpectedly paints above contrast target`,
				);
			}
		}

		const backgroundLayers: BackgroundLayer[] = [];
		const seen = new Set<Element>();
		let foundOpaqueLayer = false;
		for (const layer of hitStack.slice(targetIndex)) {
			if (seen.has(layer)) {
				continue;
			}
			seen.add(layer);

			const name = elementName(layer);
			const style = getComputedStyle(layer);
			assertSupportedPaint(style, name);

			if (style.backgroundImage !== 'none') {
				backgroundLayers.push({
					color: flatGradientColor(style.backgroundImage, name),
					element: name,
					source: 'background-image',
				});
			}

			const backgroundColor = toSrgb(
				style.backgroundColor,
				`${name} background-color`,
			);
			const channels = backgroundColor.match(/[\d.]+/gu);
			const alpha = Number(channels?.[3] ?? 1);
			if (alpha !== 0) {
				backgroundLayers.push({
					color: backgroundColor,
					element: name,
					source: 'background-color',
				});
			}
			if (alpha === 1) {
				foundOpaqueLayer = true;
				break;
			}
		}

		if (!foundOpaqueLayer) {
			throw new Error(
				'No opaque painted background found behind contrast target',
			);
		}

		const foregrounds: string[] = [];
		if (targetKind === 'text') {
			const style = getComputedStyle(element);
			assertSupportedPaint(style, elementName(element));
			if (style.textShadow !== 'none') {
				throw new Error(
					`${elementName(element)} has unsupported text shadow ${style.textShadow}`,
				);
			}
			foregrounds.push(
				toSrgb(
					style.webkitTextFillColor || style.color,
					`${elementName(element)} text fill colour`,
				),
			);
		} else {
			const shapes = element.querySelectorAll(
				'path, circle, ellipse, line, polyline, polygon, rect',
			);
			for (const shape of shapes) {
				const style = getComputedStyle(shape);
				assertSupportedPaint(style, `${elementName(element)} ${shape.tagName}`);
				for (const property of ['fill', 'stroke'] as const) {
					const paint = style[property];
					if (paint === 'none') {
						continue;
					}
					const paintOpacity =
						property === 'fill' ? style.fillOpacity : style.strokeOpacity;
					if (paintOpacity !== '1') {
						throw new Error(
							`${elementName(element)} ${shape.tagName} has unsupported ${property}-opacity ${paintOpacity}`,
						);
					}
					const color = toSrgb(
						paint,
						`${elementName(element)} ${shape.tagName} ${property}`,
					);
					if (!foregrounds.includes(color)) {
						foregrounds.push(color);
					}
				}
			}
			if (foregrounds.length === 0) {
				throw new Error(
					`${elementName(element)} has no parseable painted glyph`,
				);
			}
		}

		return { backgroundLayers, foregrounds };
	}, kind);

const measureContrast = async (
	target: Locator,
	kind: TargetKind,
): Promise<ContrastMeasurement> => {
	const computed = await readBrowserPaint(target, kind);
	if (computed.backgroundLayers.length === 0) {
		throw new Error('No painted background layer found behind contrast target');
	}

	const layers = computed.backgroundLayers.map((layer) =>
		parseComputedColor(layer.color),
	);
	let background = layers[layers.length - 1];
	for (let index = layers.length - 2; index >= 0; index -= 1) {
		background = alphaComposite(layers[index], background);
	}

	let minimum: ContrastMeasurement | undefined;
	for (const foregroundValue of computed.foregrounds) {
		const rawForeground = parseComputedColor(foregroundValue);
		const foreground =
			rawForeground.a === 1
				? rawForeground
				: alphaComposite(rawForeground, background);
		const measurement = {
			background,
			foreground,
			ratio: contrastRatio(foreground, background),
		};
		if (!minimum || measurement.ratio < minimum.ratio) {
			minimum = measurement;
		}
	}

	if (!minimum) {
		throw new Error('No browser-reported foreground paint found');
	}
	return minimum;
};

const setTheme = async (page: Page, theme: Theme): Promise<void> => {
	await page.evaluate((nextTheme) => {
		document.documentElement.classList.toggle('dark', nextTheme === 'dark');
	}, theme);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
};

const rgbaLabel = ({ r, g, b, a }: Rgba): string =>
	`rgba(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)}, ${a.toFixed(3)})`;

const measureToastTarget = async ({
	floor,
	kind,
	label,
	target,
	testInfo,
}: {
	floor: number;
	kind: TargetKind;
	label: string;
	target: Locator;
	testInfo: TestInfo;
}): Promise<ContrastMeasurement> => {
	await expect(target, `${label} must render`).toBeVisible();
	const measurement = await measureContrast(target, kind);
	const description =
		`${label}: ${measurement.ratio.toFixed(2)}:1 ` +
		`(foreground ${rgbaLabel(measurement.foreground)}, ` +
		`painted surface ${rgbaLabel(measurement.background)})`;
	testInfo.annotations.push({ type: 'contrast', description });
	expect.soft(measurement.ratio, description).toBeGreaterThanOrEqual(floor);
	return measurement;
};

const assertCloseButtonContainingBlock = async (
	toast: Locator,
	theme: Theme,
): Promise<void> => {
	const positioning = await toast.evaluate((toastElement) => {
		const closeButton = toastElement.querySelector<HTMLElement>(
			'.publy-toast-close-button',
		);
		if (!closeButton) {
			throw new Error('Rendered toast has no close button');
		}

		const toastStyle = getComputedStyle(toastElement);
		const closeStyle = getComputedStyle(closeButton);
		const toastRect = toastElement.getBoundingClientRect();
		const closeRect = closeButton.getBoundingClientRect();
		return {
			closePosition: closeStyle.position,
			offsetParentIsToast: closeButton.offsetParent === toastElement,
			toastPosition: toastStyle.position,
			toastTransform: toastStyle.transform,
			withinToast:
				closeRect.left >= toastRect.left &&
				closeRect.top >= toastRect.top &&
				closeRect.right <= toastRect.right &&
				closeRect.bottom <= toastRect.bottom,
		};
	});

	expect(positioning.closePosition, `${theme} close button positioning`).toBe(
		'absolute',
	);
	expect(positioning.toastPosition, `${theme} toast positioning`).toBe(
		'absolute',
	);
	expect(positioning.toastTransform, `${theme} toast transform`).not.toBe(
		'none',
	);
	expect(
		positioning.offsetParentIsToast,
		`${theme} toast must be the close button's containing block`,
	).toBe(true);
	expect(
		positioning.withinToast,
		`${theme} close button must remain inside the painted toast`,
	).toBe(true);
};

const openToastFixture = async (page: Page, theme: Theme): Promise<void> => {
	await page.goto('/field-validation');
	await expect(page.getByTestId('toast-contrast-fixture')).toBeVisible();
	await setTheme(page, theme);
};

const renderToast = async (
	page: Page,
	type: Variant | 'default',
): Promise<Locator> => {
	await page.getByTestId(`toast-contrast-${type}`).click();
	const toast = page.locator(
		type === 'default'
			? '[data-sonner-toast].publy-toast-default:not([data-type])'
			: `[data-sonner-toast][data-type="${type}"]`,
	);
	await expect(toast).toBeVisible();
	await expect(toast).toHaveAttribute('data-mounted', 'true');
	await expect(toast).toHaveCSS('opacity', '1');
	return toast;
};

const dismissToast = async (toast: Locator): Promise<void> => {
	await toast.locator('.publy-toast-close-button').click();
	await expect(toast).toHaveCount(0);
};

for (const theme of THEMES) {
	test(`${theme} toast variants clear contrast and retain close positioning`, async ({
		page,
	}, testInfo) => {
		await openToastFixture(page, theme);

		const neutralToast = await renderToast(page, 'default');
		const neutralSurface = await measureContrast(
			neutralToast.locator('.publy-toast-title'),
			'text',
		);
		await dismissToast(neutralToast);

		for (const variant of VARIANTS) {
			const toast = await renderToast(page, variant);
			await assertCloseButtonContainingBlock(toast, theme);

			const targets = [
				{
					name: 'message',
					locator: toast.locator('.publy-toast-title'),
					kind: 'text',
					floor: TEXT_CONTRAST_FLOOR,
				},
				{
					name: 'description',
					locator: toast.locator('.publy-toast-description'),
					kind: 'text',
					floor: TEXT_CONTRAST_FLOOR,
				},
				{
					name: 'semantic glyph',
					locator: toast.locator('.publy-toast-icon svg'),
					kind: 'glyph',
					floor: GLYPH_CONTRAST_FLOOR,
				},
				{
					name: 'close glyph',
					locator: toast.locator('.publy-toast-close-button svg'),
					kind: 'glyph',
					floor: GLYPH_CONTRAST_FLOOR,
				},
			] as const;

			let variantSurface: Rgba | undefined;
			for (const target of targets) {
				const measurement = await measureToastTarget({
					floor: target.floor,
					kind: target.kind,
					label: `${theme} ${variant} ${target.name}`,
					target: target.locator,
					testInfo,
				});
				variantSurface ??= measurement.background;
			}

			const semanticSurface = rgbaLabel(
				variantSurface ?? neutralSurface.background,
			);
			const neutralSurfaceLabel = rgbaLabel(neutralSurface.background);
			expect
				.soft(
					semanticSurface,
					`${theme} ${variant} painted surface must not collapse to the neutral toast surface`,
				)
				.not.toBe(neutralSurfaceLabel);

			await dismissToast(toast);
		}
	});
}
