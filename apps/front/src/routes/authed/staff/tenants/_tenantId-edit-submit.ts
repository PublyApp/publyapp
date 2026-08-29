import { type StaffTenantUpdateInput } from '~/lib/query/staff-tenants';

import {
	isTenantEditFormField,
	normalizeOptionalUpdateString,
	type EditTenantFormValues,
} from './_tenantId-edit-types';

type DirtyFieldFlags = Partial<Record<keyof EditTenantFormValues, unknown>>;

/** PATCH semantics: only fields the user actually touched reach the wire, and
 * a cleared optional field is sent as `null` rather than dropped. */
export const buildTenantUpdatePayload = ({
	tenantId,
	values,
	dirtyFields,
}: {
	tenantId: string;
	values: EditTenantFormValues;
	dirtyFields: DirtyFieldFlags;
}): StaffTenantUpdateInput => {
	const payload: StaffTenantUpdateInput = { tenantId };

	if (dirtyFields.name && values.name !== undefined) {
		const name = values.name.trim();
		if (name.length > 0) {
			payload.name = name;
		}
	}

	if (dirtyFields.maxUsers) {
		payload.maxUsers = values.maxUsers;
	}

	if (dirtyFields.logoUrl) {
		payload.logoUrl = normalizeOptionalUpdateString(values.logoUrl);
	}

	if (dirtyFields.legalName) {
		payload.legalName = normalizeOptionalUpdateString(values.legalName);
	}

	if (dirtyFields.description) {
		payload.description = normalizeOptionalUpdateString(values.description);
	}

	if (dirtyFields.websiteUrl) {
		payload.websiteUrl = normalizeOptionalUpdateString(values.websiteUrl);
	}

	if (dirtyFields.billingEmail) {
		payload.billingEmail = normalizeOptionalUpdateString(values.billingEmail);
	}

	if (dirtyFields.supportEmail) {
		payload.supportEmail = normalizeOptionalUpdateString(values.supportEmail);
	}

	if (dirtyFields.defaultLocale) {
		payload.defaultLocale = normalizeOptionalUpdateString(values.defaultLocale);
	}

	if (dirtyFields.timezone) {
		payload.timezone = normalizeOptionalUpdateString(values.timezone);
	}

	if (dirtyFields.notes) {
		payload.notes = normalizeOptionalUpdateString(values.notes);
	}

	return payload;
};

export type TenantEditErrorPlan = {
	fieldErrors: { field: keyof EditTenantFormValues; message: string }[];
	rootMessage: string | null;
};

/** Splits a 422 payload into errors that map onto a form field and everything
 * else, which collapses into a single de-duplicated root message. */
export const planTenantEditFieldErrors = (
	fieldErrors: Record<string, string[]>,
	fallbackMessage: string,
): TenantEditErrorPlan => {
	const mapped: TenantEditErrorPlan['fieldErrors'] = [];
	const rootMessages: string[] = [];

	for (const [field, messages] of Object.entries(fieldErrors)) {
		if (isTenantEditFormField(field) && messages.length > 0) {
			mapped.push({ field, message: messages.join(' ') });
			continue;
		}

		rootMessages.push(...messages);
	}

	if (mapped.length === 0 && rootMessages.length === 0) {
		rootMessages.push(fallbackMessage);
	}

	return {
		fieldErrors: mapped,
		rootMessage:
			rootMessages.length > 0
				? Array.from(new Set(rootMessages)).join(' ')
				: null,
	};
};

/** Seat preview falls back to the persisted value while the seats input holds
 * a transient non-numeric draft. */
export const resolvePreviewMaxUsers = (
	watchedMaxUsers: unknown,
	persistedMaxUsers: number,
): number => {
	const parsed = Number(watchedMaxUsers);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return persistedMaxUsers;
};
