import './lib/parse/initParse';

import _ from 'lodash';

// import { functionName } from '@/shared/lib/constants';

// import { USE_MASTER_KEY } from './lib/constants';
// import ParseUser from './modules/common/auth/user/user.class';
// import ParseUserProfile from './modules/common/auth/userProfile/userProfile.class';

const run = async () => {
	// await new Parse.Query(ParseUser).each(async (user) => {
	// 	let profile = await new Parse.Query(ParseUserProfile).equalTo('username', user.getUsername() as never).first();
	// 	if (!profile) {
	// 		profile = new ParseUserProfile();
	// 	}
	// 	const profileAttributes = _.omitBy(
	// 		{
	// 			avatarUrl: user.get('avatarUrl'),
	// 			firstName: user.get('firstName'),
	// 			lastName: user.get('lastName'),
	// 			username: user.get('username'),
	// 			// relations
	// 			avatar: user.get('avatar'),
	// 			user,
	// 			// seeded
	// 			seeded: user.get('seeded'),
	// 		},
	// 		_.isNil,
	// 	);
	// 	await profile.save(profileAttributes as never, USE_MASTER_KEY);
	// }, USE_MASTER_KEY);
	// await Parse.Cloud.run(functionName.blog.updateBlogPostAuthorPointers, null, USE_MASTER_KEY);
};

run();
