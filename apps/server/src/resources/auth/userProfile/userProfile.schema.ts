import { DEFAULT_CLP } from '@/server/lib/constants';
import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';
import type { IUserProfileWithParseRelations } from '@/shared/types/db/userProfile.types';

const UserProfileSchema = SchemaManager.defineSchema<IUserProfileWithParseRelations>(className.USER_PROFILE, {
	fields: {
		username: { type: 'String', required: true },

		firstName: { type: 'String' },
		lastName: { type: 'String' },
		avatarUrl: { type: 'String' },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
		user: { type: 'Pointer', targetClass: className.USER, required: true },
	},
	indexes: {
		uniqueUsername: {
			keys: { username: 1 },
			options: { unique: true },
		},
		userIndex: {
			keys: { _p_user: 1 },
		},
	},
	classLevelPermissions: DEFAULT_CLP,
});

export default UserProfileSchema;
