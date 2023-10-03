/* eslint-disable global-require */
// import Parse from 'parse/node';

import type { UserAttributes } from '@shared/types/user.types';
import { className } from '@shared/utils/constants';
import { defineGlobalParse } from '@shared/utils/parse.utils';

defineGlobalParse();

export class User extends Parse.User {
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
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

Parse.Object.registerSubclass(className.USER, User);
