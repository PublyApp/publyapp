/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');

const lineReplace = require('line-replace');

const patchParseServerMiddleWareHeader = async () => {
	// const oldText = "    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');";
	const newText =
		"    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id, access-control-expose-headers');";

	lineReplace({
		file: path.resolve(__dirname, '../node_modules/parse-server/lib/middlewares.js'),
		line: 359,
		text: newText,
		addNewLine: true,
		callback: ({ /* file, line, text, replacedText, */ error }) => {
			if (error) {
				console.log(error);
			}

			// console.log('file: ', file);
			// console.log('line:  ', line);
			// console.log('replaced: ', replacedText);
			// console.log('new text: ', text);
		},
	});
};

const patchParseServerSelectNestedObjects = async () => {
	const filePath = path.resolve(__dirname, '../node_modules/parse-server/lib/RestQuery.js');

	const replacements = [
		// { line: 637, newText: '    findOptions.keys = this.keys;' },
		// { line: 638, newText: '    //' },
		// { line: 639, newText: '    //' },
		{ line: 638, newText: '      return key;' },
	];

	for await (const { line, newText } of replacements) {
		const runAsync = async () => {
			lineReplace({
				file: filePath,
				line,
				text: newText,
				addNewLine: true,
				callback: ({ /* file, line, text, replacedText, */ error }) => {
					if (error) {
						console.log(error);
					}
				},
			});
		};

		// eslint-disable-next-line no-await-in-loop
		await runAsync();
	}
};

Promise.all([patchParseServerMiddleWareHeader(), patchParseServerSelectNestedObjects()]);
