import type { BaseAttributes } from 'parse';

// import type ParseUser from '@/server/modules/auth/user/user.class';

import type { IUser } from './user.types';

export type TenantAttributes = {
	name: string;
};

export type ITenant = BaseAttributes & TenantAttributes;

export type ITenantWithRelations = ITenant & {
	users: {
		user: IUser;
	}[];
};

export type ITenantWithParseRelations = ITenant & {
	// users: {
	// 	user: ParseUser;
	// }[];
};
