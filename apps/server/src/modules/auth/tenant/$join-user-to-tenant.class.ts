import type { ITenantWithParseRelations } from '@devist/shared/types/db/tenant.types';

import { className } from '@/shared/lib/constants';

// eslint-disable-next-line @typescript-eslint/naming-convention
export default class Parse_JoinUserToTenant extends Parse.Object<ITenantWithParseRelations> {
	static className = className.$JOIN_USER_TO_TENANT;

	constructor(attributes: DeepPartial<ITenantWithParseRelations> = {}) {
		super(Parse_JoinUserToTenant.className, attributes as never);
	}
}

Parse.Object.registerSubclass(Parse_JoinUserToTenant.className, Parse_JoinUserToTenant);
