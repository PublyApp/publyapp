import { logger } from '@/server/lib/winston';

import './lib/parse/initParse';

import { env } from './lib/env';
import { cleanUsers, createUsers } from './modules/common/auth/user/user.seed';

// --------------------------------------------------------------------------------------//
//                    IMPORTANT NOTE: The dev server must be running                    //
// --------------------------------------------------------------------------------------//
// check if local
if (!env.LOCAL || env.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results1 = await cleanUsers();
	logger.debug('✅✅', results1);

	const savedUsers = await createUsers({ num: 300 });
	logger.debug('users', { savedUsers: savedUsers.length });
};

run();
