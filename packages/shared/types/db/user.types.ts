import type { BaseAttributes } from 'parse';

// import { AppFile } from './appFile.types';

// import type ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';

// import type { ITenant } from './tenant.types';

export type UserStatus = 'active' | 'pending' | 'banned';

export type UserAttributes = {
	// Parse built-ins
	username: string;
	email: string;
	password?: string;
	// custom fields
	firstName?: string;
	lastName?: string;

	status?: UserStatus;

	// ===
	avatarUrl?: string;
};

export type IUser = BaseAttributes & UserAttributes;

export type IUserWithRelations = IUser & {
	// avatar?: AppFile;
	// tenants?: {
	// 	tenant: ITenant;
	// }[];
};

export type IUserWithParseRelations = IUser & {
	// avatar?: ParseAppFile;
	// tenants?: {
	// 	tenant: ParseTenant;
	// }[];
};
