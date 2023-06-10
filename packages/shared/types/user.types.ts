import { IAttributes } from './parse.types';

export type IUser = IAttributes & {
	// Parse built-ins
	username: string;
	email: string;
	// custom fields
	firstName?: string;
	lastName?: string;
	// === generic Parse built-ins
	objectId: string;
	createdAt: string;
	updatedAt: string;
};
