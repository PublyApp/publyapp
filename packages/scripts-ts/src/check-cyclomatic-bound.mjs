// Cyclomatic complexity bound guard.
//
// This guard verifies that complexity bounds in .oxlintrc.json are enforced
// and haven't drifted. It reads the TRUE values from .oxlintrc.json and
// ensures they match the expected configuration.
//
// CRITICAL: This guard must be executed by CI - a guard that CI doesn't run
// provides no protection against "cliquet drift".
//
// HOW IT WORKS:
// - Reads .oxlintrc.json and extracts complexity max values
// - Compares against known-valid values
// - FAILS if any bound is different from expected
//
// PROOF REQUIRED:
// To prove a bound can increase: increase by 1, show guard fails; restore, show passes
// To prove a bound can decrease: decrease, show it still passes

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Extract complexity max from rule
function extractComplexityMax(rule) {
	if (
		Array.isArray(rule) &&
		rule.length >= 2 &&
		typeof rule[1] === 'object' &&
		rule[1] !== null
	) {
		const options = rule[1];
		if ('max' in options) {
			return Number(options.max);
		}
	}
	return null;
}

// Build a map of pattern -> max from oxlint config
function buildPatternMaxMap(config) {
	const map = new Map();

	// Start with default from rules
	const defaultMax = extractComplexityMax(config.rules.complexity);
	if (defaultMax !== null) {
		map.set('DEFAULT', defaultMax);
	}

	// Then apply overrides
	for (const override of config.overrides) {
		const max = extractComplexityMax(override.rules.complexity);
		if (max !== null) {
			for (const filePattern of override.files) {
				map.set(filePattern, max);
			}
		}
	}

	return map;
}

function verifyComplexityBounds(configPath) {
	const errors = [];

	let config;
	try {
		const content = fs.readFileSync(configPath, 'utf-8');
		config = JSON.parse(content);
	} catch (e) {
		return ['Cannot parse ' + configPath + ': ' + e];
	}

	const patternMaxMap = buildPatternMaxMap(config);

	// Check default max
	const defaultMax = patternMaxMap.get('DEFAULT');
	if (defaultMax !== 125) {
		errors.push('Default complexity max is ' + defaultMax + ', expected 125');
	}

	// Check apps/front/src/**
	const frontSrcMax = patternMaxMap.get('apps/front/src/**');
	if (frontSrcMax !== 60) {
		errors.push(
			'Pattern "apps/front/src/**" has complexity max ' +
				(frontSrcMax ?? 'undefined') +
				', expected 60',
		);
	}

	// Check scripts/tools patterns
	const scriptsToolsPatterns = [
		'apps/front/scripts/**',
		'apps/front/tools/**',
		'packages/lint-ts/**',
		'packages/scripts-ts/**',
		'packages/shared-ts/**',
	];
	for (const pattern of scriptsToolsPatterns) {
		const max = patternMaxMap.get(pattern);
		if (max !== 125) {
			errors.push(
				'Pattern "' +
					pattern +
					'" has complexity max ' +
					(max ?? 'undefined') +
					', expected 125',
			);
		}
	}

	// Check test file patterns
	const testPatterns = [
		'**/*.test.ts',
		'**/*.test.tsx',
		'**/*.spec.ts',
		'**/*.spec.tsx',
		'apps/front/e2e/**',
	];
	for (const pattern of testPatterns) {
		const max = patternMaxMap.get(pattern);
		if (max !== 90) {
			errors.push(
				'Pattern "' +
					pattern +
					'" has complexity max ' +
					(max ?? 'undefined') +
					', expected 90',
			);
		}
	}

	return errors;
}

// Main entry point
function main() {
	const repoRoot = process.cwd().includes('.worktrees')
		? process.cwd().split('/.worktrees')[0]
		: process.cwd();

	const configPath = path.join(repoRoot, '.oxlintrc.json');
	const errors = verifyComplexityBounds(configPath);

	if (errors.length > 0) {
		console.error('Complexity bound configuration violations:');
		for (const error of errors) {
			console.error('  ' + error);
		}
		console.error('');
		console.error(
			'FAILED: Complexity bounds in .oxlintrc.json do not match expected values.',
		);
		console.error('');
		console.error(
			'This guard verifies that complexity bounds are NOT drifting.',
		);
		console.error('If you need to change a bound:');
		console.error('1. Update expected values in this file');
		console.error('2. Prove the change with test cases');
		console.error('3. Update .oxlintrc.json to match');
		process.exit(1);
	}

	console.log('PASSED: Complexity bounds are within expected values.');
	process.exit(0);
}

const __filename = new URL(import.meta.url).pathname;
if (import.meta.url === `file://${__filename}`) {
	main();
}

export { verifyComplexityBounds };
