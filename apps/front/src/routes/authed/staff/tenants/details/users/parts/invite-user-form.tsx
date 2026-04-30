import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/form-provider.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useFindTenantInvitations,
	useInviteTenantUser,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

// ----------------------------------------------------------------------

const inviteUserSchema = z.object({
	email: z.string().email('Invalid email address'),
	accountLevel: z.enum(['Admin', 'User']),
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

// ----------------------------------------------------------------------

const ACCOUNT_LEVEL_OPTIONS = [
	{ value: 'Admin', label: 'Admin' },
	{ value: 'User', label: 'User' },
];

// ----------------------------------------------------------------------

export const InviteUserForm = ({ onClose }: { onClose?: () => void }) => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { closeDrawer } = useSectionPageWithDrawer();
	const handleClose = onClose ?? closeDrawer;
	const [showSuccess, setShowSuccess] = useState(false);

	const methods = useForm<InviteUserFormValues>({
		resolver: zodResolver(inviteUserSchema),
		defaultValues: {
			email: '',
			accountLevel: 'User',
		},
	});

	const { handleSubmit, reset } = methods;

	const invitationsPath = tenantId
		? FRONT_PATH_NAMES.staff.tenants.details(tenantId).tabs.invitations
		: '';

	const { mutate: inviteUser, isPending } = useInviteTenantUser({
		meta: { skipGlobalErrorHandler: true },
		onSuccess: async () => {
			if (tenantId) {
				await queryClient.invalidateQueries({
					queryKey: useFindTenantInvitations.getKey({ tenantId }),
				});
			}
			toast.success(t('invitation-created-success'));
			setShowSuccess(true);
			reset();
		},
		onError: (error) => {
			const failure = toApiFailure(error);
			const message = getFailureMessage(failure, {
				fallback: t('invitation-created-error'),
			});
			toast.error(message);
		},
	});

	const onSubmit = handleSubmit(async (data) => {
		if (!tenantId) return;

		inviteUser({
			tenantId,
			email: data.email,
			accountLevel: data.accountLevel,
		});
	});

	const handleViewInvitations = () => {
		handleClose();
		if (invitationsPath) {
			navigate(invitationsPath);
		}
	};

	const handleCloseAndReset = () => {
		setShowSuccess(false);
		handleClose();
	};

	// Show success state with CTA
	if (showSuccess) {
		return (
			<Box
				sx={{
					p: 3,
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
					paddingTop: 30,
				}}
			>
				<Box
					sx={{
						width: 80,
						height: 80,
						borderRadius: '50%',
						bgcolor: 'success.lighter',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						mb: 3,
					}}
				>
					<Iconify
						icon="solar:check-circle-bold"
						width={40}
						sx={{ color: 'success.main' }}
					/>
				</Box>
				<Typography variant="h5" sx={{ mb: 1 }}>
					{t('invitation-sent')}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
					{t('invitation-success-description')}
				</Typography>
				<Stack direction="column" spacing={2} sx={{ width: '100%' }}>
					<Button
						variant="contained"
						onClick={handleViewInvitations}
						startIcon={<Iconify icon="solar:letter-bold" />}
					>
						{t('view-invitations')}
					</Button>
					<Link
						component="button"
						type="button"
						onClick={handleCloseAndReset}
						sx={{ typography: 'body2', color: 'text.secondary' }}
					>
						{t('close')}
					</Link>
				</Stack>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				p: 3,
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={{ mb: 3 }}
			>
				<Typography variant="h3">{_.capitalize(t('invite-user'))}</Typography>
			</Stack>

			<Form methods={methods} onSubmit={onSubmit}>
				<Stack spacing={3} sx={{ flex: 1 }}>
					<Field.Text
						name="email"
						label={t('email')}
						placeholder="user@example.com"
						slotProps={{
							input: {
								startAdornment: (
									<Iconify
										icon="solar:letter-bold"
										sx={{ mr: 1, color: 'text.disabled' }}
									/>
								),
							},
						}}
					/>

					<Field.Select
						name="accountLevel"
						label={t('role')}
						slotProps={{
							select: {
								MenuProps: {
									slotProps: {
										root: {
											sx: (theme) => {
												return {
													zIndex: theme.zIndex.modal + 2,
												};
											},
										},
										paper: {
											sx: (theme) => {
												return {
													zIndex: theme.zIndex.modal + 2,
												};
											},
										},
									},
								},
							},
							input: {
								startAdornment: (
									<Iconify
										icon="solar:user-id-bold"
										sx={{ mr: 1, color: 'text.disabled' }}
									/>
								),
							},
						}}
					>
						{ACCOUNT_LEVEL_OPTIONS.map((option) => (
							<MenuItem key={option.value} value={option.value}>
								{option.label}
							</MenuItem>
						))}
					</Field.Select>

					<Box sx={{ flex: 1 }} />

					<Stack direction="row" gap={2} justifyContent="flex-end">
						<Button
							type="submit"
							variant="contained"
							loading={isPending}
							startIcon={<Iconify icon="solar:letter-bold" />}
						>
							{_.capitalize(t('send-invitation'))}
						</Button>
					</Stack>
				</Stack>
			</Form>
		</Box>
	);
};
