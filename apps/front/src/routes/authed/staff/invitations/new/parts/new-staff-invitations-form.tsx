import { zodResolver } from '@hookform/resolvers/zod';
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
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z as zod } from 'zod';

import { Form } from '@/front/components/hook-form';
import { Field } from '@/front/components/hook-form/fields';
import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';
import {
	useBulkCreateInvitations,
	useFindStaffInvitations,
} from '@/front/lib/react-query/features/staff/staff-invitation.hooks';
import { useFindStaffProfiles } from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { interZodClient } from '@/front/lib/zod/zod.client';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getBulkCreateInvitationsSchema } from '@/shared/validations/invitation.validations';

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

	const profilesQuery = useFindStaffProfiles({
		variables: {},
	});

	const { mutate: createInvitations, isPending } = useBulkCreateInvitations({
		onSuccess: (data) => {
			const createdCount = getUntypedNumber(data?.created, 0);
			toast.success(
				t('invitations-sent-successfully', {
					count: createdCount,
					defaultValue: `${createdCount} invitation(s) sent successfully`,
				}),
			);
			queryClient.invalidateQueries({
				queryKey: useFindStaffInvitations.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.invitations.root);
		},
		// Error toasts handled by global handler automatically
	});

	const onSubmit = form.handleSubmit(
		(data) => {
			logger.debug('Submitting bulk invitations', { data });
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
				startIcon={<Iconify icon="mingcute:add-line" />}
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
			<Stack
				spacing={{ xs: 3, md: 5 }}
				sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}
			>
				<QueryDisplay query={profilesQuery}>
					{({ data }) => {
						const profiles = _.get(data, 'data', []);
						const profileOptions = _.map(profiles, (profile) => ({
							id: _.toString(profile.id),
							name: profile.name || '',
						}));

						return (
							<>
								{fields.map((field, index) => (
									<InvitationCard
										key={field.id}
										index={index}
										onRemove={() => handleRemoveInvitation(index)}
										profileOptions={profileOptions}
										canRemove={fields.length > 1}
										isPending={isPending}
									/>
								))}
							</>
						);
					}}
				</QueryDisplay>
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
	profileOptions: Array<{ id: string; name: string }>;
	canRemove: boolean;
	isPending: boolean;
};

const InvitationCard = ({
	index,
	onRemove,
	profileOptions,
	canRemove,
	isPending,
}: InvitationCardProps) => {
	const { t } = useTranslate();

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
						options={profileOptions.map((p) => p.id)}
						getOptionLabel={(option) => {
							const profile = profileOptions.find((p) => p.id === option);
							return profile?.name || option;
						}}
						disabled={isPending}
						slotProps={{
							chip: {
								variant: 'soft',
								color: 'primary',
							},
						}}
					/>
					<Typography variant="caption" sx={{ color: 'text.secondary' }}>
						{t('select-at-least-one-profile')}
					</Typography>
				</Stack>
			</Stack>
		</Card>
	);
};
