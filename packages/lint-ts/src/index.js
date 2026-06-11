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
 *   - `publy/no-native-html-in-mui-surfaces` → "off" (dormant)
 *   - `publy/no-raw-img-in-product-surfaces` → "error"
 *   - `publy/no-manual-response-message-translation` → "off" (dormant)
 *   - `publy/no-array-reduce` → "error"
 */
import { noArrayReduce } from './rules/no-array-reduce.js';
import { noConsoleInSource } from './rules/no-console-in-source.js';
import { noDirectDayjsInComponents } from './rules/no-direct-dayjs-in-components.js';
import { noManualResponseMessageTranslation } from './rules/no-manual-response-message-translation.js';
import { noNativeHtmlInMuiSurfaces } from './rules/no-native-html-in-mui-surfaces.js';
import { noOp } from './rules/no-op.js';
import { noRawImgInProductSurfaces } from './rules/no-raw-img-in-product-surfaces.js';
import { noRawMuiTextfieldRegister } from './rules/no-raw-mui-textfield-register.js';
import { preferSpecificLodashImports } from './rules/prefer-specific-lodash-imports.js';

// Plugin object shape (oxlint 1.64.0): `{ meta: { name }, rules: { [name]: Rule } }`.
const plugin = {
	meta: {
		name: 'publy',
	},
	rules: {
		'no-op': noOp,
		'no-array-reduce': noArrayReduce,
		'no-console-in-source': noConsoleInSource,
		'no-raw-mui-textfield-register': noRawMuiTextfieldRegister,
		'no-direct-dayjs-in-components': noDirectDayjsInComponents,
		'no-native-html-in-mui-surfaces': noNativeHtmlInMuiSurfaces,
		'no-raw-img-in-product-surfaces': noRawImgInProductSurfaces,
		'no-manual-response-message-translation':
			noManualResponseMessageTranslation,
		'prefer-specific-lodash-imports': preferSpecificLodashImports,
	},
};

export default plugin;
