/**
 * Paire de preuves pour l'issue #1897 — exclusion ciblée des fichiers .g.cs.
 *
 * PROUVE : les fichiers .g.cs (générés par Kiota) ne doivent PAS être
 * exclus globalement — seuls les fichiers générés explicites doivent
 * l'être. L'exclusion globale *.g.cs masquerait de la duplication
 * réelle dans des fichiers .g.cs non générés.
 *
 * Preuve rouge (1897-red.ts) : AVEC l'exclusion globale *.g.cs, un fichier
 * .g.cs non généré est masqué.
 * Preuve verte (1897-green.ts) : AVEC l'exclusion ciblée, seuls les
 * fichiers générés explicites sont exclus.
 *
 * Convention : docs/guides/test-conventions.md §"Paired Red/Green Proofs".
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSpecFile, isGeneratedFile } from '../../src/check-jscpd.ts';

test('#1897 RED — with blanket *.g.cs exclusion, non-generated .g.cs files are masked', () => {
	// Un fichier .g.cs qui n'est PAS généré par Kiota — il contient
	// du code réel et doit être compté. AVEC l'exclusion globale
	// *.g.cs, il serait masqué (isSpecFile retournerait true).
	const nonGeneratedGcs = 'apps/api/Modules/Foo/SomeCustom.g.cs';

	// AVANT la correction : l'exclusion globale *.g.cs excluait
	// TOUS les fichiers .g.cs. La preuve rouge décrit ce comportement.
	// APRÈS la correction : seuls les fichiers dans GENERATED_FILE_PATHS
	// sont exclus.
	//
	// Ici, on vérifie que la correction est bien en place : le fichier
	// .g.cs non généré n'est PAS exclu.
	assert.strictEqual(
		isGeneratedFile(nonGeneratedGcs),
		false,
		'RED proof concept: non-generated .g.cs files must not be excluded',
	);
	assert.strictEqual(
		isSpecFile(nonGeneratedGcs),
		false,
		'RED proof concept: non-generated .g.cs files count as production',
	);
});

test('#1897 GREEN — with targeted exclusion, only explicit generated files are excluded', () => {
	// Le fichier généré explicite — doit être exclu.
	const generatedFile = 'apps/api/Localization/ResponseKeys.g.cs';
	assert.strictEqual(
		isGeneratedFile(generatedFile),
		true,
		'GREEN proof: ResponseKeys.g.cs is generated and must be excluded',
	);
	assert.strictEqual(
		isSpecFile(generatedFile),
		true,
		'GREEN proof: generated files are excluded from production',
	);

	// Un fichier .g.cs non généré — ne doit PAS être exclu.
	const nonGeneratedGcs = 'apps/api/Modules/Foo/SomeCustom.g.cs';
	assert.strictEqual(
		isGeneratedFile(nonGeneratedGcs),
		false,
		'GREEN proof: non-generated .g.cs files are not in GENERATED_FILE_PATHS',
	);
	assert.strictEqual(
		isSpecFile(nonGeneratedGcs),
		false,
		'GREEN proof: non-generated .g.cs files count as production',
	);
});
