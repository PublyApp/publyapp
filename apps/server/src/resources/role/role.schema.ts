import { className } from '@devist/shared/lib/constants';

import { AUTHED_READONLY_CLP } from '@/server/lib/constants';
import { defineSchema } from '@/server/lib/parse/utils';
import type { IRole } from '@/shared/types/db/role.types';

const RoleSchema = defineSchema<Omit<IRole, 'name'>>(className.ROLE, {
	fields: {
		code: { type: 'Number' },
		// verbs permissions
		// canDeletePostOfOtherUsers: { type: 'Boolean' }, // todo: define the behavior
	},
	classLevelPermissions: AUTHED_READONLY_CLP,
	// classLevelPermissions: PUBLIC_READONLY_CLP,
	indexes: {},
});

export default RoleSchema;
