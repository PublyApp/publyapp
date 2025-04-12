import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

import ParseUser from '../user/user.class';

import Parse_CustomJoinUserToTenant from './$join-user-to-tenant.class';
import ParseTenant from './tenant.class';

// eslint-disable-next-line @typescript-eslint/naming-convention
const Parse_CustomJoinUserToTenantSchema = SchemaManager.defineSchema(
	Parse_CustomJoinUserToTenant.className,
	{
		fields: {
			user: { type: 'Pointer', targetClass: ParseUser.className },
			tenant: { type: 'Pointer', targetClass: ParseTenant.className },
			subRoles: { type: 'Array' },
		},
		indexes: {
			uniqueRelation: {
				keys: { ['_p_user' as never]: 1, ['_p_tenant' as never]: 1 },
				options: { unique: true },
			},
		},
	},
);

export default Parse_CustomJoinUserToTenantSchema;
