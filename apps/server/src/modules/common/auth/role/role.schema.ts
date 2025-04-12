import { className } from "@org/shared/lib/constants";

import { AUTHED_READONLY_CLP } from "@/server/lib/constants";
import SchemaManager from "@/server/lib/parse/classes/SchemaManager";
import type { IRole } from "@/shared/types/db/role.types";

const RoleSchema = SchemaManager.defineSchema<Omit<IRole, "name">>(
	className.ROLE,
	{
		fields: {
			code: { type: "String" },
			rank: { type: "Number" },
			// verbs permissions
			// canDeletePostOfOtherUsers: { type: 'Boolean' }, // todo: define the behavior
		},
		classLevelPermissions: AUTHED_READONLY_CLP,
		indexes: {
			codeIndex: { keys: { code: 1 }, options: { unique: true } },
		},
	},
);

export default RoleSchema;
