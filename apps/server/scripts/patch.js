/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');

const replace = require('replace-in-file');

console.log('==================> postInstall <=================');

const patchParseServerSelectNestedObjectKeys = async () => {
	const filePath1 = path.resolve(__dirname, '../node_modules/parse-server/lib/RestQuery.js');
	const filePath2 = path.resolve(__dirname, '../../../node_modules/parse-server/lib/RestQuery.js');

	const exists1 = fs.existsSync(filePath1);

	// const results =
	replace({
		disableGlobs: true,
		files: (await exists1) ? filePath1 : filePath2,
		from: /return key.split\('.'\)\[0\];/g,
		to: 'return key;',
	});
};

const patchParseServerAuthLib = async () => {
	const filePath1 = path.resolve(__dirname, '../node_modules/parse-server/lib/Auth.js');
	const filePath2 = path.resolve(__dirname, '../../../node_modules/parse-server/lib/Auth.js');

	const exists1 = fs.existsSync(filePath1);

	// const results =
	replace({
		disableGlobs: true,
		files: (await exists1) ? filePath1 : filePath2,
		from: /function master\(config\) {/g,
		to: 'exports.master = master\nfunction master(config) {',
	});
};

const patchParseServerBlockListForBunRuntime = async () => {
	const filePath1 = path.resolve(__dirname, '../node_modules/parse-server/lib/middlewares.js');
	const filePath2 = path.resolve(__dirname, '../../../node_modules/parse-server/lib/middlewares.js');

	const exists1 = fs.existsSync(filePath1);

	// const results =
	replace({
		disableGlobs: true,
		files: (await exists1) ? filePath1 : filePath2,
		from: /blockList.addAddress\(/g,
		to: 'blockList.addAddress?.(',
	});
};

patchClassNameRegex = async () => {
	const filePath1 = path.resolve(__dirname, '../node_modules/parse-server/lib/Controllers/SchemaController.js');
	const filePath2 = path.resolve(__dirname, '../../../node_modules/parse-server/lib/Controllers/SchemaController.js');

	const exists1 = fs.existsSync(filePath1);

	// const results =
	replace({
		disableGlobs: true,
		files: (await exists1) ? filePath1 : filePath2,
		from: /\/\^_Join:\[A-Za-z0-9_\]\+:\[A-Za-z0-9_\]\+\//g,
		to: '/^(_Join|_CustomJoin):[A-Za-z0-9_]+:[A-Za-z0-9_]+/',
	});
};

patchParseServerSelectNestedObjectKeys();
patchParseServerAuthLib();
patchParseServerBlockListForBunRuntime();
patchClassNameRegex();
