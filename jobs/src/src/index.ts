import _ from 'lodash';

import { convertHTMLToPDF } from './html-to-pdf';

const jobType = {
	CONVERT_HTML_TO_PDF: 'CONVERT_HTML_TO_PDF',
} as const;

const jobTypeMap = new Map<string, AsyncFunction>([
	// ===
	[jobType.CONVERT_HTML_TO_PDF, convertHTMLToPDF],
]);

const main = async () => {
	try {
		const jobInput: unknown = JSON.parse(process.env.JOB_INPUT || '{}');

		const executorFunction = jobTypeMap.get(_.get(jobInput, 'jobType', ''));

		if (!executorFunction) {
			throw new Error('Bad parameter');
		}

		await executorFunction(_.get(jobInput, 'params'));
	} catch (error) {
		console.log(error);
	}
};

main();
