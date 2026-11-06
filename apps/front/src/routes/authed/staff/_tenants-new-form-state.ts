import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import { useCreateStaffTenantMutation } from '~/lib/query/staff-tenants';

import {
	useTenantLocaleOptions,
	useTenantTimezoneOptions,
} from './_tenant-form-shared';
import { buildTenantCreateSubmitter } from './_tenants-new-create-action';
import { useTenantMemberImport } from './_tenants-new-import';
import { buildCreateTenantSchema } from './_tenants-new-schema';
import { filterFilledEmails } from './_tenants-new-submit';
import {
	DEFAULT_VALUES,
	SEATS_FROM_VALUE,
	type TenantCreateFormValues,
} from './_tenants-new-types';
import { slugifyTenantCode } from './tenants-new-helpers';
import { getWebsiteHostname } from './tenants/tenant-organization-profile-fields';

const localeLabelOf = (value: string): string => {
	if (value === 'fr') {
		return 'Français';
	}
	if (value === 'en') {
		return 'English';
	}
	return '';
};

type Navigate = (options: {
	to: string;
	params?: Record<string, string>;
}) => Promise<void>;

/**
 * All of the create form's state, derived values and handlers (extracted from
 * the component so its render stays a layout): RHF + Zod, the live
 * member-import state, the seat cap, the unsaved-changes blocker and the
 * two-step create (confirm dialog → mutation → navigate).
 */
export const useTenantCreateFormState = (navigate: Navigate) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [pendingCreateValues, setPendingCreateValues] =
		useState<TenantCreateFormValues | null>(null);
	const createTenant = useCreateStaffTenantMutation();
	const hasCreatedRef = useRef(false);

	// Always-fresh ref so the memoized resolver's max-seats check can see the
	// latest CSV import count without rebuilding on every parse.
	const parsedMembersCountRef = useRef(0);

	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver. The
	// max-seats check stays live through the ref-getter closed over here.
	// `useCallback` keeps the factory's identity stable — an inline arrow would
	// rebuild the schema on every render, which is the cost being removed.
	const buildSchema = useCallback(
		(schemaT: (key: string) => string) =>
			buildCreateTenantSchema(schemaT, () => parsedMembersCountRef.current),
		[],
	);
	const resolver = useLanguageKeyedZodResolver<TenantCreateFormValues>(
		buildSchema,
		'common',
	);

	const methods = useForm<TenantCreateFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		control,
		formState: { isDirty, isSubmitting, errors },
	} = methods;
	const isFormLocked = isSubmitting || createTenant.isPending;

	const name = useWatch({ control, name: 'name' }) ?? '';
	const code = useWatch({ control, name: 'code' }) ?? '';
	const codeEdited = useWatch({ control, name: 'codeEdited' }) ?? false;
	const seats = useWatch({ control, name: 'seats' }) ?? DEFAULT_VALUES.seats;
	const customSeats =
		useWatch({ control, name: 'customSeats' }) ?? DEFAULT_VALUES.customSeats;
	const maxUsers =
		SEATS_FROM_VALUE(seats, customSeats) || DEFAULT_VALUES.maxUsers;
	const owners = useWatch({ control, name: 'owners' }) ?? DEFAULT_VALUES.owners;
	const manualMembers =
		useWatch({ control, name: 'manualMembers' }) ??
		DEFAULT_VALUES.manualMembers;
	const websiteUrl = useWatch({ control, name: 'websiteUrl' }) ?? '';
	const logoUrl = useWatch({ control, name: 'logoUrl' }) ?? '';
	const legalName = useWatch({ control, name: 'legalName' }) ?? '';
	const description = useWatch({ control, name: 'description' }) ?? '';
	const locale = useWatch({ control, name: 'defaultLocale' }) ?? '';
	const timezone = useWatch({ control, name: 'timezone' }) ?? '';

	// The prototype's order: unset, then Français, then English.
	const localeOrder = ['', 'fr', 'en'];
	const localeOptions = [...useTenantLocaleOptions(t)].sort(
		(a, b) => localeOrder.indexOf(a.value) - localeOrder.indexOf(b.value),
	);
	const timezoneOptions = useTenantTimezoneOptions(t);

	const {
		fields: ownerFields,
		append: appendOwner,
		remove: removeOwner,
	} = useFieldArray({ control, name: 'owners' });
	const {
		fields: manualMemberFields,
		append: appendManualMember,
		remove: removeManualMember,
	} = useFieldArray({ control, name: 'manualMembers' });

	const memberImport = useTenantMemberImport({ t, owners, manualMembers });
	const { parsedValidMembers } = memberImport;

	useEffect(() => {
		methods.setValue('maxUsers', maxUsers, { shouldValidate: false });
	}, [maxUsers, methods]);

	useEffect(() => {
		parsedMembersCountRef.current = parsedValidMembers.length;
	}, [parsedValidMembers.length]);

	// Slug auto-generates from the name until the user edits it.
	useEffect(() => {
		if (!codeEdited) {
			const next = slugifyTenantCode(name);
			if (next !== code) {
				methods.setValue('code', next, { shouldValidate: code.length > 0 });
			}
		}
	}, [name, codeEdited, code, methods]);

	// tenants-r6-F3: `isDirty` only tracks RHF-registered fields — the CSV
	// import populates `parsedFile`, state that lives OUTSIDE the form, so a
	// populated import with an otherwise-pristine form used to leave silently
	// through the blocker. `parsedFile !== null` closes that gap.
	const blocker = useBlocker({
		shouldBlockFn: () =>
			(isDirty || memberImport.parsedFile !== null) && !hasCreatedRef.current,
		withResolver: true,
	});

	const filledManualMembers = filterFilledEmails(manualMembers);
	const ownersCount = filterFilledEmails(owners).length;
	const membersCount = filledManualMembers.length + parsedValidMembers.length;
	// Owners, manual members and imported members all consume the same seats.
	const canAddSlot =
		ownerFields.length + manualMemberFields.length + parsedValidMembers.length <
		Math.max(1, maxUsers);

	const ownersRootError = errors.owners as
		| { message?: string; root?: { message?: string } }
		| undefined;

	const submitCreate = buildTenantCreateSubmitter({
		methods,
		t,
		queryClient,
		mutateAsync: createTenant.mutateAsync,
		parsedMembers: parsedValidMembers,
	});

	const performCreate = useCallback(
		async (values: TenantCreateFormValues) => {
			const outcome = await submitCreate(values);
			setPendingCreateValues(null);

			if (outcome.kind === 'logout') {
				setShouldLogout(true);
				return;
			}
			if (outcome.kind !== 'created') {
				return;
			}

			hasCreatedRef.current = true;
			void navigate(
				outcome.tenantId
					? {
							to: '/staff/tenants/$tenantId',
							params: { tenantId: outcome.tenantId },
						}
					: { to: '/staff/tenants' },
			);
		},
		[submitCreate, navigate],
	);

	const goToTenants = useCallback(() => {
		void navigate({ to: '/staff/tenants' });
	}, [navigate]);

	const onSubmit = methods.handleSubmit((values) => {
		methods.clearErrors('root.server');
		setPendingCreateValues(values);
	});

	const detailsSummary = [
		legalName.trim(),
		websiteUrl.trim(),
		localeLabelOf(locale),
		timezone,
		description.trim(),
	]
		.filter(Boolean)
		.join(' · ');

	const creationSummary = `${t('create-tenant-summary-owners', {
		count: ownersCount,
	})} · ${t('create-tenant-summary-members', {
		count: membersCount,
	})} ${t('create-tenant-summary-suffix')}`;

	return {
		t,
		methods,
		control,
		errors,
		isFormLocked,
		shouldLogout,
		pendingCreateValues,
		setPendingCreateValues,
		createTenant,
		blocker,
		memberImport,
		parsedValidMembers,
		ownerFields,
		manualMemberFields,
		ownersRootError,
		appendOwner,
		removeOwner,
		appendManualMember,
		removeManualMember,
		canAddSlot,
		ownersCount,
		membersCount,
		filledManualMembers,
		maxUsers,
		name,
		code,
		seats,
		customSeats,
		logoUrl,
		websiteUrl,
		localeOptions,
		timezoneOptions,
		detailsSummary,
		creationSummary,
		performCreate,
		onSubmit,
		setSeats: (value: TenantCreateFormValues['seats']) => {
			methods.setValue('seats', value, { shouldValidate: true });
			if (value !== 'custom') {
				methods.setValue('customSeats', '', { shouldValidate: false });
			}
		},
		setCustomSeats: (value: string) => {
			methods.setValue('customSeats', value, { shouldValidate: true });
		},
		goToTenants,
		websiteHostname: getWebsiteHostname(websiteUrl),
	};
};
