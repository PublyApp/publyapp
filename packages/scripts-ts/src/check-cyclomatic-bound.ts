import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Cyclomatic complexity bound guard.
//
// This guard verifies that complexity ceilings declared in .oxlintrc.json match
// the committed reference values in cyclomatic-bound-ref.json. It reasons over
// the COMPLETE set of override patterns — any override whose pattern is not in
// the reference fails, and any reference pattern that is absent from
// .oxlintrc.json also fails. This closes the blind spot where a new override
// pattern for a glob not in the known list would slip through silently.
//
// CRITICAL: This guard must be executed by CI — a guard that CI doesn't run
// provides no protection against "cliquet drift".

/**
 * The repository root, resolved relative to this file's location.
 * Used to default the .oxlintrc.json and cyclomatic-bound-ref.json paths.
 */
const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../..',
);

// @ts-expect-error rung-0: add proper type in later rung
const readJsonFile = (filePath) => {
	const content = fs.readFileSync(filePath, 'utf-8');

	return JSON.parse(content);
}

/** Extracts the complexity `max` from an oxlint complexity rule value. */
// @ts-expect-error rung-0: add proper type in later rung
const extractComplexityMax = (rule) => {
	if (
		Array.isArray(rule) &&
		rule.length >= 2 &&
		typeof rule[1] === 'object' &&
		rule[1] !== null &&
		'max' in rule[1]
	) {
		return Number(rule[1].max);
	}
	return null;
}

/**
 * Builds a Map of pattern → max from the .oxlintrc.json config.
 *
 * The special key "__default__" corresponds to the root-level rules.complexity.
 * Every override's `files` entries are mapped to their complexity max.
 */
// @ts-expect-error rung-0: add proper type in later rung
const buildActualPatternMaxMap = (config) => {
	const map = new Map();

	const defaultMax = extractComplexityMax(config.rules?.complexity);
	if (defaultMax !== null) {
		map.set('__default__', defaultMax);
	}

	for (const override of config.overrides ?? []) {
		const max = extractComplexityMax(override.rules?.complexity);
		if (max !== null) {
			for (const filePattern of override.files ?? []) {
				map.set(filePattern, max);
			}
		}
	}

	return map;
}

/**
 * Verifies that the complexity bounds in .oxlintrc.json match the reference
 * values in cyclomatic-bound-ref.json.
 *
 * Returns an array of human-readable error strings (empty = pass).
 * Throws SyntaxError if either JSON file is malformed.
 */
// @ts-expect-error rung-0: add proper type in later rung
export const verifyComplexityBounds = (oxlintrcPath, referencePath_) => {
	const refPath =
		referencePath_ ??
		path.resolve(repoRoot, 'packages/scripts-ts/src/cyclomatic-bound-ref.json');
	const oxlintPath = oxlintrcPath ?? path.resolve(repoRoot, '.oxlintrc.json');

	let config;
	try {
		config = readJsonFile(oxlintPath);
	} catch (e) {
		return ['Cannot parse ' + oxlintPath + ': ' + e];
	}

	let reference;
	try {
		reference = readJsonFile(refPath);
	} catch (e) {
		return ['Cannot parse ' + refPath + ': ' + e];
	}

	const actual = buildActualPatternMaxMap(config);
	const expected = new Map(Object.entries(reference));

	// Remove the "$comment" key if present (JSON doesn't enforce it, but it's
	// metadata, not a pattern).
	expected.delete('$comment');

	const errors = [];

	// Constat 1: verify the COMPLETE set of patterns.
	// Every pattern in .oxlintrc.json must be known (present in the reference).
	for (const [pattern, actualMax] of actual) {
		if (!expected.has(pattern)) {
			errors.push(
				'Unknown override pattern "' +
					pattern +
					'": .oxlintrc.json declares a complexity override for a pattern not present in cyclomatic-bound-ref.json. Either add it to the reference (with justification) or remove the override.',
			);
			continue;
		}

		const expectedMax = expected.get(pattern);
		if (actualMax !== expectedMax) {
			if (actualMax > expectedMax) {
				errors.push(
					'Pattern "' +
						pattern +
						'": the ceiling was RAISED from ' +
						expectedMax +
						' to ' +
						actualMax +
						' in .oxlintrc.json. To relax this bound, update cyclomatic-bound-ref.json and justify the change in review.',
				);
			} else {
				errors.push(
					'Pattern "' +
						pattern +
						'": the ceiling was LOWERED from ' +
						expectedMax +
						' to ' +
						actualMax +
						' in .oxlintrc.json. Update cyclomatic-bound-ref.json to match.',
				);
			}
		}
	}

	// Constat 1 (reverse direction): every reference pattern must exist in .oxlintrc.json.
	for (const [pattern] of expected) {
		if (!actual.has(pattern)) {
			errors.push(
				'Reference pattern "' +
					pattern +
					'" is not present in .oxlintrc.json. The reference file declares a ceiling for a pattern that has no corresponding override — either add the override to .oxlintrc.json or remove the reference entry.',
			);
		}
	}

	return errors;
}

// Main entry point
const main = () => {
	const resolvedOxlintPath = path.resolve(process.cwd(), '.oxlintrc.json');
	const resolvedRefPath = path.resolve(
		process.cwd(),
		'packages/scripts-ts/src/cyclomatic-bound-ref.json',
	);

	let errors;
	try {
		errors = verifyComplexityBounds(resolvedOxlintPath, resolvedRefPath);
	} catch (e) {
		console.error('Complexity bound guard: ' + e.message);
		process.exit(1);
	}

	if (errors.length > 0) {
		console.error('Complexity bound configuration violations:');
		for (const error of errors) {
			console.error('  ' + error);
		}
		console.error('');
		console.error(
			'FAILED: Complexity bounds in .oxlintrc.json do not match cyclomatic-bound-ref.json.',
		);
		console.error('');
		console.error(
			'This guard verifies that complexity ceilings are NOT drifting.',
		);
		console.error('If you need to change a bound:');
		console.error('1. Update cyclomatic-bound-ref.json');
		console.error(
			'2. Update the test assertions in check-cyclomatic-bound.test.ts',
		);
		console.error('3. Update .oxlintrc.json to match the reference');
		console.error('');
		console.error('All three files must change — this is intentional.');
		process.exit(1);
	}

	console.log(
		'PASSED: Complexity bounds in .oxlintrc.json match cyclomatic-bound-ref.json.',
	);
	process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
