import { type BaseAttributes } from 'parse';

import type ParseTenant from '@/server/resources/_multi-tenancy/tenant.class';
import type ParseAppFile from '@/server/resources/file-manager/appFile/appFile.class';

import type { AppFile } from './appFile.types';
import type { ITenant } from './tenant.types';

export type UserAttributes = {
	// Parse built-ins
	username: string;
	email: string;
	password?: string;
	// custom fields
	firstName?: string;
	lastName?: string;

	// ===
	avatarUrl?: string;
};

export type IUser = BaseAttributes & UserAttributes;

export type IUserWithRelations = IUser & {
	avatar?: AppFile;
	tenants?: {
		tenant: ITenant;
	}[];
};

export type IUserWithParseRelations = IUser & {
	avatar?: ParseAppFile;
	tenants?: {
		tenant: ParseTenant;
	}[];
};
