import { IAttributes } from './parse.types';

export type IRole = IAttributes & {
	// Parse built-ins
	name: string;
	// custom fields
	// nothing for now
};
