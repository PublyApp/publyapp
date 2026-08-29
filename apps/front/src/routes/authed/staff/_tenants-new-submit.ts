import { type CreateStaffTenantInput } from '~/lib/query/staff-tenants';

import {
	isCreateTenantFormField,
	type ManualMemberSlotValues,
	type OwnerSlotValues,
	type TenantCreateFormValues,
} from './_tenants-new-types';
import { mergeInitialUsers, type ImportedMember } from './tenants-new-helpers';

const optionalField = (value: string): string | undefined => {
	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

export const filterFilledEmails = <T extends OwnerSlotValues>(
	entries: T[],
): T[] => entries.filter((entry) => entry.email.trim().length > 0);

/** Shapes the create-tenant mutation payload. `code` stays absent (rather than
 * `undefined`) when blank so the server assigns the workspace slug itself. */
export const buildCreateTenantInput = ({
	values,
	parsedMembers,
}: {
	values: TenantCreateFormValues;
	parsedMembers: ImportedMember[];
}): CreateStaffTenantInput => {
	const trimmedCode = values.code.trim();
	const input: CreateStaffTenantInput = {
		name: values.name.trim(),
		maxUsers: values.maxUsers,
		seedDefaultProfile: values.seedDefaultProfile,
		initialUsers: mergeInitialUsers({
			owners: values.owners,
			parsedMembers,
			manualMembers: values.manualMembers,
		}),
		logoUrl: optionalField(values.logoUrl),
		legalName: optionalField(values.legalName),
		description: optionalField(values.description),
		websiteUrl: optionalField(values.websiteUrl),
		billingEmail: optionalField(values.billingEmail),
		supportEmail: optionalField(values.supportEmail),
		defaultLocale: optionalField(values.defaultLocale),
		timezone: optionalField(values.timezone),
		notes: optionalField(values.notes),
	};

	if (trimmedCode.length > 0) {
		input.code = trimmedCode;
	}

	return input;
};

export type CreateTenantErrorPlan = {
	fieldErrors: { field: keyof TenantCreateFormValues; message: string }[];
	rootMessage: string | null;
};

/** Splits a 422 payload into errors that map onto a form field and everything
 * else, which collapses into a single de-duplicated root message. */
export const planCreateTenantFieldErrors = (
	fieldErrors: Record<string, string[]>,
	fallbackMessage: string,
): CreateTenantErrorPlan => {
	const mapped: CreateTenantErrorPlan['fieldErrors'] = [];
	const rootMessages: string[] = [];

	for (const [field, messages] of Object.entries(fieldErrors)) {
		if (isCreateTenantFormField(field)) {
			mapped.push({ field, message: messages.join(' ') });
		} else {
			rootMessages.push(...messages);
		}
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

/** Counts shown in the "confirm create" dialog, frozen from the submitted
 * values rather than the live form. */
export const buildPendingCreateSummary = ({
	values,
	parsedMembersCount,
	assignedAfterCreationLabel,
}: {
	values: TenantCreateFormValues | null;
	parsedMembersCount: number;
	assignedAfterCreationLabel: string;
}) => {
	if (values === null) {
		return {
			ownersCount: 0,
			membersCount: 0,
			slugDisplay: assignedAfterCreationLabel,
		};
	}

	const manualMembers: ManualMemberSlotValues[] = values.manualMembers;
	const trimmedCode = values.code.trim();

	return {
		ownersCount: filterFilledEmails(values.owners).length,
		membersCount: filterFilledEmails(manualMembers).length + parsedMembersCount,
		slugDisplay:
			trimmedCode.length > 0 ? trimmedCode : assignedAfterCreationLabel,
	};
};
