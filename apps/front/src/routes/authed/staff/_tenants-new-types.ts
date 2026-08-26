import type { AccountLevel } from '@org/client-ts/models/index';
import { AccountLevelObject } from '@org/client-ts/models/index';
import { DEFAULT_MAX_USER_PER_TENANT } from '@org/shared-ts/lib/constants';

export type NewTenantAccountLevel = AccountLevel;

export type OwnerSlotValues = {
	email: string;
};

export type ManualMemberSlotValues = {
	email: string;
	accountLevel: NewTenantAccountLevel;
};

export type TenantCreateFormValues = {
	name: string;
	code: string;
	maxUsers: number;
	owners: OwnerSlotValues[];
	manualMembers: ManualMemberSlotValues[];
	seedDefaultProfile: boolean;
	logoUrl: string;
	legalName: string;
	description: string;
	websiteUrl: string;
	billingEmail: string;
	supportEmail: string;
	defaultLocale: string;
	timezone: string;
	notes: string;
};

export const DEFAULT_VALUES: TenantCreateFormValues = {
	name: '',
	code: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	owners: [{ email: '' }],
	manualMembers: [],
	seedDefaultProfile: true,
	logoUrl: '',
	legalName: '',
	description: '',
	websiteUrl: '',
	billingEmail: '',
	supportEmail: '',
	defaultLocale: '',
	timezone: '',
	notes: '',
};

const CREATE_TENANT_API_FORM_FIELDS = new Set<keyof TenantCreateFormValues>([
	'name',
	'code',
	'maxUsers',
	'seedDefaultProfile',
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
	'notes',
]);

export const isCreateTenantFormField = (
	field: string,
): field is keyof TenantCreateFormValues =>
	CREATE_TENANT_API_FORM_FIELDS.has(field as keyof TenantCreateFormValues);

export const USER_ROLE_OPTIONS = [
	AccountLevelObject.Admin,
	AccountLevelObject.User,
] as const;
