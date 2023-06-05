import { Attributes } from 'parse';

export interface IRole extends Attributes {
	// Parse built-ins
	name: string;
	// custom fields
	// nothing for now
	// === generic Parse built-ins
	objectId: string;
	createdAt: string;
	updatedAt: string;
}
