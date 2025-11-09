import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { isServer } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import type { Route } from './+types/staff-invitations-list-page';
import NewInvitationButton from './parts/new-invitation-button';
import StaffInvitationsTable from './parts/staff-invitations-table';

// Enable dayjs relative time plugin
dayjs.extend(relativeTime);

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('staff-invitations'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

// type CreateInvitationForm = z.infer<typeof createInvitationSchema>;

const StaffInvitationsListPage = () => {
	const { t } = useTranslate();
	// const queryClient = useQueryClient();

	// const [invitationToken, setInvitationToken] = useState<string | null>(null);

	// Fetch staff profiles using react-query-kit
	// const {
	// 	data: profilesData,
	// 	isLoading: profilesLoading,
	// 	error: profilesError,
	// } = useFindStaffProfiles();

	// Fetch staff invitations using react-query-kit
	// const {
	// 	data: invitationsData,
	// 	isLoading: invitationsLoading,
	// 	error: invitationsError,
	// } = useFindStaffInvitations();

	// Create invitation mutation using react-query-kit
	// const { mutate: createInvitation, isPending: isCreating } =
	// 	useCreateInvitation({
	// 		onSuccess: (data) => {
	// 			queryClient.invalidateQueries({ queryKey: ['staff.invitations.get'] });
	// 			setInvitationToken(data?.token || null);
	// 			toast.success(t('staff-invitation-created-success'));
	// 		},
	// 		onError: (error) => {
	// 			toast.error(t('errors-generic') || 'Failed to create invitation');
	// 			logger.error('Create invitation error:', error);
	// 		},
	// 	});

	// Revoke invitation mutation using react-query-kit
	// const { mutate: revokeInvitation, isPending: isRevoking } =
	// 	useRevokeInvitation({
	// 		onSuccess: () => {
	// 			queryClient.invalidateQueries({ queryKey: ['staff.invitations.get'] });
	// 			toast.success(t('staff-invitation-revoked'));
	// 		},
	// 		onError: (error) => {
	// 			toast.error(t('errors-generic') || 'Failed to revoke invitation');
	// 			logger.error('Revoke invitation error:', error);
	// 		},
	// 	});

	// const profiles = profilesData?.profiles || [];
	// const invitations = invitationsData?.invitations || [];

	// const onSubmit = (data: CreateInvitationForm) => {
	// 	createInvitation({
	// 		email: data.email,
	// 		profileId: data.profileId,
	// 	});
	// };

	// const handleRevoke = (invitationId: string) => {
	// 	revokeInvitation({ invitationId });
	// };

	// const copyInvitationLink = () => {
	// 	if (!invitationToken) return;
	// 	const invitationUrl = `${window.location.origin}/auth/accept-invitation/${invitationToken}`;
	// 	navigator.clipboard.writeText(invitationUrl);
	// 	toast.success(t('staff-invitation-link-copied'));
	// };

	// const getStatusBadge = (invitation: any) => {
	// 	if (invitation.isAccepted) {
	// 		return <Chip label={t('staff-accepted')} color="success" size="small" />;
	// 	}
	// 	if (invitation.isRevoked) {
	// 		return <Chip label={t('staff-revoked')} color="error" size="small" />;
	// 	}
	// 	if (dayjs(invitation.expiresAt).isBefore(dayjs())) {
	// 		return <Chip label={t('staff-expired')} color="default" size="small" />;
	// 	}
	// 	return <Chip label={t('staff-pending')} color="warning" size="small" />;
	// };

	// Loading state
	// if (profilesLoading || invitationsLoading) {
	// 	return (
	// 		<Box
	// 			sx={{
	// 				display: 'flex',
	// 				justifyContent: 'center',
	// 				alignItems: 'center',
	// 				minHeight: '50vh',
	// 			}}
	// 		>
	// 			<CircularProgress />
	// 		</Box>
	// 	);
	// }

	// Error state
	// if (profilesError || invitationsError) {
	// 	return (
	// 		<Box sx={{ maxWidth: 1200, mx: 'auto', py: 4 }}>
	// 			<Typography color="error">{t('errors-generic')}</Typography>
	// 		</Box>
	// 	);
	// }

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-invitations')),
						href: FRONT_PATH_NAMES.staff.invitations.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={<NewInvitationButton />}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<StaffInvitationsTable />
		</DashboardContent>
	);
};

export default StaffInvitationsListPage;
