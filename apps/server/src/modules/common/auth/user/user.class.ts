import { className } from '@/shared/lib/constants';
import type { UserAttributes } from '@/shared/types/db/user.types';

export default class ParseUser extends Parse.User {
	static className = className.USER;

	// biome-ignore lint/complexity/noUselessConstructor: <explanation>
	constructor(attributes?: UserAttributes) {
		super(attributes);
	}

	// get firstName(): string | undefined {
	// 	return this.get('userName');
	// }

	// set firstName(value: string) {
	// 	this.set('firstName', value);
	// }

	// get lastName(): string | undefined {
	// 	return this.get('lastName');
	// }

	// set lastName(value: string) {
	// 	this.set('lastName', value);
	// }
}

Parse.Object.registerSubclass(ParseUser.className, ParseUser);
