import { useTranslate } from '@/front/hooks/use-translate';
import Box, { type BoxProps } from '@mui/material/Box';
import Link from '@mui/material/Link';

// ----------------------------------------------------------------------

export const SignUpTerms = ({ sx, ...other }: BoxProps) => {
	const { t } = useTranslate();

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
			{t('by-signing-up-agree')}{' '}
			<Link underline="always" color="text.primary">
				{t('terms-of-service')}
			</Link>{' '}
			{t('and')}{' '}
			<Link underline="always" color="text.primary">
				{t('privacy-policy')}
			</Link>
			.
		</Box>
	);
};
