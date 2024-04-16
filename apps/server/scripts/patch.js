/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
import replace from 'replace-in-file';

console.log('==================> postInstall <=================');

const path = require('path');

const patchParseServerSelectNestedObjectKeys = async () => {
	const filePath1 = path.resolve(import.meta.dir, '../node_modules/parse-server/lib/RestQuery.js');
	const filePath2 = path.resolve(import.meta.dir, '../../../node_modules/parse-server/lib/RestQuery.js');

	const exists1 = Bun.file(filePath1).exists();

	// const results =
	replace({
		disableGlobs: true,
		files: (await exists1) ? filePath1 : filePath2,
		from: /return key.split\('.'\)\[0\];/g,
		to: 'return key;',
	});
};

patchParseServerSelectNestedObjectKeys();
