import type { BaseAttributes } from 'parse';
import type ParseUser from '@/server/modules/common/auth/user/user.class';

export type UserStatus = 'active' | 'pending' | 'banned';

export type UserAttributes = {
	// Parse built-ins
	username: string;
	email: string;
	password?: string;

	// custom fields
	firstName?: string;
	lastName?: string;
	isStaffMember?: boolean;
	roleData?: {
		role: string;
		rank: number;
	};

	status?: UserStatus;

	// ====
	isBanned?: boolean;
	isDeleted?: boolean;

	// ====
	avatarUrl?: string;
};

export type IUser = BaseAttributes & UserAttributes;

export type IUserWithRelations = IUser & {
	createdBy?: IUser;
	// avatar?: AppFile;
	// tenants?: {
	// 	tenant: ITenant;
	// }[];
};

export type IUserWithParseRelations = IUser & {
	createdBy?: ParseUser;
	// avatar?: ParseAppFile;
	// tenants?: {
	// 	tenant: ParseTenant;
	// }[];
};
