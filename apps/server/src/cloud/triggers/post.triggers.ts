import { logger } from 'parse-server';

import { parseTrigger } from '@/server/lib/parse';
import { ParsePost } from '@/shared/lib/parse/classes/post.class';

Parse.Cloud.beforeFind(
	ParsePost,
	parseTrigger({
		trigger: async ({ req, t, locale }) => {
			logger.info('beforeFind', req);

			// const postToSave = req.object;
		},
	}),
);
