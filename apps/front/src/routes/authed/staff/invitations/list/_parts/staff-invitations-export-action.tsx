import Button from '@mui/material/Button';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

type StaffInvitationsExportActionProps = {
	onClick: () => void;
};

export const StaffInvitationsExportAction = ({
	onClick,
}: StaffInvitationsExportActionProps) => {
	const { t } = useTranslate();

	return (
		<Button
			size="small"
			variant="outlined"
			onClick={onClick}
			startIcon={<Iconify icon="solar:download-bold" />}
		>
			{t('export')}
		</Button>
	);
};
