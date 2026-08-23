/**
 * `@org/lint-ts` — custom Oxlint plugin for PublyApp, written in TypeScript.
 *
 * Loaded by Oxlint via the `jsPlugins` config field (see root `.oxlintrc.json`).
 * Oxlint 1.79.0 `import()`s this module and reads its DEFAULT export as the
 * plugin object. The plugin's `meta.name` ("publy") becomes the rule namespace,
 * so rules are referenced in config as `publy/<rule-name>`.
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
 *   - `publy/arrow-function-components` → "off" (dormant)
 *   - `publy/prefer-query-display` → "off" (dormant)
 */
import { arrowFunctionComponents } from './rules/arrow-function-components.ts';
import { noArrayReduce } from './rules/no-array-reduce.ts';
import { noConsoleInSource } from './rules/no-console-in-source.ts';
import { noDirectDayjsInComponents } from './rules/no-direct-dayjs-in-components.ts';
import { noManualResponseMessageTranslation } from './rules/no-manual-response-message-translation.ts';
import { noOp } from './rules/no-op.ts';
import { noPackageSrcImport } from './rules/no-package-src-import.ts';
import { preferQueryDisplay } from './rules/prefer-query-display.ts';
import { preferSpecificLodashImports } from './rules/prefer-specific-lodash-imports.ts';

// Plugin object shape (oxlint 1.64.0): `{ meta: { name }, rules: { [name]: Rule } }`.
const plugin = {
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
		'arrow-function-components': arrowFunctionComponents,
		'prefer-query-display': preferQueryDisplay,
	},
};

export default plugin;
