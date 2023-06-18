import { SchemaMigrations } from 'parse-server';

import { classNames } from '@aktivpost/shared/utils/constants';

const RoleSchema = SchemaMigrations.makeSchema(classNames.ROLE, {
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
