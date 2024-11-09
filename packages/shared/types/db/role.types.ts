import { type BaseAttributes } from 'parse';

type RoleAttributes = {
	// Parse built-ins
	name: string;
	// custom fields
	code: number;
	// nothing for now
};

export type IRole = BaseAttributes & RoleAttributes;
