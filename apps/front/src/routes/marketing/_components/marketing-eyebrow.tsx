import Box from '@mui/material/Box';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

type MarketingEyebrowProps = {
	label: string;
	icon?: IconifyName;
};

export const MarketingEyebrow = ({ label, icon }: MarketingEyebrowProps) => {
	return (
		<Box
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				alignSelf: 'center',
				px: 1.5,
				py: 0.75,
				borderRadius: 999,
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
				color: 'text.primary',
				fontSize: 12,
				fontWeight: 700,
				textTransform: 'uppercase',
				letterSpacing: '0.12em',
			}}
		>
			{icon ? (
				<Iconify icon={icon} width={14} sx={{ color: 'primary.main' }} />
			) : null}
			{label}
		</Box>
	);
};
