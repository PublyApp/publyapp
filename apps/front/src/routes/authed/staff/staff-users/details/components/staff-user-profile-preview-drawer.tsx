import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import capitalize from 'lodash/capitalize';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

export type StaffUserProfileOption = {
	id: string;
	name: string;
	description?: string | null;
};

type StaffUserProfilePreviewDrawerProps = {
	open: boolean;
	onClose: () => void;
	profile: StaffUserProfileOption | null;
};

const StaffUserProfilePreviewDrawer = ({
	open,
	onClose,
	profile,
}: StaffUserProfilePreviewDrawerProps) => {
	const { t } = useTranslate();
	const profileHref = profile?.id
		? FRONT_PATH_NAMES.staff.profiles.details(profile.id).root
		: null;

	return (
		<Drawer
			open={open}
			onClose={onClose}
			anchor="right"
			sx={(theme) => ({
				// Keep the drawer (and its backdrop) above the app sidebar layer.
				// This matches the other right-side drawers in the staff area.
				zIndex: theme.zIndex.modal + 1,
			})}
			slotProps={{
				paper: {
					sx: {
						width: 480,
						maxWidth: '100%',
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor onClick={onClose} aria-label={t('close')} sx={{ left: 0 }}>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>

			<Stack spacing={3} sx={{ p: 3, pt: 8 }}>
				<Stack spacing={0.75}>
					<Typography variant="overline" sx={{ color: 'text.secondary' }}>
						{capitalize(t('profile'))}
					</Typography>
					<Typography variant="h4">{profile?.name || '-'}</Typography>
				</Stack>

				<Stack spacing={1}>
					<Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
						{capitalize(t('description'))}
					</Typography>
					<Typography variant="body2">
						{profile?.description?.trim() || '-'}
					</Typography>
				</Stack>

				<Box sx={{ display: 'flex' }}>
					{profileHref ? (
						<Link
							component={RouterLink}
							href={profileHref}
							underline="none"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								fontWeight: 600,
							}}
						>
							{capitalize(t('view-details'))}
							<Iconify icon="eva:external-link-outline" width={18} />
						</Link>
					) : null}
				</Box>
			</Stack>
		</Drawer>
	);
};

export default StaffUserProfilePreviewDrawer;
