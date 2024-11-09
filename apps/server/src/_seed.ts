import './lib/parse/initParse';

import { scriptLogger } from './lib/logger';
import { cleanUsers, createUsers } from './modules/auth/user/user.seed';
import { cleanBlogPosts, createBlogPosts } from './modules/blog/blogPost/blogPost.seed';

// --------------------------------------------------------------------------------------//
//                    IMPORTANT NOTE: The dev server must be running                    //
// --------------------------------------------------------------------------------------//
// check if local
if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results1 = await cleanUsers();
	scriptLogger.info('✅✅', results1);
	const results2 = await cleanBlogPosts();
	scriptLogger.info('✅✅', results2);

	const users = await createUsers({ num: 50 });
	scriptLogger.info('users', users.length);
	const posts = await createBlogPosts({ num: 20_000, users });
	scriptLogger.info('posts', posts.length);
};

run();
