import { type BaseAttributes } from 'parse';

export type IRole = BaseAttributes & {
	// Parse built-ins
	name: string;
	// custom fields
	code: number;
	// nothing for now
};
