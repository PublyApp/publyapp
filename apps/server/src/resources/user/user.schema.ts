// import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import { defineSchema } from '@/server/lib/parse/utils';

const UserSchema = defineSchema<Omit<IUserWithRelations, 'email' | 'username' | 'password'>>(className.USER, {
	fields: {
		firstName: { type: 'String' },
		lastName: { type: 'String' /* , required: true */ },
		avatarUrl: { type: 'String' },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
	},
});

export default UserSchema;
