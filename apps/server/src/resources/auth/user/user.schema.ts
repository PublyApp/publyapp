import { className } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import SchemaManager from '@/server/lib/parse/SchemaManager';

const UserSchema = SchemaManager.defineSchema<Omit<IUserWithRelations, /* 'email' |  */ 'username' | 'password'>>(
	className.USER,
	{
		fields: {
			firstName: { type: 'String' },
			lastName: { type: 'String' /* , required: true */ },
			avatarUrl: { type: 'String' },
			email: { type: 'String', required: true },

			// relations
			avatar: { type: 'Pointer', targetClass: className.APP_FILE },
		},
	},
);

export default UserSchema;
