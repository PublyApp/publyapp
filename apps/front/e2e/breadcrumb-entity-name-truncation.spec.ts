import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';

/**
 * #973 PR review round 3, IMPORTANT finding. `breadcrumb-contract.test.tsx`'s
 * jsdom-based "long entity name" test can only assert the DOM shape: the
 * `title` attribute, and that `block truncate` is present in the className
 * list. It says so explicitly — jsdom never runs layout or paint, so
 * `getBoundingClientRect`/`scrollWidth`/`clientWidth` are all 0 there
 * regardless of CSS, meaning that test is a MODEL of truncation (the right
 * classes are attached) rather than a proof that a long name is actually
 * clipped on screen. The PR review confirmed a real-browser proof is
 * reachable: it built the branch's production image, brought up the e2e
 * stack, and measured the real `/staff/tenants/$tenantId` route's real
 * emitted stylesheet — `clientWidth: 622` against `scrollWidth: 9106` for a
 * long name, `31 == 31` (no clip) for a short one — then showed the same
 * probe fails once winning CSS breaks truncation.
 *
 * This spec makes that proof durable and repo-resident rather than a
 * one-off manual probe. Docker/the full e2e stack are NOT required: like
 * `feat/ui-profile-batch`'s `profile-icon-picker-pin-geometry.spec.ts` (read
 * as reference, not modified — see `chromium-hermetic-source` below), it
 * renders a `page.setContent()` page built from the REAL compiled
 * production CSS (`dist/client/assets/app-*.css`, built on demand if
 * missing — see `helpers/compiled-app-css.ts`) plus markup mirroring the
 * real rendered structure and class names of:
 *  - the topbar shell (`app-shell.tsx`'s `.app-shell-workspace` grid,
 *    `.app-shell-topbar` flex row, `.app-shell-topbar-left` /
 *    `-right`)
 *  - the breadcrumb nav itself (`.app-shell-breadcrumbs`,
 *    `.app-shell-breadcrumb-link` / `-current` / `-chevron`, all real
 *    classes from `app-shell.tsx`'s breadcrumb render loop)
 *  - the entity name node `EntityCrumb` actually renders
 *    (`entity-crumb.tsx`: `<span class="block truncate" title={name}
 *    data-testid="app-shell-breadcrumb-entity-name">`)
 *
 * No login, backend, or docker-compose stack is needed — see the
 * `chromium-hermetic-source` Playwright project in `playwright.config.ts`.
 * A narrow-ish viewport (700px) is used deliberately: it is well above the
 * 640px mobile breakpoint that hides the label crumbs/chevrons entirely
 * (`app.css`'s `@media (max-width: 639px)` rule), and it is exactly wide
 * enough to leave less room than the topbar's own content wants — the same
 * flex-shrink-driven clipping any real narrow browser window (or a longer
 * root/label crumb chain, or a wider user-menu) would trigger, without
 * needing to fabricate an arbitrary CSS width override on a real production
 * class.
 */

type Measurements = {
	clientWidth: number;
	scrollWidth: number;
	title: string | null;
};

const VIEWPORT = { width: 700, height: 800 };

const buildShellPage = (
	css: string,
	entityName: string,
): string => `<!doctype html>
<html>
<head><style>${css}</style></head>
<body>
	<div class="app-shell-workspace" data-testid="app-shell-shell" data-mode="authed">
		<nav class="app-shell-rail" aria-label="Primary"></nav>
		<div class="app-shell-body">
			<header class="app-shell-topbar" data-testid="app-shell-topbar">
				<div class="app-shell-topbar-left">
					<nav aria-label="nav-breadcrumb" class="app-shell-breadcrumbs">
						<a class="app-shell-breadcrumb-link" href="#">Staff</a>
						<svg class="app-shell-breadcrumb-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>
						<a class="app-shell-breadcrumb-link" href="#">Tenants</a>
						<svg class="app-shell-breadcrumb-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>
						<span aria-current="page" class="app-shell-breadcrumb-current">
							<span
								class="block truncate"
								title="${entityName}"
								id="entity-name"
								data-testid="app-shell-breadcrumb-entity-name"
							>${entityName}</span>
						</span>
					</nav>
				</div>
				<div class="app-shell-topbar-right">
					<button class="app-shell-topbar-action-btn"></button>
					<div class="app-shell-topbar-separator"></div>
					<div class="app-shell-user-chip">
						<span class="app-shell-user-name">Staff Admin</span>
					</div>
				</div>
			</header>
			<main class="app-shell-main"></main>
		</div>
	</div>
</body>
</html>`;

const readMeasurements = (page: Page): Promise<Measurements> =>
	page.evaluate(() => {
		const el = document.getElementById('entity-name');
		if (!el) {
			throw new Error('Missing #entity-name');
		}

		return {
			clientWidth: el.clientWidth,
			scrollWidth: el.scrollWidth,
			title: el.getAttribute('title'),
		};
	});

const LONG_NAME =
	'Acme Corporation International Holdings & Subsidiaries Consolidated Group Worldwide Ltd.';
const SHORT_NAME = 'Acme';

/** Runs the full set of real-browser truncation assertions against whatever
 * CSS the caller has already loaded into `page`. */
const assertLongNameClipsAndShortNameDoesNot = async (
	page: Page,
	css: string,
): Promise<void> => {
	await page.setViewportSize(VIEWPORT);

	await page.setContent(buildShellPage(css, LONG_NAME));
	const long = await readMeasurements(page);

	// The full value must still be recoverable even though the visible text
	// is clipped — the a11y/hover minimum this repo already requires.
	expect(long.title, 'title must carry the full untruncated name').toBe(
		LONG_NAME,
	);
	// The real, load-bearing proof: the node's rendered box is narrower than
	// its content actually needs, i.e. it is genuinely clipped on screen —
	// not merely tagged with a class that models clipping.
	expect(
		long.scrollWidth,
		'a long name must overflow its own rendered box (real clipping, not just the truncate class being present)',
	).toBeGreaterThan(long.clientWidth);

	await page.setContent(buildShellPage(css, SHORT_NAME));
	const short = await readMeasurements(page);

	expect(short.title).toBe(SHORT_NAME);
	// A short name must NOT be clipped — same box, same CSS, nothing to hide.
	expect(
		short.scrollWidth,
		'a short name must not be clipped at all',
	).toBeLessThanOrEqual(short.clientWidth);
};

test.describe('breadcrumb entity-name truncation geometry (#973, real browser)', () => {
	test('a long entity name is genuinely clipped by the real compiled CSS; a short one is not', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		await assertLongNameClipsAndShortNameDoesNot(page, css);
	});

	/**
	 * Geometry regression proof, mirroring `profile-icon-picker-pin-geometry
	 * .spec.ts`'s own mutation test: if a future change silently regressed
	 * `EntityCrumb` back to its pre-#973 bare-text-fragment rendering (no
	 * `truncate`, no `overflow` constraint), THIS is the test that must go
	 * red — the jsdom test only asserts the `truncate` classNAME is present
	 * in the string, so it cannot see this. Rather than editing the
	 * component (out of scope for a test-only remediation and would leave
	 * the working tree dirty), the same effect is reproduced by appending a
	 * CSS rule that wins the cascade and reverts exactly the three
	 * declarations `truncate` establishes
	 * (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`),
	 * targeting the exact real `data-testid` the production node carries.
	 */
	test('is caught if truncation is removed (CSS-mutation proof)', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		const mutatedCss = `${css}\n[data-testid="app-shell-breadcrumb-entity-name"]{overflow:visible;text-overflow:clip;white-space:normal}`;

		await expect(
			assertLongNameClipsAndShortNameDoesNot(page, mutatedCss),
		).rejects.toThrow();
	});
});
