import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';

import { Iconify } from '@/front/components/iconify/iconify';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

import TenantUsersTable from './parts/tenant-users-table';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();
	const openDrawer = useBoolean();

	return (
		<Stack spacing={3}>
			<Stack direction="row" alignItems="center" justifyContent="space-between">
				<SettingsPageHeader subtitle={t('tenant-details')} title={t('users')} />
				<Button
					variant="contained"
					onClick={openDrawer.onTrue}
					startIcon={<Iconify icon="mingcute:add-line" />}
				>
					{_.capitalize(t('new-item', { item: t('user') }))}
				</Button>
			</Stack>

			<TenantUsersTable />

			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: { sx: { width: 720 } },
				}}
			>
				ADD USER FORM HERE
			</Drawer>
		</Stack>
	);
};

export default TenantDetailsUsersPage;
