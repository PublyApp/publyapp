import { type BaseAttributes } from 'parse';

import type { AppFile } from './appFile.types';

export type UserAttributes = {
	// Parse built-ins
	username: string;
	email: string;
	password?: string;
	// custom fields
	firstName?: string;
	lastName?: string;
};

export type IUser = BaseAttributes & UserAttributes;

export type IUserWithRelations = IUser & {
	avatar?: AppFile;
};
