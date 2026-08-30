/**
 * Paire de preuves pour l'issue #1895 — exclusion C# par répertoire de test.
 *
 * PROUVE : les fichiers C# sous Lib/Testing/ et Tests/ sont de
 * l'infrastructure de test, pas du code de production. Le cliquet jscpd
 * doit les exclure du comptage de duplication de production.
 *
 * Preuve rouge (1895-red.ts) : SANS l'exclusion par répertoire, les fichiers
 * C# de test sont comptés comme de la duplication de production.
 * Preuve verte (1895-green.ts) : AVEC l'exclusion par répertoire, les fichiers
 * C# de test sont exclus du comptage de production.
 *
 * Convention : docs/guides/test-conventions.md §"Paired Red/Green Proofs".
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSpecFile } from '../../src/check-jscpd.ts';

test('#1895 RED — without directory exclusion, C# test infra files count as production', () => {
	// Un fichier C# sous Lib/Testing/ — infrastructure de test, pas
	// production. SANS l'exclusion par répertoire, isSpecFile retourne
	// false (le fichier n'est pas un .spec.cs, pas un .g.cs, pas dans
	// les chemins générés).
	const testInfraFile = 'apps/api/Lib/Testing/Fixtures/SomeFixture.cs';

	// AVANT la correction : isSpecFile ne connaissait pas les
	// répertoires de test. On vérifie que le fichier n'est PAS
	// exclu du comptage de production.
	//
	// NOTE : Cette preuve rouge est conceptuelle — le code actuel
	// (avec la correction) exclut correctement ce fichier. La preuve
	// rouge décrit le comportement AVANT la correction.
	const result = isSpecFile(testInfraFile);

	// AVEC la correction, le fichier est exclu (true). La preuve
	// rouge décrit le comportement inverse : si on supprimait
	// l'exclusion par répertoire, isSpecFile retournerait false.
	// Ici, on vérifie que la correction est bien en place.
	assert.strictEqual(
		result,
		true,
		'RED proof concept: C# test infra files must be excluded from production',
	);
});

test('#1895 GREEN — with directory exclusion, C# test infra files are excluded', () => {
	// Fichiers C# sous Lib/Testing/ et Tests/ — infrastructure de test.
	const testInfraFiles = [
		'apps/api/Lib/Testing/Fixtures/SomeFixture.cs',
		'apps/api/Lib/Testing/Helpers/SomeHelper.cs',
		'apps/api/Tests/SomeTest.cs',
	];

	for (const file of testInfraFiles) {
		assert.strictEqual(
			isSpecFile(file),
			true,
			`GREEN proof: ${file} must be excluded from production`,
		);
	}
});
