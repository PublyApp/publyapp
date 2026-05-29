import { noConsoleInSource } from './rules/no-console-in-source.js';
/**
 * `@org/lint-ts` — custom Oxlint JS plugin for PublyApp.
 *
 * Loaded by Oxlint via the `jsPlugins` config field (see root `.oxlintrc.json`).
 * Oxlint 1.64.0 `import()`s this module and reads its DEFAULT export as the
 * plugin object. The plugin's `meta.name` ("publy") becomes the rule namespace,
 * so rules are referenced in config as `publy/<rule-name>`.
 *
 * JS plugins are flagged "alpha, not subject to semver" by Oxlint; no extra
 * experimental CLI flag is required in 1.64.0 — declaring `jsPlugins` activates
 * the loader. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Rule severities are tracked in `.oxlintrc.json`. Current publy/* rules:
 *   - `publy/no-op` → "off" (scaffold sentinel)
 *   - `publy/prefer-specific-lodash-imports` → "error"
 *   - `publy/no-console-in-source` → "off" (dormant)
 *   - `publy/no-raw-mui-textfield-register` → "off" (dormant)
 *   - `publy/no-direct-dayjs-in-components` → "off" (dormant)
 */
import { noDirectDayjsInComponents } from './rules/no-direct-dayjs-in-components.js';
import { noOp } from './rules/no-op.js';
import { noRawMuiTextfieldRegister } from './rules/no-raw-mui-textfield-register.js';
import { preferSpecificLodashImports } from './rules/prefer-specific-lodash-imports.js';

// Plugin object shape (oxlint 1.64.0): `{ meta: { name }, rules: { [name]: Rule } }`.
const plugin = {
	meta: {
		name: 'publy',
	},
	rules: {
		'no-op': noOp,
		'no-console-in-source': noConsoleInSource,
		'no-raw-mui-textfield-register': noRawMuiTextfieldRegister,
		'no-direct-dayjs-in-components': noDirectDayjsInComponents,
		'prefer-specific-lodash-imports': preferSpecificLodashImports,
	},
};

export default plugin;
