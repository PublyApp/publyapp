import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import values from 'lodash/values';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getUpdateStaffUserSchema } from '@org/shared-ts/validations/staff-user.validations';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindStaffUser,
	useGetStaffUserById,
	useReactivateStaffUser,
	useSuspendStaffUser,
	useUpdateStaffUser,
	useUpdateStaffUserEmail,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime } from '#app/utils/format-time.ts';

const USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
	Inactive: 'default',
	Pending: 'default',
} as const;

type UpdateUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateStaffUserSchema>>
>;

export type StaffUserUpdateData = {
	id: string;
	// ===== optional fields =====
	firstName?: string;
	lastName?: string;
	accountLevel?: string;
	email?: string;
	status?: string;
	avatar?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

const ACCOUNT_LEVEL_OPTIONS: AccountLevel[] = values(ACCOUNT_LEVEL_ENUM);

const StaffUserUpdateForm = ({
	currentUser,
	children,
}: {
	currentUser: StaffUserUpdateData;
	children?: ReactNode;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const UpdateUserSchema = getUpdateStaffUserSchema(interZodClient);

	let _evalUatedAccountLevel: AccountLevel | undefined;
	if (
		!ACCOUNT_LEVEL_OPTIONS.includes(currentUser.accountLevel as AccountLevel)
	) {
		_evalUatedAccountLevel = undefined;
	} else {
		_evalUatedAccountLevel = currentUser.accountLevel as AccountLevel;
	}

	// logger.debug('currentUser', currentUser);

	const form = useForm<UpdateUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateUserSchema),
		values: {
			id: currentUser.id,
			firstName: currentUser.firstName,
			lastName: currentUser.lastName,
			avatar: currentUser.avatar,
			accountLevel: _evalUatedAccountLevel,
		},
	});

	const { mutate: updateStaffUser, isPending: isUpdating } = useUpdateStaffUser(
		{
			onSuccess: () => {
				form.reset();
				toast.success(
					capitalize(
						t('item-update-success-message', { item: t('staff-user') }),
					),
				);
				queryClient.invalidateQueries({
					queryKey: useFindStaffUser.getKey(),
				});
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserById.getKey({ userId: currentUser.id }),
				});
				// Stay on the details page: this is an "edit in place" UX.
			},
			// Error toasts handled by global handler automatically
		},
	);

	return (
		<Form
			methods={form}
			onSubmit={form.handleSubmit((data) => {
				// Only send dirty fields (PATCH semantics), keep the request minimal.
				// This avoids re-sending unchanged values and makes partial edits safer.
				const dirtyFields = form.formState.dirtyFields;
				const payload: Record<string, unknown> = { id: data.id };

				const addIfDirty = <K extends keyof UpdateUserSchemaType>(key: K) => {
					if (dirtyFields[key]) {
						payload[key] = data[key];
					}
				};

				addIfDirty('firstName');
				addIfDirty('lastName');
				addIfDirty('accountLevel');
				addIfDirty('avatar');

				updateStaffUser(payload as unknown as UpdateUserSchemaType);
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
					{/* Left sidebar: avatar + status (mirrors tenant details general layout). */}
					<Card sx={{ pt: 8, pb: 5, px: 3, minWidth: 0, overflow: 'hidden' }}>
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
											{t('uploads-not-supported-yet')}
											<br /> {t('max-size', { size: fData(mbToBytes(3)) })}
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

						<Divider sx={{ my: 3, borderStyle: 'dashed' }} />

						{/* Read-only metadata: keep parity with tenant details general sidebar. */}
						<Stack spacing={2} sx={{ px: 2 }}>
							<InfoRow
								icon="solar:letter-bold"
								label={t('email-address')}
								value={currentUser.email ?? '—'}
							/>
							<InfoRow
								icon="solar:shield-user-bold"
								label={t('level')}
								value={currentUser.accountLevel ?? '—'}
							/>
							<InfoRow
								icon="solar:calendar-date-bold"
								label={t('created-at')}
								value={
									currentUser.createdAt ? fDateTime(currentUser.createdAt) : '—'
								}
							/>
							<InfoRow
								icon="solar:pen-bold"
								label={t('updated-at')}
								value={
									currentUser.updatedAt ? fDateTime(currentUser.updatedAt) : '—'
								}
							/>
						</Stack>
					</Card>

					{/* Right content: editable form (safe fields only) + optional extra sections (profiles, etc). */}
					<Stack spacing={3} sx={{ minWidth: 0 }}>
						<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
							<Typography variant="h4" sx={{ mb: 3 }}>
								{t('staff-user-details')}
							</Typography>

							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
								}}
							>
								{/* Email is intentionally not editable here. See Danger Zone for the dedicated flow. */}
								<Field.Text name="lastName" label={t('lastname')} required />
								<Field.Text name="firstName" label={t('firstname')} />

								<Field.Select name="accountLevel" label={t('level')} required>
									{ACCOUNT_LEVEL_OPTIONS.map((option) => (
										<MenuItem key={option} value={option}>
											{option}
										</MenuItem>
									))}
								</Field.Select>
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

						{children}

						<DangerZoneCard
							userId={currentUser.id}
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

export default StaffUserUpdateForm;

const InfoRow = ({
	icon,
	label,
	value,
}: {
	icon: IconifyName;
	label: string;
	value: string;
}) => (
	// Small "label + value" row used in the details sidebar (icon + 2 text lines).
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

const DangerZoneCard = ({
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

	// High-impact actions live here (explicit + confirm dialogs):
	// - Suspend/Reactivate is lifecycle (status) control.
	// - Email change is a high-risk identity operation (sign-in impact).

	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [emailDialogOpen, setEmailDialogOpen] = useState(false);

	const [newEmail, setNewEmail] = useState('');
	const [confirmEmail, setConfirmEmail] = useState('');

	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;

	const emailMismatch = useMemo(() => {
		if (!emailDialogOpen) return false;
		return (
			newEmail.length > 0 &&
			confirmEmail.length > 0 &&
			newEmail !== confirmEmail
		);
	}, [confirmEmail, emailDialogOpen, newEmail]);

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendStaffUser({
		meta: { successMessage: 'staff-user-suspended-success' },
		onSuccess: () => {
			setSuspendDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useGetStaffUserById.getKey({ userId }),
			});
			queryClient.invalidateQueries({ queryKey: useFindStaffUser.getKey() });
		},
	});

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateStaffUser({
			meta: { successMessage: 'staff-user-reactivated-success' },
			onSuccess: () => {
				setReactivateDialogOpen(false);
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserById.getKey({ userId }),
				});
				queryClient.invalidateQueries({ queryKey: useFindStaffUser.getKey() });
			},
		});

	const { mutate: updateEmail, isPending: isUpdatingEmail } =
		useUpdateStaffUserEmail({
			meta: { successMessage: 'staff-user-email-updated-success' },
			onSuccess: () => {
				setEmailDialogOpen(false);
				setNewEmail('');
				setConfirmEmail('');
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserById.getKey({ userId }),
				});
				queryClient.invalidateQueries({ queryKey: useFindStaffUser.getKey() });
			},
		});

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
				{t('danger-zone-staff-user-description')}
			</Typography>

			<Stack direction="row" spacing={2}>
				{!isSuspended ? (
					<Button
						variant="outlined"
						color="warning"
						onClick={() => setSuspendDialogOpen(true)}
					>
						{t('suspend')}
					</Button>
				) : (
					<Button
						variant="outlined"
						color="success"
						onClick={() => setReactivateDialogOpen(true)}
					>
						{t('reactivate')}
					</Button>
				)}

				<Button
					variant="outlined"
					color="error"
					onClick={() => {
						setNewEmail('');
						setConfirmEmail('');
						setEmailDialogOpen(true);
					}}
				>
					{t('change-email')}
				</Button>
			</Stack>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-staff-user')}
				content={t('suspend-staff-user-confirm')}
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
				onClose={() => setReactivateDialogOpen(false)}
				title={t('reactivate-staff-user')}
				content={t('reactivate-staff-user-confirm')}
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
				onClose={() => setEmailDialogOpen(false)}
				fullWidth
				maxWidth="sm"
			>
				<DialogTitle>{t('change-email')}</DialogTitle>
				<DialogContent sx={{ pt: 1 }}>
					<Stack spacing={2} sx={{ mt: 1 }}>
						<TextField
							label={t('current-email')}
							value={email ?? ''}
							slotProps={{ input: { readOnly: true } }}
						/>
						<TextField
							label={t('new-email')}
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
						/>
						<TextField
							label={t('confirm-new-email')}
							value={confirmEmail}
							onChange={(e) => setConfirmEmail(e.target.value)}
							error={emailMismatch}
							helperText={emailMismatch ? t('emails-do-not-match') : ' '}
						/>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button variant="outlined" onClick={() => setEmailDialogOpen(false)}>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						color="error"
						disabled={
							!newEmail || !confirmEmail || emailMismatch || isUpdatingEmail
						}
						loading={isUpdatingEmail}
						onClick={() => updateEmail({ userId, email: newEmail })}
					>
						{t('confirm')}
					</Button>
				</DialogActions>
			</Dialog>
		</Card>
	);
};
