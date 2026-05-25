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
 * JS.1 scaffold (issue #350): shipped the inert `no-op` rule purely to prove the
 * plugin loads. JS.2 (issue #462) adds the first real rule,
 * `prefer-specific-lodash-imports`. Rules are registered `"off"` in
 * `.oxlintrc.json` until their target code is audited, so the plugin ships with
 * zero enforcement.
 */
import { noOp } from './rules/no-op.js';
import { preferSpecificLodashImports } from './rules/prefer-specific-lodash-imports.js';

// Plugin object shape (oxlint 1.64.0): `{ meta: { name }, rules: { [name]: Rule } }`.
const plugin = {
	meta: {
		name: 'publy',
	},
	rules: {
		'no-op': noOp,
		'prefer-specific-lodash-imports': preferSpecificLodashImports,
	},
};

export default plugin;
