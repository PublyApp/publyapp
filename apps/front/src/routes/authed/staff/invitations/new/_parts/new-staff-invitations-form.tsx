import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
	useFieldArray,
	useForm,
	useFormContext,
	useWatch,
} from 'react-hook-form';
import type { z as zod } from 'zod';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getBulkCreateInvitationsSchema } from '@org/shared-ts/validations/invitation.validations';

import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import {
	useBulkCreateStaffInvitations,
	useFindStaffInvitations,
} from '#app/lib/react-query/features/staff/staff-invitation.hooks.ts';
import { useFindStaffProfiles } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

type BulkInvitationsFormType = zod.infer<
	ReturnType<typeof getBulkCreateInvitationsSchema>
>;

const defaultValues: BulkInvitationsFormType = {
	invitations: [
		{
			email: '',
			profileIds: [],
		},
	],
};

const NewStaffInvitationsForm = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const actionsRef = useRef<HTMLDivElement>(null);
	const previousFieldsCount = useRef(1);
	const [serverErrors, setServerErrors] = useState<string[]>([]);

	const BulkInvitationsSchema = getBulkCreateInvitationsSchema(interZodClient);

	const form = useForm<BulkInvitationsFormType>({
		mode: 'onSubmit',
		resolver: zodResolver(BulkInvitationsSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: 'invitations',
	});

	// Auto-scroll to the actions when a new card is added
	useEffect(() => {
		if (fields.length > previousFieldsCount.current && actionsRef.current) {
			setTimeout(() => {
				actionsRef.current?.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'nearest',
				});
			}, 100);
		}
		previousFieldsCount.current = fields.length;
	}, [fields.length]);

	const { mutate: createInvitations, isPending } =
		useBulkCreateStaffInvitations({
			onSuccess: (data) => {
				setServerErrors([]);
				const createdCount = getUntypedNumber(data?.created, 0);
				toast.success(
					t('invitations-sent-successfully', { count: createdCount }),
				);
				void queryClient.invalidateQueries({
					queryKey: useFindStaffInvitations.getKey(),
				});
				form.reset();
				void router.push(FRONT_PATH_NAMES.staff.invitations.root);
			},
			onError: (error) => {
				const failure = toApiFailure(error);
				if (failure.kind === 'validation') {
					const errors = Object.values(failure.fieldErrors).flat();
					if (errors.length > 0) {
						setServerErrors(errors);
						return;
					}

					setServerErrors([
						getFailureMessage(failure, {
							fallback: 'Validation failed',
						}),
					]);
					return;
				}

				setServerErrors([getFailureMessage(failure)]);
			},
		});

	const onSubmit = form.handleSubmit(
		(data) => {
			logger.debug('Submitting bulk invitations', { data });
			setServerErrors([]); // Clear previous errors before submitting
			createInvitations(data);
		},
		(errors) => {
			logger.debug('Validation errors in bulk invitations form', { errors });
		},
	);

	const handleAddInvitation = () => {
		append({
			email: '',
			profileIds: [],
		});
	};

	const handleRemoveInvitation = (index: number) => {
		if (fields.length > 1) {
			remove(index);
		} else {
			toast.warning(t('at-least-one-invitation-required'));
		}
	};

	const renderActions = () => (
		<Box
			ref={actionsRef}
			sx={{
				gap: 2,
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: 'space-between',
				alignItems: 'center',
			}}
		>
			<Button
				variant="outlined"
				startIcon={<Iconify width={16} icon="mingcute:add-line" />}
				onClick={handleAddInvitation}
				disabled={isPending}
			>
				{_.capitalize(t('add-invitation'))}
			</Button>

			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('send-invitations'))}
			</Button>
		</Box>
	);

	return (
		<Form methods={form} onSubmit={onSubmit}>
			<Stack spacing={{ xs: 3, md: 5 }}>
				{serverErrors.length > 0 && (
					<Alert
						severity="error"
						onClose={() => setServerErrors([])}
						sx={{ lineHeight: 2 }}
					>
						{serverErrors.length === 1 ? (
							serverErrors[0]
						) : (
							<Box component="ul" sx={{ m: 0, pl: 2.5 }}>
								{serverErrors.map((error) => (
									<Box component="li" key={error}>
										{error}
									</Box>
								))}
							</Box>
						)}
					</Alert>
				)}
				{fields.map((field, index) => (
					<InvitationCard
						key={field.id}
						index={index}
						onRemove={() => handleRemoveInvitation(index)}
						canRemove={fields.length > 1}
						isPending={isPending}
					/>
				))}
				{renderActions()}
			</Stack>
		</Form>
	);
};

export default NewStaffInvitationsForm;

// ============================================================
// INVITATION CARD COMPONENT
// ============================================================

type InvitationCardProps = {
	index: number;
	onRemove: () => void;
	canRemove: boolean;
	isPending: boolean;
};

const InvitationCard = ({
	index,
	onRemove,
	canRemove,
	isPending,
}: InvitationCardProps) => {
	const { t } = useTranslate();
	const { control } = useFormContext<BulkInvitationsFormType>();
	const selectedProfileIds = useWatch({
		control,
		name: `invitations.${index}.profileIds`,
	}) as string[] | undefined;

	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);

	const profilesQuery = useFindStaffProfiles({
		variables: {
			limit: 20,
			sort: { id: 'name', order: 'asc' },
			q: deferredSearch || undefined,
		},
	});

	// Keep labels stable: once we learn a profile name for an ID, keep using it even if the
	// current search result page doesn't include that item anymore.
	const profileNameByIdRef = useRef(new Map<string, string>());
	const profileNameById = profileNameByIdRef.current;
	useEffect(() => {
		const profiles = profilesQuery.data?.data ?? [];
		for (const profile of profiles) {
			const id = _.toString(profile.id);
			const name = profile.name || '';
			if (id) {
				profileNameById.set(id, name);
			}
		}
	}, [profilesQuery.data, profileNameById]);

	const options = useMemo(() => {
		const profiles = profilesQuery.data?.data ?? [];
		const fetchedIds = _.map(profiles, (profile) =>
			_.toString(profile.id),
		).filter(Boolean);
		return _.uniq(fetchedIds.concat(selectedProfileIds ?? []));
	}, [profilesQuery.data, selectedProfileIds]);

	return (
		<Card>
			<CardHeader
				title={`${_.capitalize(t('invitation'))} #${index + 1}`}
				subheader={t('enter-email-and-select-profiles')}
				action={
					canRemove && (
						<IconButton
							onClick={onRemove}
							disabled={isPending}
							aria-label={t('remove-invitation')}
						>
							<Iconify icon="solar:trash-bin-trash-bold" />
						</IconButton>
					)
				}
				sx={{ mb: 3 }}
			/>

			<Divider />

			<Stack spacing={3} sx={{ p: 3 }}>
				<Field.Text
					name={`invitations.${index}.email`}
					label={t('email-address')}
					placeholder="example@domain.com"
					required
					disabled={isPending}
					slotProps={{
						inputLabel: { shrink: true },
					}}
				/>

				<Stack spacing={1.5}>
					<Field.Autocomplete
						name={`invitations.${index}.profileIds`}
						label={t('profiles')}
						placeholder={t('select-profiles')}
						multiple
						options={options}
						loading={profilesQuery.isFetching}
						// Disable client-side filtering; results are already filtered by the API.
						filterOptions={(x) => x}
						getOptionLabel={(option) => {
							return profileNameById.get(option) || option;
						}}
						// Keep search text stable when the input loses focus.
						clearOnBlur={false}
						inputValue={search}
						onInputChange={(_event, value, reason) => {
							// Only user typing (or explicit clear) should mutate the search state.
							// Ignore "reset" (commonly emitted on blur/selection) to avoid clearing.
							if (reason === 'input' || reason === 'clear') {
								setSearch(value);
							}
						}}
						disabled={isPending}
					/>
					<Typography variant="caption" sx={{ color: 'text.secondary' }}>
						{t('select-at-least-one-profile')}
					</Typography>
				</Stack>
			</Stack>
		</Card>
	);
};
