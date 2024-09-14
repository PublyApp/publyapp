import { className, roleEnum } from '@devist/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

type ITenant = {
	name: string;
};

const TenantSchema = SchemaManager.defineSchema<ITenant>(className.TENANT, {
	fields: {
		name: { type: 'String' },
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
