import { z } from 'zod';
import type { StaffTenantUserUpdateInput } from '~/lib/query/staff-tenant-users';

import { isAbsoluteHttpUrl } from '../../tenant-organization-profile-fields';

export const EDIT_ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;

export const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null => {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed;
};

export const buildTenantUserEditSchema = (t: (key: string) => string) =>
	z.object({
		firstName: z
			.string()
			.trim()
			.max(128, { message: t('firstname-too-long') })
			.optional(),
		lastName: z
			.string()
			.trim()
			.max(128, { message: t('lastname-too-long') })
			.optional(),
		avatarUrl: z
			.string()
			.trim()
			.max(1024, { message: t('avatar-url-too-long') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('avatar-url-invalid'),
			}),
		accountLevel: z.enum(EDIT_ACCOUNT_LEVEL_OPTIONS),
	});

export type TenantUserEditValues = z.infer<
	ReturnType<typeof buildTenantUserEditSchema>
>;

/** The form's update body IS the mutation's input shape — one declaration, in
 * `~/lib/query/staff-tenant-users`, so the two cannot drift apart. */
export type TenantUserEditPayload = StaffTenantUserUpdateInput;

export const normalizeAccountLevel = (
	value: string | null,
): TenantUserEditValues['accountLevel'] => {
	if (value === 'Admin') {
		return 'Admin';
	}
	return 'User';
};

export const buildTenantUserEditPayload = ({
	tenantId,
	userId,
	values,
	dirtyFields,
}: {
	tenantId: string;
	userId: string;
	values: TenantUserEditValues;
	dirtyFields: Partial<Record<keyof TenantUserEditValues, boolean | undefined>>;
}): TenantUserEditPayload => {
	const payload: TenantUserEditPayload = { tenantId, userId };

	if (dirtyFields.firstName) {
		payload.firstName = normalizeOptionalUpdateString(values.firstName);
	}

	if (dirtyFields.lastName) {
		payload.lastName = normalizeOptionalUpdateString(values.lastName);
	}

	if (dirtyFields.avatarUrl) {
		payload.avatarUrl = normalizeOptionalUpdateString(values.avatarUrl);
	}

	if (dirtyFields.accountLevel) {
		payload.accountLevel = values.accountLevel;
	}

	return payload;
};
