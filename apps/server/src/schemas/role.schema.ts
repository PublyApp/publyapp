import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/utils/constants';

import { DEFAULT_STRICT_CLP } from '@server/utils/constants';

const RoleSchema = SchemaMigrations.makeSchema(className.ROLE, {
	fields: {
		code: { type: 'Number' },
	},
	classLevelPermissions: DEFAULT_STRICT_CLP,
	indexes: {},
});

export default RoleSchema;
