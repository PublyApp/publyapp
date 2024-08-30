import './lib/parse/initParse';

import { seedingLogger } from './lib/logger';
import { cleanUsers, createUsers } from './resources/auth/user/user.seed';
import { cleanBlogPosts, createBlogPosts } from './resources/blog/blogPost/blogPost.seed';

// --------------------------------------------------------------------------------------//
//                    IMPORTANT NOTE: The dev server must be running                    //
// --------------------------------------------------------------------------------------//
// check if local
if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results1 = await cleanUsers();
	seedingLogger.info('✅✅', results1);
	const results2 = await cleanBlogPosts();
	seedingLogger.info('✅✅', results2);

	const users = await createUsers({ num: 50 });
	seedingLogger.info('users', users.length);
	const posts = await createBlogPosts({ num: 20_000, users });
	seedingLogger.info('posts', posts.length);
};

run();
