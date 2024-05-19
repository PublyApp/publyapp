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

// const patchParseServerMongoSchemaCollection = async () => {
// 	const filePath1 = path.resolve(
// 		__dirname,
// 		'../node_modules/parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js',
// 	);
// 	const filePath2 = path.resolve(
// 		__dirname,
// 		'../../../node_modules/parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js',
// 	);

// 	const exists1 = fs.existsSync(filePath1);

// 	// const results =
// 	replace({
// 		disableGlobs: true,
// 		files: (await exists1) ? filePath1 : filePath2,
// 		from: /import Parse from 'parse\/node';/g,
// 		to: "import Parse from 'parse/node.js'",
// 	});
// };

patchParseServerSelectNestedObjectKeys();
// patchParseServerMongoSchemaCollection();
