/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');

const lineReplace = require('line-replace');

// const oldText = "    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');";
const newText =
	"    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id, access-control-expose-headers');";

lineReplace({
	file: path.resolve('../node_modules/parse-server/lib/middlewares.js'),
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
