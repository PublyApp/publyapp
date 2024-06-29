import { className } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

const UserSchema = SchemaManager.defineSchema<IUserWithRelations>(className.USER, {
	fields: {
		firstName: { type: 'String' },
		lastName: { type: 'String' },
		avatarUrl: { type: 'String' },

		// required by default by Parse
		username: { type: 'String', required: true },
		email: { type: 'String', required: true },
		password: { type: 'String', required: true },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
	},
});

export default UserSchema;
