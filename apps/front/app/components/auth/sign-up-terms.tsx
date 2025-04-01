import Box, { type BoxProps } from '@mui/material/Box';
import Link from '@mui/material/Link';

// ----------------------------------------------------------------------

export const SignUpTerms = ({ sx, ...other }: BoxProps) => {
	return (
		<Box
			component="span"
			sx={[
				() => {
					return {
						mt: 3,
						display: 'block',
						textAlign: 'center',
						typography: 'caption',
						color: 'text.secondary',
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{'By signing up, I agree to '}
			{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
			<Link underline="always" color="text.primary">
				Terms of service
			</Link>
			{' and '}
			{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
			<Link underline="always" color="text.primary">
				Privacy policy
			</Link>
			.
		</Box>
	);
};
