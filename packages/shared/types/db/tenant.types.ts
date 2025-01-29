import type { BaseAttributes } from 'parse';

import type { IUser } from './user.types';

export type TenantAttributes = {
	name: string;
	logoUrl?: string;
	maxUsers?: number;
	usersCount?: number;
};

export type ITenant = BaseAttributes & TenantAttributes;

export type ITenantWithRelations = ITenant & {
	users?: IUser[];
};

export type ITenantWithParseRelations = ITenant & {
	users?: Parse.User[];
};
