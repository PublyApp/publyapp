import { SchemaMigrations } from 'parse-server';

import { className } from '@aktiveo/shared/utils/constants';

const RoleSchema = SchemaMigrations.makeSchema(className.ROLE, {
	fields: {
		code: { type: 'Number' },
	},
	classLevelPermissions: {
		create: {
			'*': true,
		},
		find: {
			'*': true,
		},
		get: {
			'*': true,
		},
	},
	indexes: {},
});

export default RoleSchema;
