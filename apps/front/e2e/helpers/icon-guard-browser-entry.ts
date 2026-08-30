/**
 * Browser entry for the #1799 icon-visibility-guard e2e spec.
 *
 * Bundled by esbuild (`getIconGuardBrowserScript` in
 * `render-data-table-icon-guard.ts`) and injected into the spec's page as a
 * classic `<script>`. It is the ONLY link between the spec and the real guard
 * module: there is no copy of the measurement logic in the spec — the code
 * that runs in the page IS
 * `apps/front/src/components/table/data-table-icon-visibility-guard.ts`,
 * bundled verbatim from source. The guard's default reader is the page's own
 * `window.getComputedStyle` (Chromium's), so the assertions exercise the real
 * measurement against the real engine — never a reimplementation.
 *
 * #1899 — the guard's error messages come from the i18next singleton, and an
 * UNINITIALIZED i18next returns the empty string for a key (measured: the
 * pre-init bundle threw an `Error` with `message === ''`, a loud failure
 * that named nothing — the same defect class this issue removes). The real
 * app always runs with i18n initialized, so this entry mirrors that
 * environment: it initializes the singleton synchronously with the real
 * `en/common.json` resource (the guard's production texts, not a stand-in)
 * before exposing the guard. `initAsync: false` keeps the init synchronous
 * because the resources are inline (the same option the app's
 * `createI18nFromResources` in `src/lib/i18n.shared.ts` uses).
 */
import i18next from 'i18next';

import { assertIconIsVisible } from '../../src/components/table/data-table-icon-visibility-guard';
import enCommon from '../../src/i18n/locales/en/common.json';

// `init` returns a `Promise` even with `initAsync: false` (the app's own
// call in `src/lib/i18n.shared.ts` voids it for the same reason); the
// resources are inline, so the init resolves before the next task runs.
void i18next.init({
	lng: 'en',
	fallbackLng: 'en',
	resources: { en: { translation: enCommon } },
	initAsync: false,
	interpolation: { escapeValue: false },
});

declare global {
	interface Window {
		/** Set by this entry; consumed by the e2e spec's `page.evaluate` calls. */
		__iconVisibilityGuard?: {
			assertIconIsVisible: typeof assertIconIsVisible;
		};
	}
}

window.__iconVisibilityGuard = { assertIconIsVisible };
