import type { ComponentType } from 'react';

import manifest from './manifest.json';
import { findGeneratedHomepageManifestEntry } from './manifest-utils.js';

export type GeneratedHomepageManifestEntry = {
	id: number;
	title: string;
	fileName: string;
	routePath: string;
	batchLabel: string | null;
	createdAt: string;
};

type GeneratedHomepageModule = {
	default: ComponentType;
};

const generatedHomepageModules = import.meta.glob<GeneratedHomepageModule>(
	'./pages/*.tsx',
	{ eager: true },
);

export const generatedHomepageManifest =
	manifest as GeneratedHomepageManifestEntry[];

export const getGeneratedHomepageById = (
	generatedHomepageId: number | string | null | undefined,
) => {
	const entry = findGeneratedHomepageManifestEntry(
		generatedHomepageManifest,
		generatedHomepageId,
	);

	if (entry === null) {
		return null;
	}

	const moduleKey = `./pages/${entry.fileName}`;
	const generatedHomepageModule = generatedHomepageModules[moduleKey];

	if (generatedHomepageModule === undefined) {
		return null;
	}

	return {
		entry,
		Component: generatedHomepageModule.default,
	};
};
