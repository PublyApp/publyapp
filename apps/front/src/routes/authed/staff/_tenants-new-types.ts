import { DEFAULT_MAX_USER_PER_TENANT } from '@org/shared-ts/lib/constants';

export type NewTenantRole = 'owner' | 'member';

export type OwnerSlotValues = {
	email: string;
};

export type ManualMemberSlotValues = {
	email: string;
	role: NewTenantRole;
};

export type TenantCreateFormValues = {
	name: string;
	code: string;
	codeEdited: boolean;
	seats: TenantCreateSeatsValue;
	customSeats: string;
	maxUsers: number;
	owners: OwnerSlotValues[];
	manualMembers: ManualMemberSlotValues[];
	seedDefaultRole: boolean;
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

export type TenantCreateSeatsValue = '5' | '10' | '25' | '50' | 'custom';
export const SEAT_OPTIONS: readonly TenantCreateSeatsValue[] = [
	'5',
	'10',
	'25',
	'50',
	'custom',
];
export const SEATS_FROM_VALUE = (
	value: TenantCreateSeatsValue,
	customSeats: string,
): number => {
	if (value === 'custom') {
		const parsed = Number.parseInt(customSeats, 10);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return Number.parseInt(value, 10);
};

export const DEFAULT_VALUES: TenantCreateFormValues = {
	name: '',
	code: '',
	codeEdited: false,
	seats: '5',
	customSeats: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	owners: [{ email: '' }],
	manualMembers: [],
	seedDefaultRole: true,
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
	'seedDefaultRole',
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

export const USER_ROLE_OPTIONS = ['owner', 'member'] as const;
