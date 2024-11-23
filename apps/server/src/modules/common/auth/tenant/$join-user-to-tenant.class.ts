import { type ICustomJoinUserToTenantWithParseRelations } from '@devist/shared/types/db/$join-user-to-tenant-types';

import { className } from '@/shared/lib/constants';

// eslint-disable-next-line @typescript-eslint/naming-convention
export default class Parse_CustomJoinUserToTenant extends Parse.Object<ICustomJoinUserToTenantWithParseRelations> {
	static className = className._CUSTOM_JOIN_USER_TO_TENANT;

	constructor(attributes: DeepPartial<ICustomJoinUserToTenantWithParseRelations> = {}) {
		super(Parse_CustomJoinUserToTenant.className, attributes as never);
	}
}

Parse.Object.registerSubclass(Parse_CustomJoinUserToTenant.className, Parse_CustomJoinUserToTenant);
