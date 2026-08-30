import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Since #155 the workspace runs zod v4, whose bundled per-locale error maps
// replaced both zod v3's defaultErrorMap and the v3-only `zod-i18n-map`
// package this script used to read. The generator consumes zod's own locale
// functions and flattens them into the same `{ errors, types, validations }`
// JSON shape the i18n backend serves under the `zod` namespace, so every
// existing translation key keeps working unchanged.
//
// Keyed to the codes the v4 RUNTIME actually emits (invalid_format,
// invalid_value, ...) rather than the retired v3 vocabulary
// (invalid_string, invalid_enum_value), with one deliberate exception:
// `errors.invalid_enum_value` is kept as an alias because the frontend
// test-suite asserts that historical key.
//
// Templates are recovered from the installed locales by SENTINEL PROBING:
// each sentence is generated twice with two different sentinel values, and
// the shared prefix/suffix boundaries locate the token to replace with an
// i18next placeholder. Nothing is hand-copied, so the JSON stays in
// lockstep with whatever wording the pinned zod version ships.
const supportedLanguages = ['en', 'fr'];

console.log('Generating zod i18n maps...');

/** Length of the shared prefix of two strings. */
const commonPrefixLength = (a, b) => {
	let n = 0;
	while (n < a.length && n < b.length && a[n] === b[n]) {
		n += 1;
	}
	return n;
};

/** Length of the shared suffix of two strings. */
const commonSuffixLength = (a, b) => {
	let n = 0;
	while (
		n < a.length &&
		n < b.length &&
		a[a.length - 1 - n] === b[b.length - 1 - n]
	) {
		n += 1;
	}
	return n;
};

for (const language of supportedLanguages) {
	console.log(`Processing ${language}...`);

	try {
		const localeModule = await import(`zod/v4/locales/${language}.cjs`);
		const buildLocaleError = localeModule.default;
		if (typeof buildLocaleError !== 'function') {
			throw new TypeError(
				`zod/v4/locales/${language}.cjs did not export a locale factory`,
			);
		}

		const localeError = buildLocaleError().localeError;
		if (typeof localeError !== 'function') {
			throw new TypeError(
				`zod/v4/locales/${language}.cjs produced no localeError map`,
			);
		}

		const messageFor = (issue) => {
			const message = localeError(issue);
			if (typeof message !== 'string' || message.length === 0) {
				throw new TypeError(
					`locale produced no message for ${issue.code}: ${JSON.stringify(issue)}`,
				);
			}
			return message;
		};

		const P = (name) => `{{${name}}}`;

		// --- invalid_type: recover both placeholder boundaries -------------
		// v4's invalid_type sentence has no invariant text AFTER the received
		// token, so boundaries come from controlled pairs instead:
		//  1. Same input, different expected kinds -> the common prefix ends
		//     where the expected token starts and the common suffix spans
		//     everything after it (" expected, received number" etc.).
		//  2. Same expected, different input kinds -> the minimum common
		//     prefix across pairs lands on the received token's first letter;
		//     the token itself is validated against its KNOWN name because
		//     the probe controls the input.
		const sExpA = messageFor({
			code: 'invalid_type',
			expected: 'string',
			input: 42,
		});
		const sExpB = messageFor({
			code: 'invalid_type',
			expected: 'boolean',
			input: 42,
		});
		const sExpC = messageFor({
			code: 'invalid_type',
			expected: 'number',
			input: 42,
		});
		// Minimum across all pairs defeats coincidental letter overlaps in
		// any single pair ("string"/"boolean" both end before " expected").
		const expStart = Math.min(
			commonPrefixLength(sExpA, sExpB),
			commonPrefixLength(sExpA, sExpC),
			commonPrefixLength(sExpB, sExpC),
		);
		const fullTailLength = commonSuffixLength(sExpA, sExpB);
		// The extracted tokens are the LOCALE-TRANSLATED type names, so they
		// cannot be compared to the English sentinels. Validate structurally:
		// three distinct, plausible words at identical offsets.
		const expTokens = [
			sExpA.slice(expStart, sExpA.length - fullTailLength),
			sExpB.slice(expStart, sExpB.length - fullTailLength),
			sExpC.slice(expStart, sExpC.length - fullTailLength),
		];
		if (
			expStart <= 0 ||
			fullTailLength <= 0 ||
			expTokens.some(
				(t) => t.length < 2 || t.includes(',') || t.includes(' '),
			) ||
			new Set(expTokens).size !== 3
		) {
			throw new TypeError(`${language}: expected-token probe misaligned`);
		}

		const sRecB = messageFor({
			code: 'invalid_type',
			expected: 'string',
			input: [],
		});
		const sRecC = messageFor({
			code: 'invalid_type',
			expected: 'string',
			input: null,
		});
		const recStart = Math.min(
			commonPrefixLength(sExpA, sRecB),
			commonPrefixLength(sExpA, sRecC),
			commonPrefixLength(sRecB, sRecC),
		);
		// Invariant text after the received token (empty in English, " received"
		// in French). Derived structurally — never assumed.
		const recPost = Math.min(
			commonSuffixLength(sExpA, sRecB),
			commonSuffixLength(sExpA, sRecC),
			commonSuffixLength(sRecB, sRecC),
		);
		const receivedToken = sExpA.slice(recStart, sExpA.length - recPost);
		if (
			recStart <= expStart ||
			receivedToken.length === 0 ||
			receivedToken.includes(',') ||
			receivedToken.includes(' ')
		) {
			throw new TypeError(`${language}: received-token probe misaligned`);
		}
		const invalidTypeTemplate =
			sExpA.slice(0, expStart) +
			P('expected') +
			sExpA.slice(sExpA.length - fullTailLength, recStart) +
			P('received') +
			sExpA.slice(sExpA.length - recPost);

		// --- types: extract each dictionary entry with fixed boundaries ----
		const TYPE_NAMES = [
			'string',
			'number',
			'int',
			'boolean',
			'bigint',
			'symbol',
			'undefined',
			'null',
			'never',
			'void',
			'date',
			'array',
			'object',
			'tuple',
			'record',
			'map',
			'set',
			'file',
			'nonoptional',
			'nan',
			'function',
			'promise',
		];
		// Every probe below shares input=42, so everything from the end of
		// the expected token to the sentence end is invariant per language:
		// the connector, the received word, and any trailing text.
		const types = {};
		for (const name of TYPE_NAMES) {
			try {
				const sentence = messageFor({
					code: 'invalid_type',
					expected: name,
					input: 42,
				});
				const token = sentence.slice(
					expStart,
					sentence.length - fullTailLength,
				);
				if (token.length === 0 || token.includes(',')) {
					throw new TypeError(`implausible token "${token}"`);
				}
				types[name] = token;
			} catch {
				console.warn(
					`  ! types.${name}: skipped (${name} not translatable here)`,
				);
			}
		}

		// --- scalar error sentences ----------------------------------------
		const data = {
			errors: {
				invalid_type: invalidTypeTemplate,
				invalid_literal: messageFor({
					code: 'invalid_value',
					values: ['alpha'],
					input: 'beta',
				}).replaceAll('"alpha"', P('value')),
				unrecognized_keys: messageFor({
					code: 'unrecognized_keys',
					keys: ['alpha'],
					input: {},
				}).replaceAll('"alpha"', P('keys')),
				invalid_union: messageFor({ code: 'invalid_union', input: '' }),
				invalid_union_discriminator: messageFor({
					code: 'invalid_value',
					values: ['Admin', 'User'],
					input: 'X',
				}).replaceAll('"Admin"|"User"', P('options')),
				// Legacy key kept as alias: the front suite pins this name.
				invalid_enum_value: messageFor({
					code: 'invalid_value',
					values: ['Admin', 'User'],
					input: 'X',
				})
					.replaceAll('"Admin"|"User"', P('options'))
					.replaceAll("'X'", P('received')),
				not_multiple_of: messageFor({
					code: 'not_multiple_of',
					divisor: 3,
					input: 4,
				}).replace('3', P('multipleOf')),
				invalid_date: messageFor({ code: 'invalid_date', input: 'x' }),
				custom: messageFor({ code: 'custom', input: '' }),
				not_finite: messageFor({ code: 'not_finite', input: Infinity }),
				invalid_format: {
					email: messageFor({
						code: 'invalid_format',
						format: 'email',
						input: 'x',
					}),
					url: messageFor({
						code: 'invalid_format',
						format: 'url',
						input: 'x',
					}),
					uuid: messageFor({
						code: 'invalid_format',
						format: 'uuid',
						input: 'x',
					}),
					cuid: messageFor({
						code: 'invalid_format',
						format: 'cuid',
						input: 'x',
					}),
					datetime: messageFor({
						code: 'invalid_format',
						format: 'datetime',
						input: 'x',
					}),
					regex: messageFor({
						code: 'invalid_format',
						format: 'regex',
						pattern: /q/,
						input: 'x',
					}).replaceAll(String(/q/), P('pattern')),
					startsWith: messageFor({
						code: 'invalid_format',
						format: 'starts_with',
						prefix: 'abc',
						input: 'x',
					}).replaceAll('"abc"', P('prefix')),
					endsWith: messageFor({
						code: 'invalid_format',
						format: 'ends_with',
						suffix: 'xyz',
						input: 'x',
					}).replaceAll('"xyz"', P('suffix')),
					includes: messageFor({
						code: 'invalid_format',
						format: 'includes',
						includes: 'needle',
						input: 'x',
					}).replaceAll('"needle"', P('includes')),
				},
				too_small: {},
				too_big: {},
			},
			types,
			validations: {
				email: 'email',
				url: 'url',
				uuid: 'uuid',
				cuid: 'cuid',
				regex: 'regex',
				datetime: 'datetime',
			},
		};

		// --- too_small / too_big: complete sentences per origin ------------
		// Each sentence carries its own unit word ("characters", "items",
		// "octets", ...) in the right place for the language, so only the
		// numeric bound is interpolated. `exact` shares the inclusive wording,
		// mirroring the official locales (the adjective depends solely on the
		// inclusivity flag).
		for (const origin of [
			'string',
			'number',
			'int',
			'bigint',
			'date',
			'array',
			'set',
			'file',
			'map',
		]) {
			const boundSentence = (code, bound, inclusive) =>
				messageFor({ code, origin, [bound]: 5, inclusive, input: '' }).replace(
					'5',
					P(bound),
				);

			data.errors.too_small[origin] = {
				exact: boundSentence('too_small', 'minimum', true),
				inclusive: boundSentence('too_small', 'minimum', true),
				not_inclusive: messageFor({
					code: 'too_small',
					origin,
					minimum: 5,
					inclusive: false,
					input: '',
				}).replace('5', P('minimum')),
			};
			data.errors.too_big[origin] = {
				exact: boundSentence('too_big', 'maximum', true),
				inclusive: boundSentence('too_big', 'maximum', true),
				not_inclusive: messageFor({
					code: 'too_big',
					origin,
					maximum: 5,
					inclusive: false,
					input: '',
				}).replace('5', P('maximum')),
			};
		}

		const outputPath = path.join(__dirname, '../lib/i18n/json');

		fs.writeFileSync(
			path.join(outputPath, `zod.${language}.json`),
			`${JSON.stringify(data, null, '\t')}\n`,
		);
		console.log(`✓ Generated zod.${language}.json`);
	} catch (error) {
		console.error(`Error processing ${language}:`, error.message);
		throw error;
	}
}

console.log('Done!');
