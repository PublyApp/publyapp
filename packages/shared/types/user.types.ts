import { BaseAttributes } from 'parse';

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
