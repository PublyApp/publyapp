import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
	access,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
	buildHomepagePromptBatchArtifacts,
	generateHomepagePromptBatch,
	loadHomepageFactoryConfig,
	validateHomepageFactoryConfig,
} from './generator.mjs';
import { buildHomepagePrompt } from './prompt-template.mjs';

const execFileAsync = promisify(execFile);

const createTempOutputDir = async () => {
	return mkdtemp(path.join(os.tmpdir(), 'homepage-prompts-'));
};

const writeJson = async (filePath, value) => {
	await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
};

const pathExists = async (targetPath) => {
	try {
		await access(targetPath);

		return true;
	} catch {
		return false;
	}
};

const escapeRegExp = (value) => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const buildRecipeKey = (entry) => {
	return [
		entry.audienceOverlay,
		entry.homepageArchetype,
		entry.promiseAngle,
		entry.proofStrategy,
		entry.creativeDirectionBundle,
	].join('|');
};

const TEST_CONFIG = {
	productCore: {
		productName: 'PublyApp',
		productSummary:
			'A social publishing workspace for multi-tenant SaaS teams.',
		coreDifferentiators: [
			'Plan social publishing campaigns across tenants and projects',
			'Coordinate approvals before scheduling content',
		],
		workflowStrengths: [
			'Shared editorial workflow with per-project visibility',
			'Fast handoff from draft to publish',
		],
		trustSignals: [
			'Role-based access control',
			'Audit-friendly publishing history',
		],
		productVisualRequirements: [
			'Queue overview',
			'Workflow approval states',
			'Publishing calendar',
		],
		forbiddenClaims: ['Guaranteed virality', 'Automated growth without effort'],
		forbiddenCopyPatterns: ['magic AI', 'one-click success', 'set and forget'],
	},
	audienceOverlays: [
		{
			id: 'agencies',
			audienceLabel: 'Agencies',
			primaryPains: [
				'Too many client approvals',
				'Fragmented publishing handoffs',
			],
			desiredOutcomes: [
				'Ship client content on time',
				'Keep approvals visible',
			],
			topObjections: [
				'Will this slow the team down?',
				'Can clients stay in the loop?',
			],
			decisionCriteria: [
				'Approval workflow',
				'Multi-tenant support',
				'Reporting',
			],
			proofExpectations: [
				'Workflow proof',
				'Delivery metrics',
				'Operational credibility',
			],
			ctaPreference: 'Book a walkthrough',
			productFocusAreas: [
				'Approvals',
				'Campaign visibility',
				'Publishing readiness',
			],
			faqConcerns: [
				'Client collaboration',
				'Handoff speed',
				'Process standardization',
			],
			preferredToneAdjustments: [
				'Confident',
				'Delivery-focused',
				'Operational',
			],
		},
		{
			id: 'in-house',
			audienceLabel: 'In-House Teams',
			primaryPains: ['Unclear ownership', 'Manual post scheduling'],
			desiredOutcomes: [
				'Centralize publishing work',
				'Reduce coordination overhead',
			],
			topObjections: ['Is setup complex?', 'Does it fit our workflow?'],
			decisionCriteria: ['Ease of rollout', 'Visibility', 'Governance'],
			proofExpectations: [
				'Workflow clarity',
				'Adoption signals',
				'Review-state visibility',
			],
			ctaPreference: 'See the workflow',
			productFocusAreas: ['Calendar', 'Review flow', 'Publishing queue'],
			faqConcerns: ['Approvals', 'Handoffs', 'Tool consolidation'],
			preferredToneAdjustments: ['Clear', 'Trustworthy', 'Team-oriented'],
		},
	],
	homepageArchetypes: [
		{
			id: 'workflow-story',
			label: 'Workflow Story',
			heroGoal: 'Show how teams move from draft to published post',
			narrativeOrder: ['hero', 'workflow', 'proof', 'cta'],
			requiredSections: ['hero', 'workflow', 'proof', 'cta'],
			optionalSections: ['logo-strip', 'faq'],
			proofPlacement: 'After the workflow narrative',
			ctaStyle: 'Action-oriented',
			compatiblePromiseAngles: ['ship-consistently', 'launch-faster'],
			compatibleProofStrategies: ['ops-metrics', 'social-proof'],
			compatibleCreativeBundles: ['product-led-clean', 'editorial-bold'],
		},
		{
			id: 'product-tour',
			label: 'Product Tour',
			heroGoal: 'Demonstrate the product experience clearly',
			narrativeOrder: ['hero', 'feature-tour', 'proof', 'cta'],
			requiredSections: ['hero', 'feature-tour', 'proof', 'cta'],
			optionalSections: ['logo-strip', 'faq'],
			proofPlacement: 'Mid-page',
			ctaStyle: 'Demonstration-led',
			compatiblePromiseAngles: ['ship-consistently', 'launch-faster'],
			compatibleProofStrategies: ['ops-metrics', 'social-proof'],
			compatibleCreativeBundles: ['product-led-clean', 'editorial-bold'],
		},
	],
	promiseAngles: [
		{
			id: 'ship-consistently',
			label: 'Ship Consistently',
			corePromise: 'Publish reliably without losing the thread',
			headlineDirection: 'Confidence in the editorial cadence',
			supportingMessageThemes: [
				'Clear ownership',
				'Reusable planning',
				'Predictable delivery',
			],
			bestFitAudiences: ['agencies', 'in-house'],
			bestFitArchetypes: ['workflow-story', 'product-tour'],
		},
		{
			id: 'launch-faster',
			label: 'Launch Faster',
			corePromise: 'Move campaigns from draft to live faster',
			headlineDirection: 'Speed with control',
			supportingMessageThemes: [
				'Faster approvals',
				'Fewer bottlenecks',
				'Shared visibility',
			],
			bestFitAudiences: ['agencies', 'in-house'],
			bestFitArchetypes: ['workflow-story', 'product-tour'],
		},
	],
	proofStrategies: [
		{
			id: 'ops-metrics',
			label: 'Ops Metrics',
			proofType: 'Process evidence',
			recommendedProofElements: [
				'Approval count',
				'Time-to-publish',
				'Workflow status',
			],
			proofPlacementGuidance: 'Pair proof with workflow sections',
			bestFitAudiences: ['agencies', 'in-house'],
			bestFitArchetypes: ['workflow-story', 'product-tour'],
		},
		{
			id: 'social-proof',
			label: 'Social Proof',
			proofType: 'Customer evidence',
			recommendedProofElements: ['Testimonials', 'Logos', 'Usage stats'],
			proofPlacementGuidance: 'Place proof immediately after the hero',
			bestFitAudiences: ['agencies', 'in-house'],
			bestFitArchetypes: ['workflow-story', 'product-tour'],
		},
	],
	creativeBundles: [
		{
			id: 'product-led-clean',
			label: 'Product-Led Clean',
			heroStyle: 'Centered product focus',
			visualDensity: 'Balanced',
			motionBehavior: 'Subtle, functional motion',
			colorDirection: 'Neutral with a strong accent',
			surfaceTreatment: 'Soft cards and clean panels',
			screenshotTreatment: 'Crisp UI captures with clear focus',
			copyTone: 'Direct and confident',
			compatibilityTags: [
				'agencies',
				'in-house',
				'workflow-story',
				'product-tour',
			],
			referenceAnchors: [
				'https://example.com/stripe',
				'https://example.com/linear',
				'https://example.com/figma',
				'https://example.com/intercom',
			],
			inspirationLibraries: [
				'https://example.com/land-book',
				'https://example.com/awwwards',
			],
		},
		{
			id: 'editorial-bold',
			label: 'Editorial Bold',
			heroStyle: 'Editorial layout with strong hierarchy',
			visualDensity: 'Rich',
			motionBehavior: 'Deliberate, cinematic transitions',
			colorDirection: 'High-contrast editorial palette',
			surfaceTreatment: 'Layered surfaces with depth',
			screenshotTreatment: 'Large product crops with framing',
			copyTone: 'Bold and concise',
			compatibilityTags: [
				'agencies',
				'in-house',
				'workflow-story',
				'product-tour',
			],
			referenceAnchors: [
				'https://example.com/notion',
				'https://example.com/airtable',
				'https://example.com/slack',
				'https://example.com/webflow',
			],
			inspirationLibraries: [
				'https://example.com/lapa',
				'https://example.com/land-book',
			],
		},
	],
};

test('generateHomepagePromptBatch is deterministic for a fixed seed', async () => {
	const firstDir = await createTempOutputDir();
	const secondDir = await createTempOutputDir();

	try {
		const first = await generateHomepagePromptBatch({
			config: TEST_CONFIG,
			outputDir: firstDir,
			variants: 2,
			seed: 'deterministic-seed',
			buildPrompt: buildHomepagePrompt,
		});
		const second = await generateHomepagePromptBatch({
			config: TEST_CONFIG,
			outputDir: secondDir,
			variants: 2,
			seed: 'deterministic-seed',
			buildPrompt: buildHomepagePrompt,
		});

		assert.deepEqual(first.manifest, second.manifest);
		assert.deepEqual(first.manifest, [
			{
				variant: 1,
				fileName: '001-homepage-prompt.md',
				seed: 'deterministic-seed',
				audienceOverlay: 'in-house',
				homepageArchetype: 'product-tour',
				promiseAngle: 'launch-faster',
				proofStrategy: 'social-proof',
				creativeDirectionBundle: 'editorial-bold',
				selectedReferences: [
					'https://example.com/notion',
					'https://example.com/airtable',
					'https://example.com/slack',
					'https://example.com/webflow',
				],
				selectedLibraries: [
					'https://example.com/lapa',
					'https://example.com/land-book',
				],
			},
			{
				variant: 2,
				fileName: '002-homepage-prompt.md',
				seed: 'deterministic-seed',
				audienceOverlay: 'agencies',
				homepageArchetype: 'workflow-story',
				promiseAngle: 'launch-faster',
				proofStrategy: 'social-proof',
				creativeDirectionBundle: 'editorial-bold',
				selectedReferences: [
					'https://example.com/notion',
					'https://example.com/airtable',
					'https://example.com/slack',
					'https://example.com/webflow',
				],
				selectedLibraries: [
					'https://example.com/lapa',
					'https://example.com/land-book',
				],
			},
		]);
		assert.equal(first.prompts.length, 2);
		assert.equal(second.prompts.length, 2);

		const manifestOnDisk = JSON.parse(
			await readFile(path.join(firstDir, 'manifest.json'), 'utf8'),
		);
		const firstPromptOnDisk = await readFile(
			path.join(firstDir, '001-homepage-prompt.md'),
			'utf8',
		);

		assert.deepEqual(manifestOnDisk, first.manifest);
		assert.match(firstPromptOnDisk, /- Seed: \*\*deterministic-seed\*\*/);
	} finally {
		await rm(firstDir, { recursive: true, force: true });
		await rm(secondDir, { recursive: true, force: true });
	}
});

test('buildHomepagePromptBatchArtifacts generates prompt artifacts in memory', () => {
	const result = buildHomepagePromptBatchArtifacts({
		config: TEST_CONFIG,
		variants: 2,
		seed: 'deterministic-seed',
		buildPrompt: buildHomepagePrompt,
	});

	assert.deepEqual(result.manifest, [
		{
			variant: 1,
			fileName: '001-homepage-prompt.md',
			seed: 'deterministic-seed',
			audienceOverlay: 'in-house',
			homepageArchetype: 'product-tour',
			promiseAngle: 'launch-faster',
			proofStrategy: 'social-proof',
			creativeDirectionBundle: 'editorial-bold',
			selectedReferences: [
				'https://example.com/notion',
				'https://example.com/airtable',
				'https://example.com/slack',
				'https://example.com/webflow',
			],
			selectedLibraries: [
				'https://example.com/lapa',
				'https://example.com/land-book',
			],
		},
		{
			variant: 2,
			fileName: '002-homepage-prompt.md',
			seed: 'deterministic-seed',
			audienceOverlay: 'agencies',
			homepageArchetype: 'workflow-story',
			promiseAngle: 'launch-faster',
			proofStrategy: 'social-proof',
			creativeDirectionBundle: 'editorial-bold',
			selectedReferences: [
				'https://example.com/notion',
				'https://example.com/airtable',
				'https://example.com/slack',
				'https://example.com/webflow',
			],
			selectedLibraries: [
				'https://example.com/lapa',
				'https://example.com/land-book',
			],
		},
	]);
	assert.equal(result.prompts.length, 2);
	assert.match(result.prompts[0].content, /- Seed: \*\*deterministic-seed\*\*/);
});

test('generateHomepagePromptBatch rejects empty selection arrays', async () => {
	const outputDir = await createTempOutputDir();

	try {
		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config: {
						...TEST_CONFIG,
						audienceOverlays: [],
					},
					outputDir,
					variants: 1,
					seed: 'deterministic-seed',
					buildPrompt: buildHomepagePrompt,
				}),
			/audienceOverlays must contain at least one item/,
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch validates direct-call variant counts', async () => {
	const outputDir = await createTempOutputDir();

	try {
		for (const variants of [1.5, 0, -1, 201]) {
			await assert.rejects(
				() =>
					generateHomepagePromptBatch({
						config: TEST_CONFIG,
						outputDir,
						variants,
						seed: 'invalid-variants',
						buildPrompt: buildHomepagePrompt,
					}),
				/Variants must be an integer between 1 and 200\./,
			);
		}
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch avoids duplicate recipes when enough unique combinations exist', async () => {
	const outputDir = await createTempOutputDir();

	try {
		const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
		const result = await generateHomepagePromptBatch({
			config,
			outputDir,
			variants: 5,
			seed: 'seed-5',
			buildPrompt: buildHomepagePrompt,
		});

		const recipeKeys = result.manifest.map(buildRecipeKey);

		assert.equal(recipeKeys.length, 5);
		assert.equal(new Set(recipeKeys).size, recipeKeys.length);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch preserves existing output when buildPrompt throws', async () => {
	const outputDir = await createTempOutputDir();
	const existingFile = path.join(outputDir, 'existing.txt');

	try {
		await writeFile(existingFile, 'keep me', 'utf8');

		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config: TEST_CONFIG,
					outputDir,
					variants: 1,
					seed: 'throwing-seed',
					buildPrompt: () => {
						throw new Error('builder failed');
					},
				}),
			/builder failed/,
		);

		assert.equal(await readFile(existingFile, 'utf8'), 'keep me');
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch requires a buildPrompt function', async () => {
	const outputDir = await createTempOutputDir();

	try {
		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config: TEST_CONFIG,
					outputDir,
					variants: 1,
					seed: 'missing-builder',
				}),
			/generateHomepagePromptBatch requires a buildPrompt function\./,
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch validates prompt input fields before rendering', async () => {
	const outputDir = await createTempOutputDir();

	try {
		const config = JSON.parse(JSON.stringify(TEST_CONFIG));
		delete config.productCore.productSummary;

		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config,
					outputDir,
					variants: 1,
					seed: 'prompt-input-validation',
					buildPrompt: buildHomepagePrompt,
				}),
			/productCore\.productSummary must be a non-empty string/,
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch preserves existing output when staged publish fails', async () => {
	const outputDir = await createTempOutputDir();
	const existingFile = path.join(outputDir, 'existing.txt');
	let writeAttempts = 0;

	try {
		await writeFile(existingFile, 'keep me', 'utf8');

		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config: TEST_CONFIG,
					outputDir,
					variants: 2,
					seed: 'publish-failure-seed',
					buildPrompt: buildHomepagePrompt,
					fileOps: {
						writeFile: async (filePath, content, encoding) => {
							writeAttempts += 1;

							if (writeAttempts === 2) {
								throw new Error('simulated write failure');
							}

							return writeFile(filePath, content, encoding);
						},
					},
				}),
			/simulated write failure/,
		);

		assert.equal(await readFile(existingFile, 'utf8'), 'keep me');
		assert.equal(
			await pathExists(path.join(outputDir, '001-homepage-prompt.md')),
			false,
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generateHomepagePromptBatch preserves the backup when rollback rename fails', async () => {
	const outputDir = await createTempOutputDir();
	const existingFile = path.join(outputDir, 'existing.txt');
	let renameAttempts = 0;

	try {
		await writeFile(existingFile, 'keep me', 'utf8');

		await assert.rejects(
			() =>
				generateHomepagePromptBatch({
					config: TEST_CONFIG,
					outputDir,
					variants: 2,
					seed: 'rollback-restore-failure-seed',
					buildPrompt: buildHomepagePrompt,
					fileOps: {
						rename: async (fromPath, toPath) => {
							renameAttempts += 1;

							if (renameAttempts === 2) {
								throw new Error('simulated publish failure');
							}

							if (renameAttempts === 3) {
								throw new Error('simulated restore failure');
							}

							return rename(fromPath, toPath);
						},
					},
				}),
			/simulated publish failure/,
		);

		const outputParentDir = path.dirname(outputDir);
		const backupName = (await readdir(outputParentDir)).find((name) =>
			name.startsWith(`${path.basename(outputDir)}.backup-`),
		);

		assert.ok(backupName);
		assert.equal(await pathExists(outputDir), false);
		assert.equal(
			await readFile(
				path.join(outputParentDir, backupName, 'existing.txt'),
				'utf8',
			),
			'keep me',
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });

		for (const entry of await readdir(path.dirname(outputDir))) {
			if (entry.startsWith(`${path.basename(outputDir)}.backup-`)) {
				await rm(path.join(path.dirname(outputDir), entry), {
					recursive: true,
					force: true,
				});
			}
		}
	}
});

test('loadHomepageFactoryConfig reports missing required array fields clearly', async () => {
	const factoryDir = await mkdtemp(path.join(os.tmpdir(), 'homepage-factory-'));

	try {
		await writeJson(path.join(factoryDir, 'product-core.json'), {
			productName: 'PublyApp',
			productSummary:
				'A social publishing workspace for multi-tenant SaaS teams.',
			coreDifferentiators: ['Approval workflows'],
			workflowStrengths: ['Fast handoff'],
			trustSignals: ['Audit history'],
			productVisualRequirements: ['Publishing calendar'],
			forbiddenClaims: ['Guaranteed virality'],
			forbiddenCopyPatterns: ['magic AI'],
		});
		await writeJson(path.join(factoryDir, 'audience-overlays.json'), [
			{
				id: 'agencies',
				audienceLabel: 'Agencies',
				primaryPains: ['Approval bottlenecks'],
				desiredOutcomes: ['Ship client content on time'],
				topObjections: ['Will this slow the team down?'],
				decisionCriteria: ['Approval workflow'],
				proofExpectations: ['Workflow proof'],
				ctaPreference: 'Book a walkthrough',
				productFocusAreas: ['Approvals'],
				faqConcerns: ['Client collaboration'],
				preferredToneAdjustments: ['Operational'],
			},
		]);
		await writeJson(path.join(factoryDir, 'homepage-archetypes.json'), [
			{
				id: 'workflow-story',
				label: 'Workflow Story',
				heroGoal: 'Show how teams move from draft to published post',
				narrativeOrder: ['hero'],
				requiredSections: ['hero'],
				optionalSections: ['faq'],
				proofPlacement: 'After the workflow narrative',
				ctaStyle: 'Action-oriented',
				compatibleProofStrategies: ['ops-metrics'],
				compatibleCreativeBundles: ['product-led-clean'],
			},
		]);
		await writeJson(path.join(factoryDir, 'promise-angles.json'), [
			{
				id: 'ship-consistently',
				label: 'Ship Consistently',
				bestFitAudiences: ['agencies'],
				bestFitArchetypes: ['workflow-story'],
			},
		]);
		await writeJson(path.join(factoryDir, 'proof-strategies.json'), [
			{
				id: 'ops-metrics',
				label: 'Ops Metrics',
				bestFitAudiences: ['agencies'],
				bestFitArchetypes: ['workflow-story'],
			},
		]);
		await writeJson(path.join(factoryDir, 'creative-bundles.json'), [
			{
				id: 'product-led-clean',
				label: 'Product-Led Clean',
				compatibilityTags: ['agencies', 'workflow-story'],
				referenceAnchors: ['https://example.com/stripe'],
				inspirationLibraries: ['https://example.com/land-book'],
			},
		]);

		await assert.rejects(
			() => loadHomepageFactoryConfig({ factoryDir }),
			/homepageArchetypes\[0\]\.compatiblePromiseAngles must be an array/,
		);
	} finally {
		await rm(factoryDir, { recursive: true, force: true });
	}
});

test('loadHomepageFactoryConfig reports missing required scalar fields clearly', async () => {
	const factoryDir = await mkdtemp(path.join(os.tmpdir(), 'homepage-factory-'));

	try {
		await writeJson(path.join(factoryDir, 'product-core.json'), {
			productName: 'PublyApp',
			productSummary:
				'A social publishing workspace for multi-tenant SaaS teams.',
			coreDifferentiators: ['Approval workflows'],
			workflowStrengths: ['Fast handoff'],
			trustSignals: ['Audit history'],
			productVisualRequirements: ['Publishing calendar'],
			forbiddenClaims: ['Guaranteed virality'],
			forbiddenCopyPatterns: ['magic AI'],
		});
		await writeJson(path.join(factoryDir, 'audience-overlays.json'), [
			{
				id: 'agencies',
				audienceLabel: 'Agencies',
				primaryPains: ['Approval bottlenecks'],
				desiredOutcomes: ['Ship client content on time'],
				topObjections: ['Will this slow the team down?'],
				decisionCriteria: ['Approval workflow'],
				proofExpectations: ['Workflow proof'],
				ctaPreference: 'Book a walkthrough',
				productFocusAreas: ['Approvals'],
				faqConcerns: ['Client collaboration'],
				preferredToneAdjustments: ['Operational'],
			},
		]);
		await writeJson(path.join(factoryDir, 'homepage-archetypes.json'), [
			{
				id: 'workflow-story',
				label: 'Workflow Story',
				narrativeOrder: ['hero'],
				requiredSections: ['hero'],
				optionalSections: ['faq'],
				proofPlacement: 'After the workflow narrative',
				ctaStyle: 'Action-oriented',
				compatiblePromiseAngles: ['ship-consistently'],
				compatibleProofStrategies: ['ops-metrics'],
				compatibleCreativeBundles: ['product-led-clean'],
			},
		]);
		await writeJson(path.join(factoryDir, 'promise-angles.json'), [
			{
				id: 'ship-consistently',
				label: 'Ship Consistently',
				corePromise: 'Publish reliably without losing the thread',
				headlineDirection: 'Confidence in the editorial cadence',
				supportingMessageThemes: ['Clear ownership'],
				bestFitAudiences: ['agencies'],
				bestFitArchetypes: ['workflow-story'],
			},
		]);
		await writeJson(path.join(factoryDir, 'proof-strategies.json'), [
			{
				id: 'ops-metrics',
				label: 'Ops Metrics',
				proofType: 'Process evidence',
				recommendedProofElements: ['Approval count'],
				proofPlacementGuidance: 'Pair proof with workflow sections',
				bestFitAudiences: ['agencies'],
				bestFitArchetypes: ['workflow-story'],
			},
		]);
		await writeJson(path.join(factoryDir, 'creative-bundles.json'), [
			{
				id: 'product-led-clean',
				label: 'Product-Led Clean',
				heroStyle: 'Centered product focus',
				visualDensity: 'Balanced',
				motionBehavior: 'Subtle, functional motion',
				colorDirection: 'Neutral with a strong accent',
				surfaceTreatment: 'Soft cards and clean panels',
				screenshotTreatment: 'Crisp UI captures with clear focus',
				copyTone: 'Direct and confident',
				compatibilityTags: ['agencies', 'workflow-story'],
				referenceAnchors: ['https://example.com/stripe'],
				inspirationLibraries: ['https://example.com/land-book'],
			},
		]);

		await assert.rejects(
			() => loadHomepageFactoryConfig({ factoryDir }),
			/homepageArchetypes\[0\]\.heroGoal must be a non-empty string/,
		);
	} finally {
		await rm(factoryDir, { recursive: true, force: true });
	}
});

test('validateHomepageFactoryConfig rejects duplicate IDs within a config file', () => {
	const config = structuredClone(TEST_CONFIG);

	config.promiseAngles.push({
		...config.promiseAngles[0],
		label: 'Duplicate Promise Angle',
	});

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/duplicate promiseAngles id "ship-consistently"/,
	);
});

test('validateHomepageFactoryConfig rejects missing homepage archetype scalar fields', () => {
	for (const fieldName of ['heroGoal', 'proofPlacement', 'ctaStyle']) {
		const config = structuredClone(TEST_CONFIG);

		delete config.homepageArchetypes[0][fieldName];

		assert.throws(
			() => validateHomepageFactoryConfig(config),
			new RegExp(
				`homepageArchetypes\\[0\\]\\.${escapeRegExp(fieldName)} must be a non-empty string`,
			),
		);
	}
});

test('validateHomepageFactoryConfig rejects missing promise angle scalar fields', () => {
	for (const fieldName of ['corePromise', 'headlineDirection']) {
		const config = structuredClone(TEST_CONFIG);

		delete config.promiseAngles[0][fieldName];

		assert.throws(
			() => validateHomepageFactoryConfig(config),
			new RegExp(
				`promiseAngles\\[0\\]\\.${escapeRegExp(fieldName)} must be a non-empty string`,
			),
		);
	}
});

test('validateHomepageFactoryConfig rejects missing proof strategy scalar fields', () => {
	for (const fieldName of ['proofType', 'proofPlacementGuidance']) {
		const config = structuredClone(TEST_CONFIG);

		delete config.proofStrategies[0][fieldName];

		assert.throws(
			() => validateHomepageFactoryConfig(config),
			new RegExp(
				`proofStrategies\\[0\\]\\.${escapeRegExp(fieldName)} must be a non-empty string`,
			),
		);
	}
});

test('validateHomepageFactoryConfig rejects missing creative bundle scalar fields', () => {
	for (const fieldName of [
		'heroStyle',
		'visualDensity',
		'motionBehavior',
		'colorDirection',
		'surfaceTreatment',
		'screenshotTreatment',
		'copyTone',
	]) {
		const config = structuredClone(TEST_CONFIG);

		delete config.creativeBundles[0][fieldName];

		assert.throws(
			() => validateHomepageFactoryConfig(config),
			new RegExp(
				`creativeBundles\\[0\\]\\.${escapeRegExp(fieldName)} must be a non-empty string`,
			),
		);
	}
});

test('validateHomepageFactoryConfig rejects broken cross-file compatibility references', () => {
	const config = structuredClone(TEST_CONFIG);

	config.homepageArchetypes[0].compatibleProofStrategies = ['missing-proof'];

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/homepageArchetypes\[0\]\.compatibleProofStrategies\[0\] references unknown proofStrategies id "missing-proof"/,
	);
});

test('validateHomepageFactoryConfig rejects empty prompt-critical audience arrays', () => {
	const config = structuredClone(TEST_CONFIG);

	config.audienceOverlays[0].primaryPains = [];

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/audienceOverlays\[0\]\.primaryPains must contain at least one item/,
	);
});

test('validateHomepageFactoryConfig rejects empty creative reference arrays', () => {
	const config = structuredClone(TEST_CONFIG);

	config.creativeBundles[0].referenceAnchors = [];

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/creativeBundles\[0\]\.referenceAnchors must contain at least one item/,
	);
});

test('validateHomepageFactoryConfig rejects empty creative library arrays', () => {
	const config = structuredClone(TEST_CONFIG);

	config.creativeBundles[0].inspirationLibraries = [];

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/creativeBundles\[0\]\.inspirationLibraries must contain at least one item/,
	);
});

test('validateHomepageFactoryConfig rejects creative bundle tags that reference unknown ids', () => {
	const config = structuredClone(TEST_CONFIG);

	config.creativeBundles[0].compatibilityTags = [
		'agencies',
		'workflow-story',
		'unknown-tag',
	];

	assert.throws(
		() => validateHomepageFactoryConfig(config),
		/creativeBundles\[0\]\.compatibilityTags\[2\] references unknown audience or archetype id "unknown-tag"/,
	);
});

const FACTORY_DIR = path.resolve('scripts/homepage-factory');

test('generated variants use compatible strategy metadata', async () => {
	const outputDir = await createTempOutputDir();

	try {
		const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
		const result = await generateHomepagePromptBatch({
			config,
			outputDir,
			variants: 6,
			seed: 'compatibility-seed',
			buildPrompt: buildHomepagePrompt,
		});

		for (const entry of result.manifest) {
			const archetype = config.homepageArchetypes.find(
				(item) => item.id === entry.homepageArchetype,
			);
			const promiseAngle = config.promiseAngles.find(
				(item) => item.id === entry.promiseAngle,
			);
			const proofStrategy = config.proofStrategies.find(
				(item) => item.id === entry.proofStrategy,
			);
			const creativeBundle = config.creativeBundles.find(
				(item) => item.id === entry.creativeDirectionBundle,
			);

			assert.ok(entry.audienceOverlay);
			assert.ok(archetype.compatiblePromiseAngles.includes(entry.promiseAngle));
			assert.ok(
				archetype.compatibleProofStrategies.includes(entry.proofStrategy),
			);
			assert.ok(
				archetype.compatibleCreativeBundles.includes(
					entry.creativeDirectionBundle,
				),
			);
			assert.ok(promiseAngle.bestFitAudiences.includes(entry.audienceOverlay));
			assert.ok(
				promiseAngle.bestFitArchetypes.includes(entry.homepageArchetype),
			);
			assert.ok(proofStrategy.bestFitAudiences.includes(entry.audienceOverlay));
			assert.ok(
				proofStrategy.bestFitArchetypes.includes(entry.homepageArchetype),
			);
			assert.ok(
				creativeBundle.compatibilityTags.includes(entry.audienceOverlay),
			);
			assert.ok(
				creativeBundle.compatibilityTags.includes(entry.homepageArchetype),
			);
		}
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('generate-homepage-prompts CLI writes prompts using repo-relative paths', async () => {
	const repoRoot = path.resolve('.');
	const outputDir = path.join(
		repoRoot,
		'docs/misc/homepage-factory/generated-prompts',
	);
	const backupDir = path.join(
		os.tmpdir(),
		`homepage-prompts-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	const hadExistingOutput = await pathExists(outputDir);

	try {
		if (hadExistingOutput) {
			await rename(outputDir, backupDir);
		}

		const { stdout } = await execFileAsync(
			process.execPath,
			['scripts/generate-homepage-prompts.mjs', '2', 'cli-seed'],
			{
				cwd: repoRoot,
			},
		);

		assert.match(
			stdout,
			/Generated 2 homepage prompts in docs[\\/]+misc[\\/]+homepage-factory[\\/]+generated-prompts/,
		);
		assert.equal(
			await pathExists(path.join(outputDir, '001-homepage-prompt.md')),
			true,
		);
		assert.equal(await pathExists(path.join(outputDir, 'manifest.json')), true);
	} finally {
		await rm(outputDir, { recursive: true, force: true });

		if (hadExistingOutput) {
			await mkdir(path.dirname(outputDir), { recursive: true });
			await rename(backupDir, outputDir);
		}
	}
});

test('generated prompt uses the strategy-first contract', async () => {
	const outputDir = await createTempOutputDir();

	try {
		const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
		const result = await generateHomepagePromptBatch({
			config,
			outputDir,
			variants: 1,
			seed: 'prompt-contract',
			buildPrompt: buildHomepagePrompt,
		});

		const prompt = result.prompts[0].content;
		const manifestEntry = result.manifest[0];
		const selectedAudience = config.audienceOverlays.find(
			(item) => item.id === manifestEntry.audienceOverlay,
		);
		const selectedArchetype = config.homepageArchetypes.find(
			(item) => item.id === manifestEntry.homepageArchetype,
		);
		const selectedPromiseAngle = config.promiseAngles.find(
			(item) => item.id === manifestEntry.promiseAngle,
		);
		const selectedProofStrategy = config.proofStrategies.find(
			(item) => item.id === manifestEntry.proofStrategy,
		);
		const selectedCreativeBundle = config.creativeBundles.find(
			(item) => item.id === manifestEntry.creativeDirectionBundle,
		);
		const orderedSections = [
			'## Variant Metadata',
			'## System Prompt',
			'## User Prompt',
			'### Product Core',
			'### Audience Overlay',
			'### Archetype Brief',
			'### Creative Direction',
			'### Strategy Inputs',
			'### Design Inspiration Anchors',
			'### Working Order',
			'### Output Contract',
		];

		let previousIndex = -1;

		for (const heading of orderedSections) {
			const currentIndex = prompt.indexOf(heading);
			assert.ok(
				currentIndex > previousIndex,
				`${heading} should appear in order`,
			);
			previousIndex = currentIndex;
		}

		assert.match(prompt, /No vague AI-productivity filler/i);
		assert.match(
			prompt,
			/Build a complete homepage in React \+ TypeScript \+ MUI v6\./i,
		);
		assert.match(prompt, /### Strategy Inputs/);
		assert.match(prompt, /### Design Inspiration Anchors/);
		assert.match(prompt, /1\. Define the homepage concept/);
		assert.match(prompt, /5\. Implement the homepage/);
		assert.match(prompt, /show a believable social publishing workflow/i);
		assert.match(prompt, /- Core differentiators:\n {2}- /);
		assert.match(prompt, /- Primary pains:\n {2}- /);
		assert.match(
			prompt,
			new RegExp(
				`- Summary: ${escapeRegExp(config.productCore.productSummary)}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(`- Audience: ${escapeRegExp(selectedAudience.audienceLabel)}`),
		);
		assert.match(
			prompt,
			new RegExp(`- Seed: \\*\\*${escapeRegExp(manifestEntry.seed)}\\*\\*`),
		);
		assert.match(
			prompt,
			new RegExp(`- Hero goal: ${escapeRegExp(selectedArchetype.heroGoal)}`),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Core promise: ${escapeRegExp(selectedPromiseAngle.corePromise)}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Proof type: ${escapeRegExp(selectedProofStrategy.proofType)}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Hero style: ${escapeRegExp(selectedCreativeBundle.heroStyle)}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(`- ${escapeRegExp(selectedAudience.primaryPains[0])}`),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Proof expectations:\\n {2}- ${escapeRegExp(selectedAudience.proofExpectations[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- CTA preference: ${escapeRegExp(selectedAudience.ctaPreference)}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Product focus areas:\\n {2}- ${escapeRegExp(selectedAudience.productFocusAreas[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- FAQ concerns:\\n {2}- ${escapeRegExp(selectedAudience.faqConcerns[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Preferred tone adjustments:\\n {2}- ${escapeRegExp(selectedAudience.preferredToneAdjustments[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(`- ${escapeRegExp(selectedArchetype.narrativeOrder[0])}`),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Required sections:\\n {2}- ${escapeRegExp(selectedArchetype.requiredSections[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- Optional sections:\\n {2}- ${escapeRegExp(selectedArchetype.optionalSections[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- ${escapeRegExp(selectedPromiseAngle.supportingMessageThemes[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(
				`- ${escapeRegExp(selectedProofStrategy.recommendedProofElements[0])}`,
			),
		);
		assert.match(
			prompt,
			new RegExp(`- ${escapeRegExp(manifestEntry.selectedReferences[0])}`),
		);
		assert.match(
			prompt,
			new RegExp(`- ${escapeRegExp(manifestEntry.selectedLibraries[0])}`),
		);
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
});
