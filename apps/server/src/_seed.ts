import { logger } from '@/server/lib/winston';

import './lib/parse/initParse';

import { cleanUsers, createUsers } from './modules/common/auth/user/user.seed';
import { cleanBlogPosts, createBlogPosts } from './modules/staff/blog/blogPost/blogPost.seed';

// --------------------------------------------------------------------------------------//
//                    IMPORTANT NOTE: The dev server must be running                    //
// --------------------------------------------------------------------------------------//
// check if local
if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results1 = await cleanUsers();
	logger.info('✅✅', results1);
	const results2 = await cleanBlogPosts();
	logger.info('✅✅', results2);

	const savedUsers = await createUsers({ num: 300 });
	logger.info('users', { savedUsers: savedUsers.length });
	const posts = await createBlogPosts({ num: 20_000, users: savedUsers });
	logger.info('posts', { savedPost: posts.length });
};

run();
