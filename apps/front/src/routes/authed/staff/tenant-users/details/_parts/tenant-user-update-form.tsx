import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import type zod from 'zod';

import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getUpdateTenantUserIdentitySchema } from '@org/shared-ts/validations/tenant-user.validations';

import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindTenantUsers,
	useGetTenantUserById,
	useUpdateTenantUserIdentity,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime, type DatePickerFormat } from '#app/utils/format-time.ts';

const USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
} as const;

type UpdateTenantUserIdentitySchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateTenantUserIdentitySchema>>
>;

export type TenantUserUpdateData = {
	firstName?: string;
	lastName?: string;
	email?: string;
	status?: string;
	avatar?: string;
	companyCount?: number;
	createdAt?: DatePickerFormat;
	updatedAt?: DatePickerFormat;
};

const TenantUserUpdateForm = ({
	currentUser,
}: {
	currentUser: TenantUserUpdateData;
}) => {
	const { userId = '' } = useParams();
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const UpdateTenantUserIdentitySchema =
		getUpdateTenantUserIdentitySchema(interZodClient);

	const form = useForm<UpdateTenantUserIdentitySchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateTenantUserIdentitySchema),
		values: {
			id: userId,
			firstName: currentUser.firstName,
			lastName: currentUser.lastName,
			avatar: currentUser.avatar,
		},
	});

	const { mutate: updateTenantUserIdentity, isPending: isUpdating } =
		useUpdateTenantUserIdentity({
			onSuccess: () => {
				form.reset();
				toast.success(
					capitalize(
						t('item-update-success-message', { item: t('tenant-user') }),
					),
				);
				void queryClient.invalidateQueries({
					queryKey: useGetTenantUserById.getKey({ userId }),
				});
				void queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey(),
				});
			},
		});

	return (
		<Form
			methods={form}
			onSubmit={form.handleSubmit((data) => {
				const dirtyFields = form.formState.dirtyFields;
				const payload: {
					userId: string;
					firstName?: string | null;
					lastName?: string | null;
					avatarUrl?: string | null;
				} = {
					userId: data.id,
				};

				if (dirtyFields.firstName) {
					payload.firstName = data.firstName ?? null;
				}

				if (dirtyFields.lastName) {
					payload.lastName = data.lastName ?? null;
				}

				if (dirtyFields.avatar && typeof data.avatar === 'string') {
					payload.avatarUrl = data.avatar;
				}

				updateTenantUserIdentity(payload);
			})}
		>
			<Box sx={{ containerType: 'inline-size' }}>
				<Box
					sx={{
						display: 'grid',
						gap: 3,
						gridTemplateColumns: '1fr',
						'@container (min-width: 837px)': {
							gridTemplateColumns: '1fr 2fr',
						},
					}}
				>
					<Card
						sx={{
							pt: 8,
							pb: 5,
							px: 3,
							minWidth: 0,
							height: 'fit-content',
							overflow: 'hidden',
						}}
					>
						<Box sx={{ textAlign: 'center' }}>
							<Box sx={{ mb: 3 }}>
								<Field.UploadAvatar
									name="avatar"
									maxSize={mbToBytes(3)}
									disabled
									helperText={
										<Typography
											variant="caption"
											sx={{
												mt: 3,
												mx: 'auto',
												display: 'block',
												textAlign: 'center',
												color: 'text.disabled',
											}}
										>
											<Stack component="span">
												<Box component="span">
													{t('uploads-not-supported-yet')}
												</Box>
												<Box component="span">
													{t('max-size', { size: fData(mbToBytes(3)) })}
												</Box>
											</Stack>
										</Typography>
									}
								/>
							</Box>

							<StatusChip
								status={currentUser.status ?? null}
								unknownLabel={capitalize(t('unknown'))}
								colorMap={USER_STATUS_COLOR_MAP}
								sx={{ mt: 1 }}
							/>
						</Box>
					</Card>

					<Stack spacing={3} sx={{ minWidth: 0 }}>
						<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
							<Typography variant="h4" sx={{ mb: 3 }}>
								{t('tenant-user-details')}
							</Typography>

							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
								}}
							>
								<Field.Text name="lastName" label={t('lastname')} required />
								<Field.Text name="firstName" label={t('firstname')} />
							</Box>

							<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Button
									type="submit"
									variant="contained"
									loading={form.formState.isSubmitting || isUpdating}
									disabled={!form.formState.isDirty || isUpdating}
								>
									{t('save-changes')}
								</Button>
							</Stack>
						</Card>

						<TenantUserMetadataCard currentUser={currentUser} />
					</Stack>
				</Box>
			</Box>
		</Form>
	);
};

export default TenantUserUpdateForm;

const TenantUserMetadataCard = ({
	currentUser,
}: {
	currentUser: TenantUserUpdateData;
}) => {
	const { t } = useTranslate();

	return (
		<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
			<Typography variant="h5" sx={{ mb: 2 }}>
				{t('metadata')}
			</Typography>

			<Box
				sx={{
					display: 'grid',
					gap: 2,
					gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
				}}
			>
				<InfoRow
					icon="solar:letter-bold"
					label={t('email-address')}
					value={currentUser.email ?? '-'}
				/>
				<InfoRow
					icon="solar:buildings-bold"
					label={capitalize(t('companies'))}
					value={toStr(currentUser.companyCount ?? 0)}
				/>
				<InfoRow
					icon="solar:calendar-date-bold"
					label={t('created-at')}
					value={currentUser.createdAt ? fDateTime(currentUser.createdAt) : '-'}
				/>
				<InfoRow
					icon="solar:pen-bold"
					label={t('updated-at')}
					value={currentUser.updatedAt ? fDateTime(currentUser.updatedAt) : '-'}
				/>
			</Box>
		</Card>
	);
};

const InfoRow = ({
	icon,
	label,
	value,
}: {
	icon: IconifyName;
	label: string;
	value: string;
}) => (
	<Box
		sx={{
			display: 'flex',
			alignItems: 'center',
			gap: 1.5,
			minWidth: 0,
			width: '100%',
		}}
	>
		<Iconify
			icon={icon}
			width={20}
			sx={{ color: 'text.secondary', flexShrink: 0 }}
		/>
		<Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{label}
			</Typography>
			<Tooltip title={value} placement="top-start">
				<Typography
					variant="body2"
					sx={{
						fontWeight: 500,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{value}
				</Typography>
			</Tooltip>
		</Box>
	</Box>
);
