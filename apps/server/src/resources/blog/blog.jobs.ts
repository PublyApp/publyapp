import logger from '@/server/lib/logger';
import { jobName } from '@/shared/lib/constants';

Parse.Cloud.job(jobName.blog.collectBlogPostTags, async (req) => {
	logger.info('request object', req);
	throw new Error('Intentional throw');
});
