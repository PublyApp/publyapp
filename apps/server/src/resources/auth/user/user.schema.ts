import _ from 'lodash';

import { className, roleEnum } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import { DEFAULT_CLP } from '@/server/lib/constants';
import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

const staffAdmin = `role:${roleEnum.STAFF_ADMIN.name}`;

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
		tenants: { type: 'Array' },
	},
	classLevelPermissions: {
		...DEFAULT_CLP,
		create: {
			'*': true,
			[staffAdmin]: true,
		},
		update: {
			requiresAuthentication: true,
			[staffAdmin]: true,
		},
		delete: {
			requiresAuthentication: true,
			[staffAdmin]: true,
		},
		addField: {
			requiresAuthentication: true,
			[staffAdmin]: true,
		},
		// protectedFields: {
		// 	'*': ['emailVerified', 'tenants'],
		// 	// requiresAuthentication: []
		// },
	},
});

export default UserSchema;
