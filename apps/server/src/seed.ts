import './lib/parse/initParse';

import { cleanUsers, createUsers } from './resources/auth/user/user.seed';

if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results = await cleanUsers();
	console.log('✅✅', results);

	const users = await createUsers({ num: 50 });
	console.log('users', users.length);
};

run();
