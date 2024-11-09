import type { ITenantWithParseRelations } from '@devist/shared/types/db/tenant.types';

import { className } from '@/shared/lib/constants';

export default class Parse$JoinUserToTenant extends Parse.Object<ITenantWithParseRelations> {
	static className = className.$JOIN_USER_TO_TENANT;

	constructor(attributes: DeepPartial<ITenantWithParseRelations> = {}) {
		super(Parse$JoinUserToTenant.className, attributes as never);
	}
}

Parse.Object.registerSubclass(Parse$JoinUserToTenant.className, Parse$JoinUserToTenant);
