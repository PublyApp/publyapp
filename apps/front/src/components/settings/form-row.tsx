import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type FormRowProps = {
	label: string;
	description?: string;
	children: React.ReactNode;
};

export const FormRow = ({ label, description, children }: FormRowProps) => (
	<Box
		sx={{
			display: 'grid',
			gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
			gap: { xs: 1.5, md: 3 },
			alignItems: 'flex-start',
			py: 2,
		}}
	>
		<Box>
			<Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
				{label}
			</Typography>
			{description && (
				<Typography variant="caption" sx={{ color: 'text.secondary' }}>
					{description}
				</Typography>
			)}
		</Box>
		<Box>{children}</Box>
	</Box>
);
