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
 */
import { assertIconIsVisible } from '../../src/components/table/data-table-icon-visibility-guard';

declare global {
	interface Window {
		/** Set by this entry; consumed by the e2e spec's `page.evaluate` calls. */
		__iconVisibilityGuard?: {
			assertIconIsVisible: typeof assertIconIsVisible;
		};
	}
}

window.__iconVisibilityGuard = { assertIconIsVisible };
