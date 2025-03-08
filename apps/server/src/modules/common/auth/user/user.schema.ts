import { className, roleEnum } from '@org/shared/lib/constants';
import type { IUserWithParseRelations } from '@org/shared/types/db/user.types';

import { DEFAULT_CLP } from '@/server/lib/constants';
import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

const staffAdmin = `role:${roleEnum.STAFF_ADMIN.name}` as const;
// const staffEditor = `role:${roleEnum.STAFF_EDITOR.name}` as const;
// const staffUser = `role:${roleEnum.STAFF_USER.name}` as const;
// const staffContributor = `role:${roleEnum.STAFF_USER.name}` as const;
// const tenantUser = `role:${roleEnum.TENANT_USER.name}` as const;

const UserSchema = SchemaManager.defineSchema<IUserWithParseRelations>(className.USER, {
	fields: {
		// required by default by Parse
		username: { type: 'String', required: true },
		email: { type: 'String', required: true },
		password: { type: 'String', required: true },

		// custom fields added by us
		firstName: { type: 'String' },
		lastName: { type: 'String' },
		avatarUrl: { type: 'String' },

		// relations
		// avatar: { type: 'Pointer', targetClass: className.APP_FILE },
		// tenants: { type: 'Array' },
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
		// 	'*': ['email'],
		// 	[staffAdmin]: [],
		// },
	},
});

export default UserSchema;
