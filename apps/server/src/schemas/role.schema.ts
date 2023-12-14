import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';

import { AUTHED_READONLY_CLP } from '@/server/lib/constants';

const RoleSchema = SchemaMigrations.makeSchema(className.ROLE, {
	fields: {
		code: { type: 'Number' },
	},
	classLevelPermissions: AUTHED_READONLY_CLP,
	indexes: {},
});

export default RoleSchema;
