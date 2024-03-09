/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';

import lineReplace from 'line-replace';

// const oldText = "    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');";
const newText =
	"    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id, access-control-expose-headers');";

const filePath1 = path.resolve(import.meta.dir, '../node_modules/parse-server/lib/middlewares.js');
const filePath2 = path.resolve(import.meta.dir, '../../../node_modules/parse-server/lib/middlewares.js');

const exists1 = Bun.file(filePath1).exists();

lineReplace({
	file: (await exists1) ? filePath1 : filePath2,
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
