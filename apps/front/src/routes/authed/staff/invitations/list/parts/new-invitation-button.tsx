import Button from '@mui/material/Button';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';

export const NewInvitationButton = () => {
	const { t } = useTranslate();

	return (
		<Button
			variant="contained"
			startIcon={
				<Iconify icon="mingcute:add-line" sx={{ width: 16, height: 16 }} />
			}
			component={RouterLink}
			href={FRONT_PATH_NAMES.staff.invitations.new}
		>
			{t('new-invitation')}
		</Button>
	);
};
