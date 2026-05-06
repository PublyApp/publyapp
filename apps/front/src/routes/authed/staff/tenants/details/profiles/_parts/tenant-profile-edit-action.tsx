import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useBoolean } from 'minimal-shared/hooks';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import TenantProfileFormDrawer from './tenant-profile-form-drawer.tsx';
import type { TenantProfileRowData } from './tenant-profiles-table.types.ts';

type TenantProfileEditActionProps = {
	tenantId: string;
	profile: TenantProfileRowData;
};

const TenantProfileEditAction = ({
	tenantId,
	profile,
}: TenantProfileEditActionProps) => {
	const { t } = useTranslate();
	const editDrawer = useBoolean();

	return (
		<>
			<Tooltip title={t('details')} placement="top" arrow>
				<Box component="span">
					<IconButton
						color="default"
						size="small"
						onClick={editDrawer.onTrue}
						disabled={!profile.id}
						// Details is the primary navigation affordance in compact row actions.
						sx={{
							color: profile.id ? 'text.primary' : 'action.disabled',
						}}
					>
						<Iconify icon="solar:list-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<TenantProfileFormDrawer
				tenantId={tenantId}
				mode="edit"
				profileId={profile.id}
				open={editDrawer.value}
				onClose={editDrawer.onFalse}
			/>
		</>
	);
};

export default TenantProfileEditAction;
