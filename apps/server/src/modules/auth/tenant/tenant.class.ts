import type { ITenantWithParseRelations } from '@devist/shared/types/db/tenant.types';

import { className } from '@/shared/lib/constants';

export default class ParseTenant extends Parse.Object<ITenantWithParseRelations> {
	static className = className.TENANT;

	constructor(attributes: DeepPartial<ITenantWithParseRelations> = {}) {
		super(ParseTenant.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseTenant.className, ParseTenant);
