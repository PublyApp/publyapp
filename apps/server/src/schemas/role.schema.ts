import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/utils/constants';

import { READONLY_CLP } from '@server/utils/constants';

const RoleSchema = SchemaMigrations.makeSchema(className.ROLE, {
	fields: {
		code: { type: 'Number' },
	},
	classLevelPermissions: READONLY_CLP,
	indexes: {},
});

export default RoleSchema;
