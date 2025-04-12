import { className, roleEnum } from "@org/shared/lib/constants";

import SchemaManager from "@/server/lib/parse/classes/SchemaManager";
import type { ITenantWithParseRelations } from "@/shared/types/db/tenant.types";

const TenantSchema = SchemaManager.defineSchema<ITenantWithParseRelations>(
	className.TENANT,
	{
		fields: {
			name: { type: "String" },
			logoUrl: { type: "String" },
			maxUsers: { type: "Number" },
			usersCount: { type: "Number" },

			// relations
		},
		classLevelPermissions: {
			find: {
				[`role:${roleEnum.TENANT_USER.name}`]: true,
			},
			get: {
				[`role:${roleEnum.TENANT_USER.name}`]: true,
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
				// [`role:${roleEnum.STAFF_ADMIN.name}`]: true, // ! in fact we don't want to delete anything, only do soft delete
			},
		},
	},
);

export default TenantSchema;
