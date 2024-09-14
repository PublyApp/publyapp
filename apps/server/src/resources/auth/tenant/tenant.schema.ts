import { className, roleEnum } from '@devist/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import type { ITenantWithParseRelations } from '@/shared/types/db/tenant.types';

const TenantSchema = SchemaManager.defineSchema<ITenantWithParseRelations>(className.TENANT, {
	fields: {
		name: { type: 'String' },

		// relations
		users: { type: 'Array' }, // ! it's fine to put an array of users because there will be less of 100 for each tenant anyway.
		// modules // ???
	},
	classLevelPermissions: {
		find: {
			[`role:${roleEnum.TENANT_CONTRIBUTOR.name}`]: true,
		},
		get: {
			[`role:${roleEnum.TENANT_CONTRIBUTOR.name}`]: true,
		},
		count: {
			[`role:${roleEnum.STAFF_CONTRIBUTOR.name}`]: true,
		},
		create: {
			[`role:${roleEnum.STAFF_EDITOR.name}`]: true,
		},
		update: {
			[`role:${roleEnum.STAFF_EDITOR.name}`]: true,
		},
		delete: {
			[`role:${roleEnum.STAFF_ADMIN.name}`]: true,
		},
	},
});

export default TenantSchema;
