import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type SettingsPageHeaderProps = {
	subtitle: string;
	title: string;
};

export const SettingsPageHeader = ({
	subtitle,
	title,
}: SettingsPageHeaderProps) => (
	<Box>
		<Typography variant="body1" sx={{ color: 'text.secondary' }}>
			{subtitle}
		</Typography>
		<Typography variant="h2" sx={{ fontWeight: 700 }}>
			{title}
		</Typography>
	</Box>
);
