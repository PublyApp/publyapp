import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import _ from 'lodash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supportedLanguages = ['en', 'fr'];

for (const language of supportedLanguages) {
	const zod = await import(`zod-i18n-map/locales/${language}/zod.json`, {
		with: { type: 'json' },
	});
	const zodData = zod.default;
	_.set(
		zodData,
		'errors.invalid_type_with_path',
		'{{path}} is expected {{expected}}, received {{received}}',
	);

	const outputPath = path.join(
		__dirname,
		`../lib/i18n/json/zod.${language}.json`,
	);
	fs.writeFileSync(outputPath, JSON.stringify(zodData, null, '\t'));
}
