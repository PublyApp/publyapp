/**
 * `@org/lint-ts` — custom Oxlint plugins for PublyApp, written in TypeScript.
 *
 * Loaded by Oxlint via the `jsPlugins` config field (see root `.oxlintrc.json`).
 * Oxlint 1.79.0 `import()`s this module and reads its exports as plugin
 * objects. A plugin's `meta.name` becomes the rule namespace, so rules are
 * referenced in config as `<plugin-name>/<rule-name>`.
 *
 * This package hosts BOTH plugins:
 *   - `publy`     — house rules (`src/publy/*`), default export of this module.
 *   - `anti-slop` — vendored from dmmulroy/anti-slop @ 6d53855 (MIT); it
 *     lives in `src/anti-slop/index.ts` and is wired straight into Oxlint
 *     through its own `jsPlugins` specifier, so it is NOT re-exported here.
 *     Vendored code carries oxfmt-only modifications; do not add house rules
 *     there (see `src/anti-slop/README.md`).
 *
 * Plugin names are stable contract: `.oxlintrc.json` rule ids
 * (`publy/*`, `anti-slop/*`) do not change when files move.
 *
 * JS plugins are flagged "alpha, not subject to semver" by Oxlint; no extra
 * experimental CLI flag is required in 1.79.0 — declaring `jsPlugins` activates
 * the loader. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Rule severities are tracked in `.oxlintrc.json`. Current publy/* rules:
 *   - `publy/no-op` → "off" (scaffold sentinel)
 *   - `publy/prefer-specific-lodash-imports` → "error"
 *   - `publy/no-console-in-source` → "error"
 *   - `publy/no-direct-dayjs-in-components` → "error"
 *   - `publy/no-manual-response-message-translation` → "error"
 *   - `publy/no-array-reduce` → "error"
 *   - `publy/no-package-src-import` → "error"
 *   - `publy/no-iife` → "error"
 *   - `publy/arrow-function-components` → "error" (enforced since #1210)
 *   - `publy/prefer-query-display` → "off" (dormant)
 *   - `publy/no-never-any-casts` → "error" (enforced since #1346)
 *   - `publy/require-commit-of-use-offset-page-clamp` → "error" (enforced since #1660)
 */
import { arrowFunctionComponents } from './publy/arrow-function-components.ts';
import { noArrayReduce } from './publy/no-array-reduce.ts';
import { noConsoleInSource } from './publy/no-console-in-source.ts';
import { noDirectDayjsInComponents } from './publy/no-direct-dayjs-in-components.ts';
import { noIife } from './publy/no-iife.ts';
import { noManualResponseMessageTranslation } from './publy/no-manual-response-message-translation.ts';
import { noNeverAnyCasts } from './publy/no-never-any-casts.ts';
import { noOp } from './publy/no-op.ts';
import { noPackageSrcImport } from './publy/no-package-src-import.ts';
import { noRequireCommitOfUseOffsetPageClamp } from './publy/no-require-commit-of-use-offset-page-clamp.ts';
import { preferQueryDisplay } from './publy/prefer-query-display.ts';
import { preferSpecificLodashImports } from './publy/prefer-specific-lodash-imports.ts';

// Plugin object shape (oxlint 1.64.0): `{ meta: { name }, rules: { [name]: Rule } }`.
const publyPlugin = {
	meta: {
		name: 'publy',
	},
	rules: {
		'no-op': noOp,
		'no-array-reduce': noArrayReduce,
		'no-console-in-source': noConsoleInSource,
		'no-direct-dayjs-in-components': noDirectDayjsInComponents,
		'no-manual-response-message-translation':
			noManualResponseMessageTranslation,
		'prefer-specific-lodash-imports': preferSpecificLodashImports,
		'no-package-src-import': noPackageSrcImport,
		'no-iife': noIife,
		'arrow-function-components': arrowFunctionComponents,
		'prefer-query-display': preferQueryDisplay,
		'no-never-any-casts': noNeverAnyCasts,
		'require-commit-of-use-offset-page-clamp':
			noRequireCommitOfUseOffsetPageClamp,
	},
};

export default publyPlugin;
