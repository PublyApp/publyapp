import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import { useEffect, useMemo, useReducer } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import type zod from 'zod';

import { USER_STATUS_ENUM } from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getEmailFieldSchema } from '@org/shared-ts/validations/auth.validations';
import { getUpdateTenantUserIdentitySchema } from '@org/shared-ts/validations/tenant-user.validations';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { withFormValidation } from '#app/lib/api-failure/with-form-validation.ts';
import {
	useFindTenantUserCompanies,
	useFindTenantUsers,
	useGetTenantUserById,
	useReactivateTenantUserIdentity,
	useSuspendTenantUserIdentity,
	useUpdateTenantUserEmail,
	useUpdateTenantUserIdentity,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime, type DatePickerFormat } from '#app/utils/format-time.ts';

const USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
} as const;
const dangerZoneInitialState = {
	suspendDialogOpen: false,
	reactivateDialogOpen: false,
	emailDialogOpen: false,
};

type TenantUserDangerZoneState = typeof dangerZoneInitialState;

type TenantUserDangerZoneAction =
	| { type: 'openSuspendDialog' }
	| { type: 'closeSuspendDialog' }
	| { type: 'openReactivateDialog' }
	| { type: 'closeReactivateDialog' }
	| { type: 'openEmailDialog' }
	| { type: 'closeEmailDialog' }
	| { type: 'resetEmailDialog' };

const tenantUserDangerZoneReducer = (
	state: TenantUserDangerZoneState,
	action: TenantUserDangerZoneAction,
): TenantUserDangerZoneState => {
	if (action.type === 'openSuspendDialog') {
		return { ...state, suspendDialogOpen: true };
	}

	if (action.type === 'closeSuspendDialog') {
		return { ...state, suspendDialogOpen: false };
	}

	if (action.type === 'openReactivateDialog') {
		return { ...state, reactivateDialogOpen: true };
	}

	if (action.type === 'closeReactivateDialog') {
		return { ...state, reactivateDialogOpen: false };
	}

	if (action.type === 'openEmailDialog') {
		return {
			...state,
			emailDialogOpen: true,
		};
	}

	if (action.type === 'closeEmailDialog') {
		return { ...state, emailDialogOpen: false };
	}

	if (action.type === 'resetEmailDialog') {
		return {
			...state,
			emailDialogOpen: false,
		};
	}

	return state;
};

type UpdateTenantUserIdentitySchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateTenantUserIdentitySchema>>
>;

type ChangeTenantUserEmailFormValues = {
	currentEmail: string;
	newEmail: string;
	confirmEmail: string;
};

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

						<TenantUserDangerZoneCard
							userId={userId}
							status={currentUser.status ?? null}
							email={currentUser.email ?? null}
							queryClient={queryClient}
						/>
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

const TenantUserDangerZoneCard = ({
	userId,
	status,
	email,
	queryClient,
}: {
	userId: string;
	status: string | null;
	email: string | null;
	queryClient: ReturnType<typeof useQueryClient>;
}) => {
	const { t } = useTranslate();
	const [state, dispatch] = useReducer(
		tenantUserDangerZoneReducer,
		dangerZoneInitialState,
	);
	const { suspendDialogOpen, reactivateDialogOpen, emailDialogOpen } = state;

	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const emailSchema = useMemo(
		() =>
			interZodClient
				.object({
					currentEmail: interZodClient.string(),
					newEmail: getEmailFieldSchema(interZodClient).trim(),
					confirmEmail: getEmailFieldSchema(interZodClient).trim(),
				})
				.refine((data) => data.newEmail === data.confirmEmail, {
					message: t('emails-do-not-match'),
					path: ['confirmEmail'],
				})
				.refine(
					(data) =>
						!email ||
						data.newEmail.toLowerCase() !== email.trim().toLowerCase(),
					{
						message: t('email-must-be-different'),
						path: ['newEmail'],
					},
				),
		[email, t],
	);
	const emailForm = useForm<ChangeTenantUserEmailFormValues>({
		mode: 'onSubmit',
		resolver: zodResolver(emailSchema),
		defaultValues: {
			currentEmail: email ?? '',
			newEmail: '',
			confirmEmail: '',
		},
	});

	useEffect(() => {
		if (!emailDialogOpen) {
			return;
		}

		emailForm.reset({
			currentEmail: email ?? '',
			newEmail: '',
			confirmEmail: '',
		});
	}, [email, emailDialogOpen, emailForm]);

	const { mutate: suspendUser, isPending: isSuspending } =
		useSuspendTenantUserIdentity({
			onSuccess: async () => {
				toast.success(t('tenant-user-globally-suspended-success'));
				dispatch({ type: 'closeSuspendDialog' });
				await invalidateTenantUserIdentityQueries({ queryClient, userId });
			},
		});

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUserIdentity({
			onSuccess: async () => {
				toast.success(t('tenant-user-globally-reactivated-success'));
				dispatch({ type: 'closeReactivateDialog' });
				await invalidateTenantUserIdentityQueries({ queryClient, userId });
			},
		});

	const { mutate: updateEmail, isPending: isUpdatingEmail } =
		useUpdateTenantUserEmail(
			withFormValidation(emailForm.setError, {
				fieldMapping: {
					email: 'newEmail',
				},
				onSuccess: async () => {
					toast.success(t('tenant-user-email-updated-success'));
					dispatch({ type: 'resetEmailDialog' });
					await invalidateTenantUserIdentityQueries({ queryClient, userId });
				},
			}),
		);

	return (
		<Card
			sx={{
				p: 3,
				minWidth: 0,
				overflow: 'hidden',
				border: '1px solid',
				borderColor: 'error.main',
				bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
			}}
		>
			<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
				{t('danger-zone')}
			</Typography>
			<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
				{t('danger-zone-tenant-user-identity-description')}
			</Typography>

			<Stack direction="row" spacing={2}>
				{!isSuspended ? (
					<Button
						variant="outlined"
						color="warning"
						onClick={() => dispatch({ type: 'openSuspendDialog' })}
					>
						{t('suspend')}
					</Button>
				) : (
					<Button
						variant="outlined"
						color="success"
						onClick={() => dispatch({ type: 'openReactivateDialog' })}
					>
						{t('reactivate')}
					</Button>
				)}

				<Button
					variant="outlined"
					color="error"
					onClick={() => dispatch({ type: 'openEmailDialog' })}
				>
					{t('change-email')}
				</Button>
			</Stack>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => dispatch({ type: 'closeSuspendDialog' })}
				title={t('suspend-tenant-user-identity')}
				content={t('suspend-tenant-user-identity-confirm')}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendUser({ userId })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => dispatch({ type: 'closeReactivateDialog' })}
				title={t('reactivate-tenant-user-identity')}
				content={t('reactivate-tenant-user-identity-confirm')}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateUser({ userId })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<Dialog
				open={emailDialogOpen}
				onClose={() => dispatch({ type: 'closeEmailDialog' })}
				fullWidth
				maxWidth="sm"
			>
				<DialogTitle>{t('change-email')}</DialogTitle>
				<Form
					methods={emailForm}
					onSubmit={emailForm.handleSubmit((data) => {
						updateEmail({ userId, email: data.newEmail.trim() });
					})}
				>
					<DialogContent sx={{ pt: 1 }}>
						<Stack spacing={2} sx={{ mt: 1 }}>
							<Field.Text
								name="currentEmail"
								label={t('current-email')}
								slotProps={{ input: { readOnly: true } }}
							/>
							<Field.Text name="newEmail" label={t('new-email')} required />
							<Field.Text
								name="confirmEmail"
								label={t('confirm-new-email')}
								required
							/>
						</Stack>
					</DialogContent>
					<DialogActions>
						<Button
							variant="outlined"
							onClick={() => dispatch({ type: 'closeEmailDialog' })}
						>
							{t('cancel')}
						</Button>
						<Button
							type="submit"
							variant="contained"
							color="error"
							disabled={!emailForm.formState.isDirty || isUpdatingEmail}
							loading={isUpdatingEmail}
						>
							{t('confirm')}
						</Button>
					</DialogActions>
				</Form>
			</Dialog>
		</Card>
	);
};

const invalidateTenantUserIdentityQueries = async ({
	queryClient,
	userId,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	userId: string;
}) => {
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: useGetTenantUserById.getKey({ userId }),
		}),
		queryClient.invalidateQueries({
			queryKey: useFindTenantUserCompanies.getKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey(),
		}),
	]);
};
