import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const mulberry32 = (seed) => {
	let state = seed;

	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

export const hashSeed = (input) => {
	let hash = 1779033703 ^ input.length;

	for (let index = 0; index < input.length; index += 1) {
		hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
		hash = (hash << 13) | (hash >>> 19);
	}

	return hash >>> 0;
};

const getRecipeKey = ({
	audienceOverlay,
	homepageArchetype,
	promiseAngle,
	proofStrategy,
	creativeBundle,
}) => {
	return [
		audienceOverlay.id,
		homepageArchetype.id,
		promiseAngle.id,
		proofStrategy.id,
		creativeBundle.id,
	].join('|');
};

const isCompatibleRecipe = (
	audienceOverlay,
	homepageArchetype,
	promiseAngle,
	proofStrategy,
	creativeBundle,
) => {
	return (
		homepageArchetype.compatiblePromiseAngles.includes(promiseAngle.id) &&
		homepageArchetype.compatibleProofStrategies.includes(proofStrategy.id) &&
		homepageArchetype.compatibleCreativeBundles.includes(creativeBundle.id) &&
		promiseAngle.bestFitAudiences.includes(audienceOverlay.id) &&
		promiseAngle.bestFitArchetypes.includes(homepageArchetype.id) &&
		proofStrategy.bestFitAudiences.includes(audienceOverlay.id) &&
		proofStrategy.bestFitArchetypes.includes(homepageArchetype.id) &&
		creativeBundle.compatibilityTags.includes(audienceOverlay.id) &&
		creativeBundle.compatibilityTags.includes(homepageArchetype.id)
	);
};

const collectCompatibleRecipes = (config) => {
	const recipes = [];

	for (const audienceOverlay of config.audienceOverlays) {
		for (const homepageArchetype of config.homepageArchetypes) {
			for (const promiseAngle of config.promiseAngles) {
				for (const proofStrategy of config.proofStrategies) {
					for (const creativeBundle of config.creativeBundles) {
						if (
							isCompatibleRecipe(
								audienceOverlay,
								homepageArchetype,
								promiseAngle,
								proofStrategy,
								creativeBundle,
							)
						) {
							recipes.push({
								audienceOverlay,
								homepageArchetype,
								promiseAngle,
								proofStrategy,
								creativeBundle,
							});
						}
					}
				}
			}
		}
	}

	return recipes;
};

const sortRecipesBySeed = (recipes, seed) => {
	return recipes
		.map((recipe) => {
			return {
				recipe,
				weight: mulberry32(hashSeed(`${seed}-${getRecipeKey(recipe)}`))(),
			};
		})
		.sort((left, right) => {
			if (left.weight !== right.weight) {
				return left.weight - right.weight;
			}

			return getRecipeKey(left.recipe).localeCompare(
				getRecipeKey(right.recipe),
			);
		})
		.map(({ recipe }) => {
			return recipe;
		});
};

export const readJson = async (filePath) => {
	const raw = await readFile(filePath, 'utf8');

	return JSON.parse(raw);
};

const assertObject = (value, label) => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
};

const assertString = (value, label) => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}
};

const assertStringArray = (value, label) => {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}

	for (const [index, item] of value.entries()) {
		assertString(item, `${label}[${index}]`);
	}
};

const assertNonEmptyStringArray = (value, label) => {
	assertStringArray(value, label);

	if (value.length === 0) {
		throw new Error(`${label} must contain at least one item`);
	}
};

const assertObjectArray = (value, label) => {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}

	for (const [index, item] of value.entries()) {
		assertObject(item, `${label}[${index}]`);
	}
};

const assertUniqueIds = (items, label) => {
	const seenIds = new Set();

	for (const item of items) {
		if (seenIds.has(item.id)) {
			throw new Error(`duplicate ${label} id "${item.id}"`);
		}

		seenIds.add(item.id);
	}
};

const assertKnownReference = (value, validIds, label, targetLabel) => {
	if (!validIds.has(value)) {
		throw new Error(`${label} references unknown ${targetLabel} id "${value}"`);
	}
};

const assertVariantCount = (variants) => {
	if (!Number.isInteger(variants) || variants <= 0 || variants > 200) {
		throw new Error('Variants must be an integer between 1 and 200.');
	}
};

const validateHomepagePromptInputs = ({
	seed,
	productCore,
	audienceOverlay,
	homepageArchetype,
	promiseAngle,
	proofStrategy,
	creativeBundle,
	selectedReferences,
	selectedLibraries,
}) => {
	assertString(seed, 'seed');
	assertObject(productCore, 'productCore');
	assertString(productCore.productName, 'productCore.productName');
	assertString(productCore.productSummary, 'productCore.productSummary');
	assertNonEmptyStringArray(
		productCore.coreDifferentiators,
		'productCore.coreDifferentiators',
	);
	assertNonEmptyStringArray(
		productCore.workflowStrengths,
		'productCore.workflowStrengths',
	);
	assertNonEmptyStringArray(
		productCore.trustSignals,
		'productCore.trustSignals',
	);
	assertNonEmptyStringArray(
		productCore.productVisualRequirements,
		'productCore.productVisualRequirements',
	);
	assertNonEmptyStringArray(
		productCore.forbiddenClaims,
		'productCore.forbiddenClaims',
	);
	assertNonEmptyStringArray(
		productCore.forbiddenCopyPatterns,
		'productCore.forbiddenCopyPatterns',
	);

	assertObject(audienceOverlay, 'audienceOverlay');
	assertString(audienceOverlay.audienceLabel, 'audienceOverlay.audienceLabel');
	assertNonEmptyStringArray(
		audienceOverlay.primaryPains,
		'audienceOverlay.primaryPains',
	);
	assertNonEmptyStringArray(
		audienceOverlay.desiredOutcomes,
		'audienceOverlay.desiredOutcomes',
	);
	assertNonEmptyStringArray(
		audienceOverlay.topObjections,
		'audienceOverlay.topObjections',
	);
	assertNonEmptyStringArray(
		audienceOverlay.decisionCriteria,
		'audienceOverlay.decisionCriteria',
	);
	assertNonEmptyStringArray(
		audienceOverlay.proofExpectations,
		'audienceOverlay.proofExpectations',
	);
	assertString(audienceOverlay.ctaPreference, 'audienceOverlay.ctaPreference');
	assertNonEmptyStringArray(
		audienceOverlay.productFocusAreas,
		'audienceOverlay.productFocusAreas',
	);
	assertNonEmptyStringArray(
		audienceOverlay.faqConcerns,
		'audienceOverlay.faqConcerns',
	);
	assertNonEmptyStringArray(
		audienceOverlay.preferredToneAdjustments,
		'audienceOverlay.preferredToneAdjustments',
	);

	assertObject(homepageArchetype, 'homepageArchetype');
	assertString(homepageArchetype.label, 'homepageArchetype.label');
	assertString(homepageArchetype.heroGoal, 'homepageArchetype.heroGoal');
	assertNonEmptyStringArray(
		homepageArchetype.narrativeOrder,
		'homepageArchetype.narrativeOrder',
	);
	assertString(
		homepageArchetype.proofPlacement,
		'homepageArchetype.proofPlacement',
	);
	assertString(homepageArchetype.ctaStyle, 'homepageArchetype.ctaStyle');
	assertNonEmptyStringArray(
		homepageArchetype.requiredSections,
		'homepageArchetype.requiredSections',
	);
	assertNonEmptyStringArray(
		homepageArchetype.optionalSections,
		'homepageArchetype.optionalSections',
	);

	assertObject(promiseAngle, 'promiseAngle');
	assertString(promiseAngle.label, 'promiseAngle.label');
	assertString(promiseAngle.corePromise, 'promiseAngle.corePromise');
	assertString(
		promiseAngle.headlineDirection,
		'promiseAngle.headlineDirection',
	);
	assertNonEmptyStringArray(
		promiseAngle.supportingMessageThemes,
		'promiseAngle.supportingMessageThemes',
	);

	assertObject(proofStrategy, 'proofStrategy');
	assertString(proofStrategy.label, 'proofStrategy.label');
	assertString(proofStrategy.proofType, 'proofStrategy.proofType');
	assertNonEmptyStringArray(
		proofStrategy.recommendedProofElements,
		'proofStrategy.recommendedProofElements',
	);
	assertString(
		proofStrategy.proofPlacementGuidance,
		'proofStrategy.proofPlacementGuidance',
	);

	assertObject(creativeBundle, 'creativeBundle');
	assertString(creativeBundle.label, 'creativeBundle.label');
	assertString(creativeBundle.heroStyle, 'creativeBundle.heroStyle');
	assertString(creativeBundle.visualDensity, 'creativeBundle.visualDensity');
	assertString(creativeBundle.motionBehavior, 'creativeBundle.motionBehavior');
	assertString(creativeBundle.colorDirection, 'creativeBundle.colorDirection');
	assertString(
		creativeBundle.surfaceTreatment,
		'creativeBundle.surfaceTreatment',
	);
	assertString(
		creativeBundle.screenshotTreatment,
		'creativeBundle.screenshotTreatment',
	);
	assertString(creativeBundle.copyTone, 'creativeBundle.copyTone');

	assertNonEmptyStringArray(selectedReferences, 'selectedReferences');
	assertNonEmptyStringArray(selectedLibraries, 'selectedLibraries');
};

export const validateHomepageFactoryConfig = (config) => {
	assertObject(config, 'config');
	assertObject(config.productCore, 'productCore');
	assertString(config.productCore.productName, 'productCore.productName');
	assertString(config.productCore.productSummary, 'productCore.productSummary');
	assertNonEmptyStringArray(
		config.productCore.coreDifferentiators,
		'productCore.coreDifferentiators',
	);
	assertNonEmptyStringArray(
		config.productCore.workflowStrengths,
		'productCore.workflowStrengths',
	);
	assertNonEmptyStringArray(
		config.productCore.trustSignals,
		'productCore.trustSignals',
	);
	assertNonEmptyStringArray(
		config.productCore.productVisualRequirements,
		'productCore.productVisualRequirements',
	);
	assertNonEmptyStringArray(
		config.productCore.forbiddenClaims,
		'productCore.forbiddenClaims',
	);
	assertNonEmptyStringArray(
		config.productCore.forbiddenCopyPatterns,
		'productCore.forbiddenCopyPatterns',
	);

	assertObjectArray(config.audienceOverlays, 'audienceOverlays');
	if (config.audienceOverlays.length === 0) {
		throw new Error('audienceOverlays must contain at least one item');
	}
	assertUniqueIds(config.audienceOverlays, 'audienceOverlays');
	for (const [index, item] of config.audienceOverlays.entries()) {
		assertString(item.id, `audienceOverlays[${index}].id`);
		assertString(
			item.audienceLabel,
			`audienceOverlays[${index}].audienceLabel`,
		);
		assertNonEmptyStringArray(
			item.primaryPains,
			`audienceOverlays[${index}].primaryPains`,
		);
		assertNonEmptyStringArray(
			item.desiredOutcomes,
			`audienceOverlays[${index}].desiredOutcomes`,
		);
		assertNonEmptyStringArray(
			item.topObjections,
			`audienceOverlays[${index}].topObjections`,
		);
		assertNonEmptyStringArray(
			item.decisionCriteria,
			`audienceOverlays[${index}].decisionCriteria`,
		);
		assertNonEmptyStringArray(
			item.proofExpectations,
			`audienceOverlays[${index}].proofExpectations`,
		);
		assertString(
			item.ctaPreference,
			`audienceOverlays[${index}].ctaPreference`,
		);
		assertNonEmptyStringArray(
			item.productFocusAreas,
			`audienceOverlays[${index}].productFocusAreas`,
		);
		assertNonEmptyStringArray(
			item.faqConcerns,
			`audienceOverlays[${index}].faqConcerns`,
		);
		assertNonEmptyStringArray(
			item.preferredToneAdjustments,
			`audienceOverlays[${index}].preferredToneAdjustments`,
		);
	}

	assertObjectArray(config.homepageArchetypes, 'homepageArchetypes');
	if (config.homepageArchetypes.length === 0) {
		throw new Error('homepageArchetypes must contain at least one item');
	}
	assertUniqueIds(config.homepageArchetypes, 'homepageArchetypes');
	for (const [index, item] of config.homepageArchetypes.entries()) {
		assertString(item.id, `homepageArchetypes[${index}].id`);
		assertString(item.label, `homepageArchetypes[${index}].label`);
		assertString(item.heroGoal, `homepageArchetypes[${index}].heroGoal`);
		assertNonEmptyStringArray(
			item.narrativeOrder,
			`homepageArchetypes[${index}].narrativeOrder`,
		);
		assertString(
			item.proofPlacement,
			`homepageArchetypes[${index}].proofPlacement`,
		);
		assertString(item.ctaStyle, `homepageArchetypes[${index}].ctaStyle`);
		assertNonEmptyStringArray(
			item.requiredSections,
			`homepageArchetypes[${index}].requiredSections`,
		);
		assertNonEmptyStringArray(
			item.optionalSections,
			`homepageArchetypes[${index}].optionalSections`,
		);
		assertNonEmptyStringArray(
			item.compatiblePromiseAngles,
			`homepageArchetypes[${index}].compatiblePromiseAngles`,
		);
		assertNonEmptyStringArray(
			item.compatibleProofStrategies,
			`homepageArchetypes[${index}].compatibleProofStrategies`,
		);
		assertNonEmptyStringArray(
			item.compatibleCreativeBundles,
			`homepageArchetypes[${index}].compatibleCreativeBundles`,
		);
	}

	assertObjectArray(config.promiseAngles, 'promiseAngles');
	if (config.promiseAngles.length === 0) {
		throw new Error('promiseAngles must contain at least one item');
	}
	assertUniqueIds(config.promiseAngles, 'promiseAngles');
	for (const [index, item] of config.promiseAngles.entries()) {
		assertString(item.id, `promiseAngles[${index}].id`);
		assertString(item.label, `promiseAngles[${index}].label`);
		assertString(item.corePromise, `promiseAngles[${index}].corePromise`);
		assertString(
			item.headlineDirection,
			`promiseAngles[${index}].headlineDirection`,
		);
		assertNonEmptyStringArray(
			item.supportingMessageThemes,
			`promiseAngles[${index}].supportingMessageThemes`,
		);
		assertNonEmptyStringArray(
			item.bestFitAudiences,
			`promiseAngles[${index}].bestFitAudiences`,
		);
		assertNonEmptyStringArray(
			item.bestFitArchetypes,
			`promiseAngles[${index}].bestFitArchetypes`,
		);
	}

	assertObjectArray(config.proofStrategies, 'proofStrategies');
	if (config.proofStrategies.length === 0) {
		throw new Error('proofStrategies must contain at least one item');
	}
	assertUniqueIds(config.proofStrategies, 'proofStrategies');
	for (const [index, item] of config.proofStrategies.entries()) {
		assertString(item.id, `proofStrategies[${index}].id`);
		assertString(item.label, `proofStrategies[${index}].label`);
		assertString(item.proofType, `proofStrategies[${index}].proofType`);
		assertString(
			item.proofPlacementGuidance,
			`proofStrategies[${index}].proofPlacementGuidance`,
		);
		assertNonEmptyStringArray(
			item.recommendedProofElements,
			`proofStrategies[${index}].recommendedProofElements`,
		);
		assertNonEmptyStringArray(
			item.bestFitAudiences,
			`proofStrategies[${index}].bestFitAudiences`,
		);
		assertNonEmptyStringArray(
			item.bestFitArchetypes,
			`proofStrategies[${index}].bestFitArchetypes`,
		);
	}

	assertObjectArray(config.creativeBundles, 'creativeBundles');
	if (config.creativeBundles.length === 0) {
		throw new Error('creativeBundles must contain at least one item');
	}
	assertUniqueIds(config.creativeBundles, 'creativeBundles');
	for (const [index, item] of config.creativeBundles.entries()) {
		assertString(item.id, `creativeBundles[${index}].id`);
		assertString(item.label, `creativeBundles[${index}].label`);
		assertString(item.heroStyle, `creativeBundles[${index}].heroStyle`);
		assertString(item.visualDensity, `creativeBundles[${index}].visualDensity`);
		assertString(
			item.motionBehavior,
			`creativeBundles[${index}].motionBehavior`,
		);
		assertString(
			item.colorDirection,
			`creativeBundles[${index}].colorDirection`,
		);
		assertString(
			item.surfaceTreatment,
			`creativeBundles[${index}].surfaceTreatment`,
		);
		assertString(
			item.screenshotTreatment,
			`creativeBundles[${index}].screenshotTreatment`,
		);
		assertString(item.copyTone, `creativeBundles[${index}].copyTone`);
		assertNonEmptyStringArray(
			item.compatibilityTags,
			`creativeBundles[${index}].compatibilityTags`,
		);
		assertNonEmptyStringArray(
			item.referenceAnchors,
			`creativeBundles[${index}].referenceAnchors`,
		);
		assertNonEmptyStringArray(
			item.inspirationLibraries,
			`creativeBundles[${index}].inspirationLibraries`,
		);
	}

	const audienceIds = new Set(
		config.audienceOverlays.map((audienceOverlay) => audienceOverlay.id),
	);
	const archetypeIds = new Set(
		config.homepageArchetypes.map((homepageArchetype) => homepageArchetype.id),
	);
	const promiseAngleIds = new Set(
		config.promiseAngles.map((promiseAngle) => promiseAngle.id),
	);
	const proofStrategyIds = new Set(
		config.proofStrategies.map((proofStrategy) => proofStrategy.id),
	);
	const creativeBundleIds = new Set(
		config.creativeBundles.map((creativeBundle) => creativeBundle.id),
	);
	const compatibilityTagIds = new Set([...audienceIds, ...archetypeIds]);

	for (const [index, item] of config.homepageArchetypes.entries()) {
		for (const [
			referenceIndex,
			value,
		] of item.compatiblePromiseAngles.entries()) {
			assertKnownReference(
				value,
				promiseAngleIds,
				`homepageArchetypes[${index}].compatiblePromiseAngles[${referenceIndex}]`,
				'promiseAngles',
			);
		}

		for (const [
			referenceIndex,
			value,
		] of item.compatibleProofStrategies.entries()) {
			assertKnownReference(
				value,
				proofStrategyIds,
				`homepageArchetypes[${index}].compatibleProofStrategies[${referenceIndex}]`,
				'proofStrategies',
			);
		}

		for (const [
			referenceIndex,
			value,
		] of item.compatibleCreativeBundles.entries()) {
			assertKnownReference(
				value,
				creativeBundleIds,
				`homepageArchetypes[${index}].compatibleCreativeBundles[${referenceIndex}]`,
				'creativeBundles',
			);
		}
	}

	for (const [index, item] of config.promiseAngles.entries()) {
		for (const [referenceIndex, value] of item.bestFitAudiences.entries()) {
			assertKnownReference(
				value,
				audienceIds,
				`promiseAngles[${index}].bestFitAudiences[${referenceIndex}]`,
				'audienceOverlays',
			);
		}

		for (const [referenceIndex, value] of item.bestFitArchetypes.entries()) {
			assertKnownReference(
				value,
				archetypeIds,
				`promiseAngles[${index}].bestFitArchetypes[${referenceIndex}]`,
				'homepageArchetypes',
			);
		}
	}

	for (const [index, item] of config.proofStrategies.entries()) {
		for (const [referenceIndex, value] of item.bestFitAudiences.entries()) {
			assertKnownReference(
				value,
				audienceIds,
				`proofStrategies[${index}].bestFitAudiences[${referenceIndex}]`,
				'audienceOverlays',
			);
		}

		for (const [referenceIndex, value] of item.bestFitArchetypes.entries()) {
			assertKnownReference(
				value,
				archetypeIds,
				`proofStrategies[${index}].bestFitArchetypes[${referenceIndex}]`,
				'homepageArchetypes',
			);
		}
	}

	for (const [index, item] of config.creativeBundles.entries()) {
		for (const [referenceIndex, value] of item.compatibilityTags.entries()) {
			assertKnownReference(
				value,
				compatibilityTagIds,
				`creativeBundles[${index}].compatibilityTags[${referenceIndex}]`,
				'audience or archetype',
			);
		}
	}
};

export const loadHomepageFactoryConfig = async ({ factoryDir }) => {
	const config = {
		productCore: await readJson(path.join(factoryDir, 'product-core.json')),
		audienceOverlays: await readJson(
			path.join(factoryDir, 'audience-overlays.json'),
		),
		homepageArchetypes: await readJson(
			path.join(factoryDir, 'homepage-archetypes.json'),
		),
		promiseAngles: await readJson(path.join(factoryDir, 'promise-angles.json')),
		proofStrategies: await readJson(
			path.join(factoryDir, 'proof-strategies.json'),
		),
		creativeBundles: await readJson(
			path.join(factoryDir, 'creative-bundles.json'),
		),
	};

	validateHomepageFactoryConfig(config);

	return config;
};

const defaultFileOps = {
	access,
	mkdir,
	mkdtemp,
	rename,
	rm,
	writeFile,
};

const pathExists = async (targetPath, fileOps) => {
	try {
		await fileOps.access(targetPath);

		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
};

const createTempSiblingPath = (targetPath, suffix) => {
	const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

	return `${targetPath}.${suffix}-${uniqueId}`;
};

const publishGeneratedBatch = async ({
	outputDir,
	prompts,
	manifest,
	fileOps,
}) => {
	const outputParentDir = path.dirname(outputDir);

	await fileOps.mkdir(outputParentDir, { recursive: true });

	let stagingDir = await fileOps.mkdtemp(
		path.join(outputParentDir, '.homepage-factory-stage-'),
	);
	let backupDir = null;
	let existingOutputMoved = false;
	let published = false;
	let preserveBackupDir = false;

	try {
		for (const prompt of prompts) {
			await fileOps.writeFile(
				path.join(stagingDir, prompt.fileName),
				prompt.content,
				'utf8',
			);
		}

		await fileOps.writeFile(
			path.join(stagingDir, 'manifest.json'),
			JSON.stringify(manifest, null, 2),
			'utf8',
		);

		if (await pathExists(outputDir, fileOps)) {
			backupDir = createTempSiblingPath(outputDir, 'backup');
			await fileOps.rename(outputDir, backupDir);
			existingOutputMoved = true;
		}

		await fileOps.rename(stagingDir, outputDir);
		stagingDir = null;
		published = true;

		if (backupDir !== null) {
			await fileOps.rm(backupDir, { recursive: true, force: true });
			backupDir = null;
		}
	} catch (error) {
		if (!published && existingOutputMoved && backupDir !== null) {
			try {
				if (await pathExists(outputDir, fileOps)) {
					await fileOps.rm(outputDir, { recursive: true, force: true });
				}

				await fileOps.rename(backupDir, outputDir);
				backupDir = null;
			} catch {
				preserveBackupDir = true;
			}
		}

		throw error;
	} finally {
		if (stagingDir !== null) {
			await fileOps.rm(stagingDir, { recursive: true, force: true });
		}

		if (backupDir !== null && !preserveBackupDir) {
			await fileOps.rm(backupDir, { recursive: true, force: true });
		}
	}
};

export const generateHomepagePromptBatch = async ({
	config,
	outputDir,
	variants,
	seed,
	buildPrompt,
	fileOps,
}) => {
	if (typeof buildPrompt !== 'function') {
		throw new Error(
			'generateHomepagePromptBatch requires a buildPrompt function.',
		);
	}
	const resolvedFileOps = {
		...defaultFileOps,
		...fileOps,
	};

	const { manifest, prompts } = buildHomepagePromptBatchArtifacts({
		config,
		variants,
		seed,
		buildPrompt,
	});

	await publishGeneratedBatch({
		outputDir,
		prompts,
		manifest,
		fileOps: resolvedFileOps,
	});

	return { manifest, prompts };
};

export const buildHomepagePromptBatchArtifacts = ({
	config,
	variants,
	seed,
	buildPrompt,
}) => {
	if (typeof buildPrompt !== 'function') {
		throw new Error(
			'buildHomepagePromptBatchArtifacts requires a buildPrompt function.',
		);
	}
	assertVariantCount(variants);
	validateHomepageFactoryConfig(config);

	const orderedRecipes = sortRecipesBySeed(
		collectCompatibleRecipes(config),
		seed,
	);

	if (orderedRecipes.length === 0) {
		throw new Error(
			'No compatible homepage recipes available for the selected config.',
		);
	}

	const manifest = [];
	const prompts = [];

	for (let variant = 1; variant <= variants; variant += 1) {
		const {
			audienceOverlay,
			homepageArchetype,
			promiseAngle,
			proofStrategy,
			creativeBundle,
		} = orderedRecipes[(variant - 1) % orderedRecipes.length];
		const selectedReferences = creativeBundle.referenceAnchors.slice(0, 4);
		const selectedLibraries = creativeBundle.inspirationLibraries.slice(0, 2);
		validateHomepagePromptInputs({
			seed,
			productCore: config.productCore,
			audienceOverlay,
			homepageArchetype,
			promiseAngle,
			proofStrategy,
			creativeBundle,
			selectedReferences,
			selectedLibraries,
		});
		const content = buildPrompt({
			variant,
			seed,
			productCore: config.productCore,
			audienceOverlay,
			homepageArchetype,
			promiseAngle,
			proofStrategy,
			creativeBundle,
			selectedReferences,
			selectedLibraries,
		});
		const fileName = `${String(variant).padStart(3, '0')}-homepage-prompt.md`;

		const manifestEntry = {
			variant,
			fileName,
			seed,
			audienceOverlay: audienceOverlay.id,
			homepageArchetype: homepageArchetype.id,
			promiseAngle: promiseAngle.id,
			proofStrategy: proofStrategy.id,
			creativeDirectionBundle: creativeBundle.id,
			selectedReferences,
			selectedLibraries,
		};

		manifest.push(manifestEntry);
		prompts.push({ fileName, content });
	}

	return { manifest, prompts };
};
