import { logger } from 'parse-server';

import { parseTrigger } from '../../utils/parse.utils';

Parse.Cloud.afterLogin(
	parseTrigger({
		trigger: async ({ req }) => {
			logger.info('====================================');
			logger.info(req.headers);
			logger.info('====================================');
		},
	}),
);
