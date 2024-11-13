import { className } from '@/shared/lib/constants';

// eslint-disable-next-line @typescript-eslint/naming-convention
export default class Parse_CustomJoinUserToTenant extends Parse.Object<ITenantWithParseRelations> {
	static className = className._CUSTOM_JOIN_USER_TO_TENANT;

	constructor(attributes: DeepPartial<ITenantWithParseRelations> = {}) {
		super(Parse_CustomJoinUserToTenant.className, attributes as never);
	}
}

Parse.Object.registerSubclass(Parse_CustomJoinUserToTenant.className, Parse_CustomJoinUserToTenant);
