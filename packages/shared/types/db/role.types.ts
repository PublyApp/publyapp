import { type BaseAttributes } from 'parse';

export type IRole = BaseAttributes & {
	// Parse built-ins
	name: string;
	// custom fields
	// nothing for now
};

export const role = {
	ADMIN: {
		code: 12308120948,
		name: 'ADMIN',
	},
	MODERATOR: {
		code: 21143141341,
		name: 'MODERATOR',
	},
	AUTHOR: {
		code: 7589243534538,
		name: 'AUTHOR',
	},
	READER: {
		code: 934525757347,
		name: 'READER',
	},
} as const;

export const roles = Object.values(role);
export const roleNames = Object.values(role).map((e) => {
	return e.name;
});
export const roleCodes = Object.values(role).map((e) => {
	return e.code;
});

export type RoleEnum = (typeof role)[keyof typeof role];
export type RoleName = RoleEnum['name'];
export type RoleCode = RoleEnum['code'];
