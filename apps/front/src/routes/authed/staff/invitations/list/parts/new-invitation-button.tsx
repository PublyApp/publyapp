import Button from '@mui/material/Button';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

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
			{t('invite-users')}
		</Button>
	);
};
