import Button from '@mui/material/Button';
import { useBoolean } from 'minimal-shared/hooks';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';
import InvitationDrawerForm from './invitation-drawer-form';

const NewInvitationButton = () => {
	const { t } = useTranslate();
	const openDrawer = useBoolean();

	return (
		<>
			<Button
				variant="contained"
				startIcon={<Iconify icon="mingcute:add-line" />}
				onClick={openDrawer.onTrue}
			>
				{t('new-invitation')}
			</Button>
			<InvitationDrawerForm
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
			/>
		</>
	);
};

export default NewInvitationButton;
