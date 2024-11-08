import type { IUserProfileWithParseRelations } from '@devist/shared/types/db/userProfile.types';

import { className } from '@/shared/lib/constants';

export default class ParseUserProfile extends Parse.Object<IUserProfileWithParseRelations> {
	static className = className.USER_PROFILE;

	constructor(attributes: DeepPartial<IUserProfileWithParseRelations> = {}) {
		super(ParseUserProfile.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseUserProfile.className, ParseUserProfile);
