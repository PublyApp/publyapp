import { BaseAttributes } from 'parse';

export type IRole = BaseAttributes & {
	// Parse built-ins
	name: string;
	// custom fields
	// nothing for now
};
