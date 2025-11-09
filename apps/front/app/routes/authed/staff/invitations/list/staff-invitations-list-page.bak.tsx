// import { zodResolver } from '@hookform/resolvers/zod';
// import ContentCopyIcon from '@mui/icons-material/ContentCopy';
// import PersonAddIcon from '@mui/icons-material/PersonAdd';
// import Box from '@mui/material/Box';
// import Button from '@mui/material/Button';
// import Card from '@mui/material/Card';
// import CardContent from '@mui/material/CardContent';
// import CardHeader from '@mui/material/CardHeader';
// import Chip from '@mui/material/Chip';
// import CircularProgress from '@mui/material/CircularProgress';
// import Dialog from '@mui/material/Dialog';
// import DialogContent from '@mui/material/DialogContent';
// import DialogTitle from '@mui/material/DialogTitle';
// import FormControl from '@mui/material/FormControl';
// import FormHelperText from '@mui/material/FormHelperText';
// import IconButton from '@mui/material/IconButton';
// import InputLabel from '@mui/material/InputLabel';
// import MenuItem from '@mui/material/MenuItem';
// import Select from '@mui/material/Select';
// import Stack from '@mui/material/Stack';
// import Table from '@mui/material/Table';
// import TableBody from '@mui/material/TableBody';
// import TableCell from '@mui/material/TableCell';
// import TableHead from '@mui/material/TableHead';
// import TableRow from '@mui/material/TableRow';
// import TextField from '@mui/material/TextField';
// import Typography from '@mui/material/Typography';
// import { APP_NAME } from '@org/shared/lib/constants';
// import { useQueryClient } from '@tanstack/react-query';
// import dayjs from 'dayjs';
// import relativeTime from 'dayjs/plugin/relativeTime';
// import { useState } from 'react';
// import { useForm } from 'react-hook-form';
// import { z } from 'zod';
// import { toast } from '@/front/components/snackbar';
// import { useTranslate } from '@/front/hooks/use-translate';
// import {
// 	useCreateInvitation,
// 	useFindStaffInvitations,
// 	useFindStaffProfiles,
// 	useRevokeInvitation,
// } from '@/front/lib/react-query/features/staff/staff-invitation.hooks';

// // Enable dayjs relative time plugin
// dayjs.extend(relativeTime);

// export const meta = (_: Route.MetaArgs) => {
// 	return [{ title: `Staff Invitations - ${APP_NAME}` }];
// };

// const createInvitationSchema = z.object({
// 	email: z.string().email('Invalid email address'),
// 	profileId: z.string().uuid('Invalid profile'),
// });

// type CreateInvitationForm = z.infer<typeof createInvitationSchema>;

// const StaffInvitationsListPage = () => {
// 	const { t } = useTranslate();
// 	const queryClient = useQueryClient();

// 	const [dialogOpen, setDialogOpen] = useState(false);
// 	const [invitationToken, setInvitationToken] = useState<string | null>(null);

// 	const form = useForm<CreateInvitationForm>({
// 		resolver: zodResolver(createInvitationSchema),
// 	});

// 	// Fetch staff profiles using react-query-kit
// 	const {
// 		data: profilesData,
// 		isLoading: profilesLoading,
// 		error: profilesError,
// 	} = useFindStaffProfiles();

// 	// Fetch staff invitations using react-query-kit
// 	const {
// 		data: invitationsData,
// 		isLoading: invitationsLoading,
// 		error: invitationsError,
// 	} = useFindStaffInvitations();

// 	// Create invitation mutation using react-query-kit
// 	const { mutate: createInvitation, isPending: isCreating } =
// 		useCreateInvitation({
// 			onSuccess: (data) => {
// 				queryClient.invalidateQueries({ queryKey: ['staff.invitations.get'] });
// 				setInvitationToken(data?.token || null);
// 				toast.success(t('staff-invitation-created-success'));
// 			},
// 			onError: (error) => {
// 				toast.error(t('errors-generic') || 'Failed to create invitation');
// 				logger.error('Create invitation error:', error);
// 			},
// 		});

// 	// Revoke invitation mutation using react-query-kit
// 	const { mutate: revokeInvitation, isPending: isRevoking } =
// 		useRevokeInvitation({
// 			onSuccess: () => {
// 				queryClient.invalidateQueries({ queryKey: ['staff.invitations.get'] });
// 				toast.success(t('staff-invitation-revoked'));
// 			},
// 			onError: (error) => {
// 				toast.error(t('errors-generic') || 'Failed to revoke invitation');
// 				logger.error('Revoke invitation error:', error);
// 			},
// 		});

// 	const profiles = profilesData?.profiles || [];
// 	const invitations = invitationsData?.invitations || [];

// 	const onSubmit = (data: CreateInvitationForm) => {
// 		createInvitation({
// 			email: data.email,
// 			profileId: data.profileId,
// 		});
// 	};

// 	const handleRevoke = (invitationId: string) => {
// 		revokeInvitation({ invitationId });
// 	};

// 	const copyInvitationLink = () => {
// 		if (!invitationToken) return;
// 		const invitationUrl = `${window.location.origin}/auth/accept-invitation/${invitationToken}`;
// 		navigator.clipboard.writeText(invitationUrl);
// 		toast.success(t('staff-invitation-link-copied'));
// 	};

// 	const getStatusBadge = (invitation: any) => {
// 		if (invitation.isAccepted) {
// 			return <Chip label={t('staff-accepted')} color="success" size="small" />;
// 		}
// 		if (invitation.isRevoked) {
// 			return <Chip label={t('staff-revoked')} color="error" size="small" />;
// 		}
// 		if (dayjs(invitation.expiresAt).isBefore(dayjs())) {
// 			return <Chip label={t('staff-expired')} color="default" size="small" />;
// 		}
// 		return <Chip label={t('staff-pending')} color="warning" size="small" />;
// 	};

// 	// Loading state
// 	if (profilesLoading || invitationsLoading) {
// 		return (
// 			<Box
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'center',
// 					alignItems: 'center',
// 					minHeight: '50vh',
// 				}}
// 			>
// 				<CircularProgress />
// 			</Box>
// 		);
// 	}

// 	// Error state
// 	if (profilesError || invitationsError) {
// 		return (
// 			<Box sx={{ maxWidth: 1200, mx: 'auto', py: 4 }}>
// 				<Typography color="error">{t('errors-generic')}</Typography>
// 			</Box>
// 		);
// 	}

// 	return (
// 		<Box sx={{ maxWidth: 1200, mx: 'auto', py: 4 }}>
// 			<Stack
// 				direction="row"
// 				justifyContent="space-between"
// 				alignItems="flex-start"
// 				sx={{ mb: 4 }}
// 			>
// 				<Box>
// 					<Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
// 						{t('staff-invitations')}
// 					</Typography>
// 					<Typography variant="body2" color="text.secondary">
// 						{t('staff-invitations-description')}
// 					</Typography>
// 				</Box>
// 				<Button
// 					variant="contained"
// 					startIcon={<PersonAddIcon />}
// 					onClick={() => setDialogOpen(true)}
// 				>
// 					{t('staff-invite-staff')}
// 				</Button>
// 			</Stack>

// 			<Dialog
// 				open={dialogOpen}
// 				onClose={() => setDialogOpen(false)}
// 				maxWidth="sm"
// 				fullWidth
// 			>
// 				<DialogTitle>{t('staff-invite-staff-member')}</DialogTitle>
// 				<Typography
// 					variant="body2"
// 					color="text.secondary"
// 					sx={{ px: 3, pb: 2 }}
// 				>
// 					{t('staff-invite-staff-description')}
// 				</Typography>
// 				<DialogContent>
// 					{invitationToken ? (
// 						<Stack spacing={2}>
// 							<Typography variant="body2" color="success.main">
// 								{t('staff-invitation-created-success')}
// 							</Typography>
// 							<Stack direction="row" spacing={1}>
// 								<TextField
// 									fullWidth
// 									value={`${window.location.origin}/auth/accept-invitation/${invitationToken}`}
// 									slotProps={{ htmlInput: { readOnly: true } }}
// 								/>
// 								<IconButton onClick={copyInvitationLink} color="primary">
// 									<ContentCopyIcon />
// 								</IconButton>
// 							</Stack>
// 							<Button
// 								fullWidth
// 								variant="contained"
// 								onClick={() => {
// 									setInvitationToken(null);
// 									setDialogOpen(false);
// 									form.reset();
// 								}}
// 							>
// 								{t('common-done')}
// 							</Button>
// 						</Stack>
// 					) : (
// 						<Box component="form" onSubmit={form.handleSubmit(onSubmit)}>
// 							<Stack spacing={3}>
// 								<TextField
// 									id="email"
// 									label={t('auth-email')}
// 									type="email"
// 									fullWidth
// 									{...form.register('email')}
// 									disabled={isCreating}
// 									error={!!form.formState.errors.email}
// 									helperText={form.formState.errors.email?.message}
// 								/>

// 								<FormControl
// 									fullWidth
// 									error={!!form.formState.errors.profileId}
// 									disabled={isCreating}
// 								>
// 									<InputLabel id="profile-label">{t('profile')}</InputLabel>
// 									<Select
// 										labelId="profile-label"
// 										label={t('profile')}
// 										{...form.register('profileId')}
// 										displayEmpty
// 									>
// 										<MenuItem value="">
// 											<Typography color="text.secondary">
// 												{t('staff-select-profile')}
// 											</Typography>
// 										</MenuItem>
// 										{profiles.map((profile: any) => (
// 											<MenuItem key={profile.id} value={profile.id}>
// 												{profile.name}
// 											</MenuItem>
// 										))}
// 									</Select>
// 									{form.formState.errors.profileId && (
// 										<FormHelperText>
// 											{form.formState.errors.profileId.message}
// 										</FormHelperText>
// 									)}
// 								</FormControl>

// 								<Button
// 									type="submit"
// 									fullWidth
// 									variant="contained"
// 									disabled={isCreating}
// 								>
// 									{isCreating
// 										? t('common-loading')
// 										: t('staff-send-invitation')}
// 								</Button>
// 							</Stack>
// 						</Box>
// 					)}
// 				</DialogContent>
// 			</Dialog>

// 			<Card>
// 				<CardHeader
// 					title={t('staff-invitation-history')}
// 					subheader={t('staff-invitation-history-description')}
// 				/>
// 				<CardContent>
// 					{invitations.length === 0 ? (
// 						<Typography color="text.secondary">
// 							{t('staff-no-invitations')}
// 						</Typography>
// 					) : (
// 						<Box sx={{ overflowX: 'auto' }}>
// 							<Table>
// 								<TableHead>
// 									<TableRow>
// 										<TableCell>{t('auth-email')}</TableCell>
// 										<TableCell>{t('profile')}</TableCell>
// 										<TableCell>{t('staff-invited-by')}</TableCell>
// 										<TableCell>{t('status')}</TableCell>
// 										<TableCell>{t('staff-expires')}</TableCell>
// 										<TableCell>{t('common-actions')}</TableCell>
// 									</TableRow>
// 								</TableHead>
// 								<TableBody>
// 									{invitations.map((invitation: any) => (
// 										<TableRow key={invitation.id}>
// 											<TableCell>{invitation.email}</TableCell>
// 											<TableCell>{invitation.profileName}</TableCell>
// 											<TableCell>{invitation.invitedByName}</TableCell>
// 											<TableCell>{getStatusBadge(invitation)}</TableCell>
// 											<TableCell>
// 												{dayjs(invitation.expiresAt).fromNow()}
// 											</TableCell>
// 											<TableCell>
// 												{!invitation.isAccepted && !invitation.isRevoked && (
// 													<Button
// 														variant="outlined"
// 														size="small"
// 														onClick={() => handleRevoke(invitation.id)}
// 														disabled={isRevoking}
// 													>
// 														{t('staff-revoke')}
// 													</Button>
// 												)}
// 											</TableCell>
// 										</TableRow>
// 									))}
// 								</TableBody>
// 							</Table>
// 						</Box>
// 					)}
// 				</CardContent>
// 			</Card>
// 		</Box>
// 	);
// };

// export default StaffInvitationsListPage;
