import { Attributes } from 'parse';

export type IAttributes = Attributes & {
	// === generic Parse built-ins
	objectId: string;
	createdAt: string;
	updatedAt: string;
};
