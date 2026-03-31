import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import { z } from 'zod';

import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/form-provider.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useInviteTenantUser } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

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
	const { closeDrawer } = useSectionPageWithDrawer();
	const handleClose = onClose ?? closeDrawer;

	const methods = useForm<InviteUserFormValues>({
		resolver: zodResolver(inviteUserSchema),
		defaultValues: {
			email: '',
			accountLevel: 'User',
		},
	});

	const { handleSubmit, reset } = methods;

	const { mutate: inviteUser, isPending } = useInviteTenantUser({
		// Component handles error display; skip global handler to avoid duplicate toast.
		meta: { skipGlobalErrorHandler: true },
		onSuccess: () => {
			toast.success(t('invitation-created-success'));
			reset();
			handleClose();
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
						InputProps={{
							startAdornment: (
								<Iconify
									icon="solar:letter-bold"
									sx={{ mr: 1, color: 'text.disabled' }}
								/>
							),
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
						}}
						InputProps={{
							startAdornment: (
								<Iconify
									icon="solar:user-id-bold"
									sx={{ mr: 1, color: 'text.disabled' }}
								/>
							),
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
