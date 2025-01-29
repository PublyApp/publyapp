import _ from 'lodash';
import { ZodError } from 'zod';

import { convertHTMLToPDF } from './html-to-pdf';

const genericMessage = {
	BAD_PARAM: 'Bad parameter',
	GENERIC_ERROR: 'An Error occurred',
};

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
			throw new Error(genericMessage.BAD_PARAM);
		}

		await executorFunction(_.get(jobInput, 'params'));
	} catch (error) {
		// report the details of the error to our chosen log system for use internally
		// to not disclose sensitive informations to end users
		if (error instanceof ZodError) {
			throw new Error(genericMessage.BAD_PARAM);
		}

		if (_.isError(error) && error.message === genericMessage.BAD_PARAM) {
			throw error;
		}

		throw new Error(genericMessage.GENERIC_ERROR);
	}
};

main();
