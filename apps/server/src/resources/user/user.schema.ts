// import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import { DEFAULT_CLP } from '@/server/lib/constants';
import { defineSchema } from '@/server/lib/parse';

const UserSchema = defineSchema<Omit<IUserWithRelations, 'email' | 'username' | 'password'>>(className.USER, {
	fields: {
		firstName: { type: 'String' },
		lastName: { type: 'String', required: true },
		avatarUrl: { type: 'String' },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});
// SchemaMigrations.makeSchema<Omit<IUserWithRelations, 'email' | 'username' | 'password'>>(
// 	className.USER,
// 	{
// 		fields: {
// 			firstName: { type: 'String' },
// 			lastName: { type: 'String', required: true },
// 			avatarUrl: { type: 'String' },

// 			// relations
// 			avatar: { type: 'Pointer', targetClass: className.APP_FILE },
// 		},
// 		classLevelPermissions: DEFAULT_CLP,
// 		indexes: {},
// 	},
// );

export default UserSchema;
