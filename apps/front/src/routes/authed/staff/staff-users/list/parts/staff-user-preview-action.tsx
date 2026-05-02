import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import trim from 'lodash/trim';
import { useBoolean } from 'minimal-shared/hooks';

import {
	ACCOUNT_LEVEL_ENUM,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { StaffUserRowData } from './use-staff-users-table-controller.ts';

type StaffUserPreviewActionProps = {
	user: StaffUserRowData;
};

const getStatusPresentation = (
	status: string,
	t: ReturnType<typeof useTranslate>['t'],
): { label: string; color: LabelColor } => {
	if (status === USER_STATUS_ENUM.ACTIVE) {
		return { label: t('active'), color: 'success' };
	}

	if (status === USER_STATUS_ENUM.SUSPENDED) {
		return { label: t('suspended'), color: 'warning' };
	}

	return { label: t('unknown-item', { item: 'status' }), color: 'default' };
};

const getLevelPresentation = (
	level: string,
	t: ReturnType<typeof useTranslate>['t'],
): { label: string; color: LabelColor } => {
	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		return { label: t('admin'), color: 'success' };
	}

	if (level === ACCOUNT_LEVEL_ENUM.USER) {
		return { label: t('user'), color: 'warning' };
	}

	return { label: t('unknown-item', { item: 'role' }), color: 'default' };
};

const StaffUserPreviewAction = ({ user }: StaffUserPreviewActionProps) => {
	const { t } = useTranslate();
	const previewDrawer = useBoolean();
	const fullName =
		trim(
			getUserFullName({
				firstName: user.firstName,
				lastName: user.lastName,
			}),
		) || t('un-named');
	const avatarUrl = trim(user.avatarUrl);
	const status = getStatusPresentation(user.status, t);
	const level = getLevelPresentation(user.level, t);

	return (
		<>
			<Tooltip title={t('preview')} placement="top" arrow>
				<IconButton
					color="default"
					size="small"
					onClick={previewDrawer.onTrue}
					// Preview is the primary navigation affordance in compact row actions.
					sx={{ color: 'text.primary' }}
				>
					<Iconify icon="solar:list-bold" width={18} />
				</IconButton>
			</Tooltip>

			<Drawer
				open={previewDrawer.value}
				onClose={previewDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					// Keep staff-area quick previews above the app sidebar overlay layer.
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					transition: { appear: true },
					paper: {
						sx: {
							width: 480,
							maxWidth: '100%',
							overflow: 'unset',
						},
					},
				}}
			>
				<DrawerAnchor
					onClick={previewDrawer.onFalse}
					aria-label={t('close')}
					sx={{ left: 0 }}
				>
					<Iconify icon="mingcute:close-line" width={18} />
				</DrawerAnchor>

				<Stack spacing={3} sx={{ p: 3 }}>
					<Stack spacing={2}>
						<Avatar
							alt={fullName}
							src={avatarUrl || undefined}
							sx={{
								width: 64,
								height: 64,
								...(avatarUrl
									? {}
									: {
											bgcolor: 'background.neutral',
											color: 'text.disabled',
										}),
							}}
						>
							{!avatarUrl ? (
								<Iconify icon="solar:user-rounded-bold" width={28} />
							) : null}
						</Avatar>

						<Box>
							<Typography variant="overline" sx={{ color: 'text.secondary' }}>
								{t('staff-user')}
							</Typography>
							<Typography variant="h4">{fullName}</Typography>
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								{user.email}
							</Typography>
						</Box>
					</Stack>

					<Stack spacing={2}>
						<Stack spacing={0.75}>
							<Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
								{t('status')}
							</Typography>
							<Box>
								<Label variant="soft" color={status.color}>
									{status.label}
								</Label>
							</Box>
						</Stack>

						<Stack spacing={0.75}>
							<Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
								{t('level')}
							</Typography>
							<Box>
								<Label variant="soft" color={level.color}>
									{level.label}
								</Label>
							</Box>
						</Stack>
					</Stack>

					<Box sx={{ display: 'flex' }}>
						<Link
							component={RouterLink}
							href={FRONT_PATH_NAMES.staff.staffUsers.details(user.id)}
							underline="none"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								fontWeight: 600,
							}}
						>
							{t('view-details')}
							<Iconify icon="eva:external-link-outline" width={18} />
						</Link>
					</Box>
				</Stack>
			</Drawer>
		</>
	);
};

export default StaffUserPreviewAction;
