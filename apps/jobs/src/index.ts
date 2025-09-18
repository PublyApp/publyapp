import _ from 'lodash';
import { ZodError } from 'zod';
import { jobType } from '@/shared/lib/constants';
import { exampleJob } from './jobs/example-job';

const genericMessage = {
	BAD_PARAM: 'Bad parameter',
	GENERIC_ERROR: 'An error occurred',
};

const jobTypeMap = new Map<string, AsyncFunction>([
	[jobType.EXAMPLE_JOB, exampleJob],
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
		// since this is a job, we must always throw in each edges of this catch block.
		// and don't use try catch anywhere else but let the leaf functions throw too.

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
