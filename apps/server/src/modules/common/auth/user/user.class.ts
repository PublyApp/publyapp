import { className } from '@/shared/lib/constants';
import type { UserAttributes } from '@/shared/types/db/user.types';

export default class ParseUser extends Parse.User {
	static className = className.USER;

	// biome-ignore lint/complexity/noUselessConstructor: For clarity concerns, I prefer to be explicits
	constructor(attributes?: UserAttributes) {
		super(attributes);
	}
}

Parse.Object.registerSubclass(ParseUser.className, ParseUser);
