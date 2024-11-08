import { type BaseAttributes } from 'parse';

// import type ParseTenant from '@/server/modules/auth/tenant/tenant.class';

// import type { ITenant } from './tenant.types';

export type UserAttributes = {
	// Parse built-ins
	username: string;
	email: string;
	password?: string;
	// custom fields
	// firstName?: string;
	// lastName?: string;

	// ===
	// avatarUrl?: string;
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
