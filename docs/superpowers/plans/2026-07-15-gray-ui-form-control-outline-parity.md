# Gray UI Form-Control Outline Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align PublyApp's shared input, textarea, and select-trigger surfaces and focus/invalid outlines with the approved Gray UI treatment without changing their geometry or behavior.

**Architecture:** Keep the visual recipe explicit in each existing primitive and enforce the common state matrix in focused component tests. Extend the existing fail-closed focus-contrast guard so an opaque focused border can be the compliant primary indicator while the translucent ring remains supplementary, then exercise the rendered result through the feature-gated field-validation fixture.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4 utility classes, Base UI Select, Vitest, Testing Library, Playwright, oxlint, pnpm.

---

## File Map

- Modify `apps/front-2/src/components/ui/input.tsx`: apply the approved Input surface, focus, and invalid-state classes.
- Modify `apps/front-2/src/components/ui/input.test.tsx`: lock Input semantics, state tokens, geometry, and removed-token absence.
- Modify `apps/front-2/src/components/ui/textarea.tsx`: apply the approved Textarea surface, focus, and invalid-state classes.
- Modify `apps/front-2/src/components/ui/textarea.test.tsx`: lock Textarea semantics, state tokens, geometry, and removed-token absence.
- Modify `apps/front-2/src/components/ui/select.tsx`: apply the approved treatment to `SelectTrigger` only.
- Modify `apps/front-2/src/components/ui/select.test.tsx`: lock trigger styling and geometry while retaining existing popup behavior coverage.
- Modify `apps/front-2/src/styles/focus-ring-contrast.test.ts`: parse focused border colors, combine border/ring compliance, and add planted failure/success proofs.
- Modify `apps/front-2/src/routes/field-validation.tsx`: add stable, labeled visual examples for all three shared controls without changing the existing email-validation flow.
- Modify `apps/front-2/e2e/field-validation.spec.ts`: assert computed styles and stable geometry in light/dark focus and invalid-focus states, and capture review screenshots.
- Read only `apps/front-2/src/styles/app.css`: retain all existing color, shadow, radius, and focus tokens.

### Task 1: Lock And Implement The Shared Primitive State Matrix

**Files:**
- Modify: `apps/front-2/src/components/ui/input.test.tsx`
- Modify: `apps/front-2/src/components/ui/textarea.test.tsx`
- Modify: `apps/front-2/src/components/ui/select.test.tsx`
- Modify: `apps/front-2/src/components/ui/input.tsx`
- Modify: `apps/front-2/src/components/ui/textarea.tsx`
- Modify: `apps/front-2/src/components/ui/select.tsx:33-59`

- [ ] **Step 1: Replace the Input styling test with a tokenized state-and-geometry contract**

Use a `Set` so the removed opaque ring token is distinguished from the target `/30` token:

```tsx
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Input } from './input';

afterEach(cleanup);

describe('Input', () => {
	test('preserves input semantics and uses the shared form-control state matrix', () => {
		render(<Input type="text" />);

		const input = screen.getByRole('textbox');
		const classes = new Set(input.className.split(/\s+/));

		expect(input.getAttribute('data-slot')).toBe('input');
		expect(input.getAttribute('type')).toBe('text');
		for (const token of [
			'border',
			'border-border',
			'bg-input/50',
			'shadow-[var(--publy-shadow-input)]',
			'focus-visible:border-ring',
			'focus-visible:ring-3',
			'focus-visible:ring-ring/30',
			'aria-invalid:border-destructive',
			'aria-invalid:ring-3',
			'aria-invalid:ring-destructive/20',
			'dark:aria-invalid:border-destructive/50',
			'dark:aria-invalid:ring-destructive/40',
			'aria-invalid:focus-visible:border-destructive',
			'aria-invalid:focus-visible:ring-destructive/20',
			'dark:aria-invalid:focus-visible:border-destructive',
			'dark:aria-invalid:focus-visible:ring-destructive/40',
			'disabled:pointer-events-none',
			'disabled:cursor-not-allowed',
			'disabled:opacity-50',
		]) {
			expect(classes).toContain(token);
		}
		for (const token of [
			'bg-input/35',
			'focus-visible:ring-ring',
			'aria-invalid:ring-destructive/12',
			'rounded-3xl',
		]) {
			expect(classes).not.toContain(token);
		}
		for (const token of [
			'md:h-9',
			'h-11',
			'rounded-[var(--publy-radius-input)]',
			'px-3.5',
			'py-1',
			'text-base',
			'md:text-[13px]',
		]) {
			expect(classes).toContain(token);
		}
	});
});
```

- [ ] **Step 2: Replace the Textarea styling test with the equivalent explicit contract**

```tsx
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Textarea } from './textarea';

afterEach(cleanup);

describe('Textarea', () => {
	test('preserves textarea semantics and uses the shared form-control state matrix', () => {
		render(<Textarea />);

		const textarea = screen.getByRole('textbox');
		const classes = new Set(textarea.className.split(/\s+/));

		expect(textarea.tagName).toBe('TEXTAREA');
		expect(textarea.getAttribute('data-slot')).toBe('textarea');
		for (const token of [
			'border',
			'border-border',
			'bg-input/50',
			'shadow-[var(--publy-shadow-input)]',
			'focus-visible:border-ring',
			'focus-visible:ring-3',
			'focus-visible:ring-ring/30',
			'aria-invalid:border-destructive',
			'aria-invalid:ring-3',
			'aria-invalid:ring-destructive/20',
			'dark:aria-invalid:border-destructive/50',
			'dark:aria-invalid:ring-destructive/40',
			'aria-invalid:focus-visible:border-destructive',
			'aria-invalid:focus-visible:ring-destructive/20',
			'dark:aria-invalid:focus-visible:border-destructive',
			'dark:aria-invalid:focus-visible:ring-destructive/40',
			'disabled:pointer-events-none',
			'disabled:cursor-not-allowed',
			'disabled:opacity-50',
		]) {
			expect(classes).toContain(token);
		}
		for (const token of [
			'bg-input/35',
			'focus-visible:ring-ring',
			'aria-invalid:ring-destructive/12',
			'rounded-3xl',
		]) {
			expect(classes).not.toContain(token);
		}
		for (const token of [
			'min-h-20',
			'resize-y',
			'rounded-[var(--publy-radius-input)]',
			'px-3.5',
			'py-2',
			'text-base',
			'md:text-[13px]',
		]) {
			expect(classes).toContain(token);
		}
	});
});
```

- [ ] **Step 3: Add a SelectTrigger styling test without changing the existing popup tests**

Insert this test at the start of the existing `Select` describe block:

```tsx
	test('preserves trigger semantics and uses the shared form-control state matrix', () => {
		renderSelect();

		const trigger = screen.getByRole('combobox');
		const classes = new Set(trigger.className.split(/\s+/));

		expect(trigger.getAttribute('data-slot')).toBe('select-trigger');
		expect(trigger.getAttribute('data-size')).toBe('default');
		for (const token of [
			'border',
			'border-border',
			'bg-input/50',
			'shadow-[var(--publy-shadow-input)]',
			'focus-visible:border-ring',
			'focus-visible:ring-3',
			'focus-visible:ring-ring/30',
			'aria-invalid:border-destructive',
			'aria-invalid:ring-3',
			'aria-invalid:ring-destructive/20',
			'dark:aria-invalid:border-destructive/50',
			'dark:aria-invalid:ring-destructive/40',
			'aria-invalid:focus-visible:border-destructive',
			'aria-invalid:focus-visible:ring-destructive/20',
			'dark:aria-invalid:focus-visible:border-destructive',
			'dark:aria-invalid:focus-visible:ring-destructive/40',
			'disabled:cursor-not-allowed',
			'disabled:opacity-50',
		]) {
			expect(classes).toContain(token);
		}
		for (const token of [
			'bg-input/35',
			'focus-visible:ring-ring',
			'aria-invalid:ring-destructive/12',
			'rounded-3xl',
		]) {
			expect(classes).not.toContain(token);
		}
		for (const token of [
			'rounded-[var(--publy-radius-input)]',
			'px-3',
			'py-2',
			'text-[13px]',
			'data-[size=default]:h-9',
			'data-[size=sm]:h-8',
		]) {
			expect(classes).toContain(token);
		}
	});
```

- [ ] **Step 4: Run the three primitive tests and verify the new contracts fail**

Run from the repository root:

```bash
pnpm --filter front-2 exec vitest run \
  src/components/ui/input.test.tsx \
  src/components/ui/textarea.test.tsx \
  src/components/ui/select.test.tsx
```

Expected: FAIL in each new styling contract because `bg-input/50`, the `/30` focus halo, and the new invalid-state tokens are absent; the existing semantic and popup behavior assertions continue to pass.

- [ ] **Step 5: Apply the approved complete class recipe to Input**

Replace only the class string in `Input`; retain the component signature, `InputPrimitive`, prop order, and `cn()` composition:

```tsx
			className={cn(
				'md:h-9 h-11 w-full min-w-0 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3.5 py-1 text-base shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40 md:text-[13px]',
				className,
			)}
```

- [ ] **Step 6: Apply the same state treatment while retaining Textarea-specific geometry**

```tsx
			className={cn(
				'min-h-20 w-full min-w-0 resize-y rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3.5 py-2 text-base shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40 md:text-[13px]',
				className,
			)}
```

- [ ] **Step 7: Apply the same state treatment to SelectTrigger only**

Leave `SelectContent`, `SelectItem`, all popup defaults, and exports byte-for-byte unchanged:

```tsx
			className={cn(
				"flex w-fit items-center justify-between gap-1.5 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3 py-2 text-[13px] whitespace-nowrap shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
```

- [ ] **Step 8: Re-run the primitive tests**

Run:

```bash
pnpm --filter front-2 exec vitest run \
  src/components/ui/input.test.tsx \
  src/components/ui/textarea.test.tsx \
  src/components/ui/select.test.tsx
```

Expected: PASS for all three files, including the pre-existing Select interaction, Escape, alignment, and z-index tests.

- [ ] **Step 9: Commit the primitive change**

```bash
git add \
  apps/front-2/src/components/ui/input.tsx \
  apps/front-2/src/components/ui/input.test.tsx \
  apps/front-2/src/components/ui/textarea.tsx \
  apps/front-2/src/components/ui/textarea.test.tsx \
  apps/front-2/src/components/ui/select.tsx \
  apps/front-2/src/components/ui/select.test.tsx
git commit -m "fix(front-2): soften shared form outlines"
```

### Task 2: Teach The Focus-Contrast Guard About Primary Focus Borders

**Files:**
- Modify: `apps/front-2/src/styles/focus-ring-contrast.test.ts`

- [ ] **Step 1: Generalize focus-indicator discovery to ring and border utilities**

Replace the single marker and literal extractor with:

```ts
const FOCUS_INDICATOR_UTILITY_MARKERS = [
	'focus-visible:ring',
	'focus-visible:border',
] as const;

type ClassLiteral = { line: number; text: string };

const STRING_LITERAL_PATTERN = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

const containsFocusIndicatorUtility = (source: string): boolean =>
	FOCUS_INDICATOR_UTILITY_MARKERS.some((marker) => source.includes(marker));

const extractFocusClassLiterals = (source: string): ClassLiteral[] => {
	const literals: ClassLiteral[] = [];
	let match: RegExpExecArray | null;
	STRING_LITERAL_PATTERN.lastIndex = 0;
	while ((match = STRING_LITERAL_PATTERN.exec(source))) {
		const text = match[2];
		if (!containsFocusIndicatorUtility(text)) {
			continue;
		}
		const line = source.slice(0, match.index).split('\n').length;
		literals.push({ line, text });
	}
	return literals;
};
```

Replace the consumer filter with this exact discovery expression:

```ts
const discoveredConsumerPaths = collectSourceFiles(srcRootDir).filter(
	(absolutePath) =>
		!STATIC_CONSUMER_EXCLUSIONS.has(absolutePath) &&
		containsFocusIndicatorUtility(readFileSync(absolutePath, 'utf8')),
);
```

In the route-discovery test, keep the existing non-empty and route assertions. In the per-consumer loop, replace the extraction and its fail-closed assertion with:

```ts
			const classLiterals = extractFocusClassLiterals(consumerSource);

			expect(
				classLiterals.length,
				`${consumerLabel}: discovered via a focus-visible ring/border raw-substring scan ` +
					'but no string-literal class expression contains either marker.',
			).toBeGreaterThan(0);
```

Also replace the planted two-element proof's `extractRingClassLiterals(twoElementSource)` call with `extractFocusClassLiterals(twoElementSource)`.

- [ ] **Step 2: Add a fail-closed parser for focused border-color utilities**

Keep the existing `RingToken` shape and winner resolution because border-color utilities have the same variant/color/opacity data. Add this parser immediately after `parseRingTokens`:

```ts
const parseFocusBorderTokens = (
	mergedClassName: string,
	knownColorNames: ReadonlySet<string>,
): RingToken[] => {
	const pattern = new RegExp(
		`${CLASS_TOKEN_BOUNDARY_START}((?:[\\w-]+:)*)border-(\\[[^\\]]+\\]|\\((--[\\w-]+)\\)|[\\w-]+?)(?:/(\\d+))?${CLASS_TOKEN_BOUNDARY_END}`,
		'g',
	);
	const tokens: RingToken[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(mergedClassName))) {
		const [, chain, rawColorGroup, cssVarName, alphaText] = match;
		const variants = chain.split(':').filter(Boolean);
		if (!variants.includes('focus-visible')) {
			continue;
		}
		const alpha = alphaText ? Number.parseInt(alphaText, 10) / 100 : 1;

		if (cssVarName) {
			tokens.push({ variants, rawValue: `var(${cssVarName})`, alpha });
		} else if (rawColorGroup.startsWith('[') && rawColorGroup.endsWith(']')) {
			const bracketValue = rawColorGroup.slice(1, -1);
			if (!ARBITRARY_RING_COLOR_VALUE_PATTERN.test(bracketValue)) {
				throw new Error(`Unsupported focused border colour: ${bracketValue}`);
			}
			tokens.push({ variants, rawValue: bracketValue, alpha });
		} else if (knownColorNames.has(rawColorGroup)) {
			tokens.push({ variants, color: rawColorGroup, alpha });
		} else {
			throw new Error(`Unknown focused border colour token: ${rawColorGroup}`);
		}
	}
	return tokens;
};
```

The parser deliberately considers only chains containing `focus-visible`; normal `border-border` and resting `aria-invalid:border-destructive` are not primary keyboard-focus indicators.

- [ ] **Step 3: Refactor winner measurement so border or ring may supply the 3:1 primary indicator**

Replace the nested `assertWinnerCompliant` helper with a measurement helper that preserves fail-closed color resolution:

```ts
		const measureWinnerContrast = (winner: RingToken | undefined) => {
			if (!winner) {
				return undefined;
			}
			const winnerRgb = winner.color
				? resolveKnownColorRgb(winner.color)
				: resolveColor(winner.rawValue as string, declarations, surfaceHex);
			const renderedRgb = composite(
				{ ...winnerRgb, a: winner.alpha },
				surfaceRgb,
			);
			return contrastRatio(renderedRgb, surfaceRgb);
		};

		const assertWinnerCompliant = (
			winner: RingToken | undefined,
			utilityPrefix: string,
			consumerLabel: string,
			stateName: string,
		) => {
			const ratio = measureWinnerContrast(winner);
			if (ratio === undefined || !winner) {
				return;
			}
			const winnerLabel = winner.color
				? `${utilityPrefix}-${winner.color}`
				: `${utilityPrefix}-[${winner.rawValue}]`;
			expect(
				ratio,
				`${consumerLabel} (${theme.name}, ${stateName}): winning ${utilityPrefix} token ` +
					`is ${winner.variants.join(':')}:${winnerLabel}` +
					(winner.alpha < 1 ? `/${Math.round(winner.alpha * 100)}` : '') +
					` -> ${ratio.toFixed(2)}:1`,
			).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		};
```

Then replace `assertStateCompliant` with this combined-indicator implementation. A low-opacity ring is accepted only when a focused border independently clears the unchanged floor; ring-offset colors remain independently guarded:

```ts
		const assertStateCompliant = (
			consumerLabel: string,
			mergedClassName: string,
			activeVariants: Set<string>,
			stateName: string,
		) => {
			const ringTokens = parseRingTokens(mergedClassName, knownColorNames);
			assertNoUnmodelledVariants(ringTokens, consumerLabel);
			const ringWinner = resolveWinningRingToken(ringTokens, activeVariants);

			const borderTokens = parseFocusBorderTokens(
				mergedClassName,
				knownColorNames,
			);
			assertNoUnmodelledVariants(borderTokens, consumerLabel);
			const borderWinner = resolveWinningRingToken(
				borderTokens,
				activeVariants,
			);

			const indicatorRatios = [
				{ kind: 'ring', ratio: measureWinnerContrast(ringWinner) },
				{ kind: 'border', ratio: measureWinnerContrast(borderWinner) },
			].filter(
				(entry): entry is { kind: string; ratio: number } =>
					entry.ratio !== undefined,
			);
			expect(
				indicatorRatios.length,
				`${consumerLabel} (${theme.name}, ${stateName}) has no resolvable authored focus indicator`,
			).toBeGreaterThan(0);
			expect(
				Math.max(...indicatorRatios.map((entry) => entry.ratio)),
				`${consumerLabel} (${theme.name}, ${stateName}): ` +
					indicatorRatios
						.map((entry) => `${entry.kind}=${entry.ratio.toFixed(2)}:1`)
						.join(', '),
			).toBeGreaterThanOrEqual(CONTRAST_FLOOR);

			const offsetTokens = parseRingOffsetTokens(
				mergedClassName,
				knownColorNames,
			);
			assertNoUnmodelledVariants(offsetTokens, consumerLabel);
			const offsetWinner = resolveWinningRingToken(
				offsetTokens,
				activeVariants,
			);
			assertWinnerCompliant(
				offsetWinner,
				'ring-offset',
				consumerLabel,
				stateName,
			);
		};
```

- [ ] **Step 4: Add parser and contrast proofs inside each theme loop**

Add these tests after the existing parser proofs so they run against both light and dark declarations:

```ts
		test(`parseFocusBorderTokens resolves semantic, opacity, and combined-state borders in ${theme.name} mode`, () => {
			expect(
				parseFocusBorderTokens(
					'border-border focus-visible:border-ring aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:border-destructive/40',
					knownColorNames,
				),
			).toEqual([
				{ variants: ['focus-visible'], color: 'ring', alpha: 1 },
				{
					variants: ['aria-invalid', 'focus-visible'],
					color: 'destructive',
					alpha: 1,
				},
				{
					variants: ['dark', 'aria-invalid', 'focus-visible'],
					color: 'destructive',
					alpha: 0.4,
				},
			]);
		});

		test(`an unknown focused border colour fails closed in ${theme.name} mode`, () => {
			expect(() =>
				parseFocusBorderTokens(
					'focus-visible:border-unresolvable',
					knownColorNames,
				),
			).toThrow(/Unknown focused border colour token/);
		});

		test(`a ring-ring\/30 halo without a compliant border fails in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'low-opacity-halo-fixture',
					'focus-visible:ring-3 focus-visible:ring-ring/30',
					FOCUS_ONLY,
					'focused only',
				),
			).toThrow();
		});

		test(`an opaque focus border plus ring-ring\/30 halo passes in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'combined-focus-fixture',
					'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
					FOCUS_ONLY,
					'focused only',
				),
			).not.toThrow();
		});

		test(`a full destructive border keeps the invalid-focus treatment compliant in ${theme.name} mode`, () => {
			expect(() =>
				assertStateCompliant(
					'invalid-focus-fixture',
					'focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40',
					FOCUS_AND_INVALID,
					'focused + aria-invalid',
				),
			).not.toThrow();
		});
```

- [ ] **Step 5: Extend the dynamic-composition fail-closed test to borders**

Use this pattern and add a planted focused-border interpolation assertion beside the ring assertions:

```ts
		const dynamicFocusCompositionPattern =
			/focus-visible:(?:ring|border)(?:-offset)?[\w-]*\$\{|\+\s*['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]|['"`][\w-]*(?:ring|border)(?:-offset)?[\w-]*['"`]\s*\+/;
```

```ts
		expect(
			dynamicFocusCompositionPattern.test(
				'const cls = `focus-visible:border-${color}`;',
			),
		).toBe(true);
```

Rename the two test descriptions from ring-only language to `focus-visible ring/border utility` language. Keep the whole-`src` scan, inline-style rejection, allowed variant set, arbitrary-color resolution, CVA sweeps, and `CONTRAST_FLOOR = 3.0` unchanged.

- [ ] **Step 6: Run the contrast suite and verify the planted proofs and real consumers pass**

Run:

```bash
pnpm --filter front-2 exec vitest run src/styles/focus-ring-contrast.test.ts
```

Expected: PASS in light and dark modes. The planted `/30`-halo-only callback throws as asserted, the opaque-border-plus-halo callback does not throw, unknown border tokens throw, and all discovered production class literals remain compliant.

- [ ] **Step 7: Commit the guard extension**

```bash
git add apps/front-2/src/styles/focus-ring-contrast.test.ts
git commit -m "test(front-2): model focus border contrast"
```

### Task 3: Add A Stable Visual Fixture And Computed-Style Coverage

**Files:**
- Modify: `apps/front-2/src/routes/field-validation.tsx`
- Modify: `apps/front-2/e2e/field-validation.spec.ts`

- [ ] **Step 1: Add imports and stable fixture controls to the feature-gated route**

Add these imports:

```tsx
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
```

After the existing validation `Card`, add this sibling card. It is deliberately independent from React Hook Form so the e2e test can set `aria-invalid` on each root primitive without changing the existing email submission behavior:

```tsx
			<Card
				className="space-y-4 p-4"
				data-testid="form-control-outline-fixture"
			>
				<div className="space-y-1.5">
					<Label htmlFor="outline-input">Outline input</Label>
					<Input
						id="outline-input"
						data-testid="outline-input"
						defaultValue="Input value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-textarea">Outline textarea</Label>
					<Textarea
						id="outline-textarea"
						data-testid="outline-textarea"
						defaultValue="Textarea value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-select">Outline select</Label>
					<Select defaultValue="alpha">
						<SelectTrigger
							id="outline-select"
							className="w-full"
							data-testid="outline-select"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="alpha">Alpha</SelectItem>
							<SelectItem value="beta">Beta</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</Card>
```

- [ ] **Step 2: Extend the e2e imports and define theme/control/style helpers**

Change the Playwright type import and add the theme storage key:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
```

Add these definitions below `DEFAULT_BASE_URL`:

```ts
type ColorScheme = 'light' | 'dark';
type ControlFixture = 'outline-input' | 'outline-textarea' | 'outline-select';
type ComputedControlStyle = {
	backgroundColor: string;
	borderColor: string;
	boxShadow: string;
};

const CONTROL_FIXTURES: readonly ControlFixture[] = [
	'outline-input',
	'outline-textarea',
	'outline-select',
];

const seedTheme = async (page: Page, colorScheme: ColorScheme): Promise<void> => {
	await page.evaluate(
		({ key, colorScheme }) => {
			window.localStorage.setItem(
				key,
				JSON.stringify({
					state: { colorScheme, sidebarOpen: true },
					version: 0,
				}),
			);
		},
		{ key: COLOR_SCHEME_STORAGE_KEY, colorScheme },
	);
};

const readControlStyle = (control: Locator): Promise<ComputedControlStyle> =>
	control.evaluate((element) => {
		const style = window.getComputedStyle(element);
		return {
			backgroundColor: style.backgroundColor,
			borderColor: style.borderColor,
			boxShadow: style.boxShadow,
		};
	});

const readExpectedStyle = async (
	page: Page,
	colorScheme: ColorScheme,
	isInvalid: boolean,
): Promise<ComputedControlStyle> =>
	page.evaluate(
		({ colorScheme, isInvalid }) => {
			const probe = document.createElement('div');
			const indicatorClasses = isInvalid
				? colorScheme === 'dark'
					? 'border-destructive ring-destructive/40'
					: 'border-destructive ring-destructive/20'
				: 'border-ring ring-ring/30';
			probe.className =
				`fixed border bg-input/50 shadow-[var(--publy-shadow-input)] ring-3 ${indicatorClasses}`;
			document.body.append(probe);
			const style = window.getComputedStyle(probe);
			const result = {
				backgroundColor: style.backgroundColor,
				borderColor: style.borderColor,
				boxShadow: style.boxShadow,
			};
			probe.remove();
			return result;
		},
		{ colorScheme, isInvalid },
	);
```

- [ ] **Step 3: Add the computed-style, geometry, and screenshot e2e test**

Append this test after the existing English validation test:

```ts
test('shared controls match the Gray UI outline treatment in light and dark themes', async ({
	page,
	baseURL,
}) => {
	const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
	await page.setViewportSize({ width: 1280, height: 900 });

	for (const colorScheme of ['light', 'dark'] as const) {
		await page.goto('/');
		await seedTheme(page, colorScheme);
		await visitFieldValidation(page, 'en', resolvedBaseUrl);
		await expect(page.locator('html')).toHaveAttribute(
			'data-theme',
			colorScheme,
		);
		await expect(
			page.getByTestId('form-control-outline-fixture'),
		).toBeVisible();

		for (const fixture of CONTROL_FIXTURES) {
			const control = page.getByTestId(fixture);
			const beforeFocus = await control.boundingBox();
			expect(beforeFocus).not.toBeNull();

			await control.focus();
			await expect(control).toBeFocused();
			const afterFocus = await control.boundingBox();
			expect(afterFocus).toEqual(beforeFocus);

			const expectedFocus = await readExpectedStyle(page, colorScheme, false);
			await expect.poll(() => readControlStyle(control)).toEqual(expectedFocus);
			await page.screenshot({
				path: `test-results/gray-ui/form-controls-${colorScheme}-${fixture}-focus.png`,
				fullPage: true,
			});

			await control.evaluate((element) => {
				element.setAttribute('aria-invalid', 'true');
			});
			await expect(control).toHaveAttribute('aria-invalid', 'true');
			await expect(control).toBeFocused();
			const invalidFocusBox = await control.boundingBox();
			expect(invalidFocusBox).toEqual(beforeFocus);

			const expectedInvalid = await readExpectedStyle(page, colorScheme, true);
			await expect.poll(() => readControlStyle(control)).toEqual(expectedInvalid);
			await page.screenshot({
				path: `test-results/gray-ui/form-controls-${colorScheme}-${fixture}-invalid-focus.png`,
				fullPage: true,
			});

			await control.evaluate((element) => {
				element.removeAttribute('aria-invalid');
			});
		}
	}
});
```

This reads browser-computed `backgroundColor`, `borderColor`, and `boxShadow`; screenshots are review artifacts under ignored `test-results/gray-ui/`, not committed baselines.

- [ ] **Step 4: Typecheck the fixture and Playwright source without running Playwright**

The implementation executor must not run Playwright because this repository serializes Docker/browser verification under a dedicated verification owner.

Run:

```bash
pnpm --filter front-2 typecheck
```

Expected: PASS with no TypeScript errors in the route or e2e helpers. Do not run `playwright test` in this task.

- [ ] **Step 5: Commit the visual fixture and e2e coverage**

```bash
git add \
  apps/front-2/src/routes/field-validation.tsx \
  apps/front-2/e2e/field-validation.spec.ts
git commit -m "test(front-2): cover form outline parity"
```

### Task 4: Run Static And Targeted Verification

**Files:**
- Verify: all nine changed TypeScript/TSX files

- [ ] **Step 1: Format-check the exact changed source files**

Run:

```bash
pnpm exec oxfmt --check \
  apps/front-2/src/components/ui/input.tsx \
  apps/front-2/src/components/ui/input.test.tsx \
  apps/front-2/src/components/ui/textarea.tsx \
  apps/front-2/src/components/ui/textarea.test.tsx \
  apps/front-2/src/components/ui/select.tsx \
  apps/front-2/src/components/ui/select.test.tsx \
  apps/front-2/src/styles/focus-ring-contrast.test.ts \
  apps/front-2/src/routes/field-validation.tsx \
  apps/front-2/e2e/field-validation.spec.ts
```

Expected: PASS with every listed file already formatted. If it fails, run the same command with `--write`, inspect the diff, then repeat `--check`.

- [ ] **Step 2: Run oxlint over every changed TS/TSX file**

Run:

```bash
npx oxlint \
  apps/front-2/src/components/ui/input.tsx \
  apps/front-2/src/components/ui/input.test.tsx \
  apps/front-2/src/components/ui/textarea.tsx \
  apps/front-2/src/components/ui/textarea.test.tsx \
  apps/front-2/src/components/ui/select.tsx \
  apps/front-2/src/components/ui/select.test.tsx \
  apps/front-2/src/styles/focus-ring-contrast.test.ts \
  apps/front-2/src/routes/field-validation.tsx \
  apps/front-2/e2e/field-validation.spec.ts
```

Expected: `Found 0 warnings and 0 errors.`

- [ ] **Step 3: Run the focused Vitest suites together**

Run:

```bash
pnpm --filter front-2 exec vitest run \
  src/components/ui/input.test.tsx \
  src/components/ui/textarea.test.tsx \
  src/components/ui/select.test.tsx \
  src/styles/focus-ring-contrast.test.ts
```

Expected: PASS for all four files, including planted contrast failures and all pre-existing Select popup behavior tests.

- [ ] **Step 4: Run the front-2 typecheck and design-system gates**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 check:design-system
pnpm --filter front-2 test:design-system-guard
```

Expected: all three commands exit 0; the design-system guard reports no raw-color, geometry, or token-policy violations.

- [ ] **Step 5: Inspect the final scoped diff**

Run:

```bash
git status --short
git diff --check HEAD~3..HEAD
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- apps/front-2/src/styles/app.css
```

Expected: the implementation diff contains only the nine files in the file map, `git diff --check` is silent, and the `app.css` diff is empty. Generated route-tree churn, popup changes, token changes, and screenshot files are absent.

- [ ] **Step 6: Hand the serialized browser verification command to the verification owner**

The dedicated verification owner, not the implementation executor, runs the existing Docker e2e stack and then:

```bash
pnpm --filter front-2 exec playwright test \
  e2e/field-validation.spec.ts \
  --project=chromium \
  --workers=1
```

Expected: all existing localized email-validation cases pass; the new light/dark computed-style and geometry assertions pass for Input, Textarea, and SelectTrigger; twelve review screenshots are written under `apps/front-2/test-results/gray-ui/`.

- [ ] **Step 7: Commit any verification-only formatting correction**

Skip this step when verification required no source correction. When formatting changed a listed source file, commit only that inspected formatting diff:

```bash
git add \
  apps/front-2/src/components/ui/input.tsx \
  apps/front-2/src/components/ui/input.test.tsx \
  apps/front-2/src/components/ui/textarea.tsx \
  apps/front-2/src/components/ui/textarea.test.tsx \
  apps/front-2/src/components/ui/select.tsx \
  apps/front-2/src/components/ui/select.test.tsx \
  apps/front-2/src/styles/focus-ring-contrast.test.ts \
  apps/front-2/src/routes/field-validation.tsx \
  apps/front-2/e2e/field-validation.spec.ts
git commit -m "style(front-2): format form outline parity"
```
