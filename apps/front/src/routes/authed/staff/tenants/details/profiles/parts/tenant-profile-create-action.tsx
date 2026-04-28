import Button from '@mui/material/Button';
import { useBoolean } from 'minimal-shared/hooks';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import TenantProfileFormDrawer from './tenant-profile-form-drawer.tsx';

type TenantProfileCreateActionProps = {
	tenantId: string;
};

const TenantProfileCreateAction = ({
	tenantId,
}: TenantProfileCreateActionProps) => {
	const { t } = useTranslate();
	const createDrawer = useBoolean();

	return (
		<>
			<Button
				variant="contained"
				onClick={createDrawer.onTrue}
				startIcon={<Iconify width={16} icon="mingcute:add-line" />}
			>
				{t('new-item', { item: t('profile') })}
			</Button>

			<TenantProfileFormDrawer
				tenantId={tenantId}
				mode="create"
				open={createDrawer.value}
				onClose={createDrawer.onFalse}
			/>
		</>
	);
};

export default TenantProfileCreateAction;
