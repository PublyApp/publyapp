import { forwardRef } from 'react';

import Link, { type LinkProps } from '@mui/material/Link';
import type { Variant } from '@mui/material/styles/createTypography';
import Typography, { type TypographyProps } from '@mui/material/Typography';

import useTypography from '@devist/ui-react/hooks/useTypography';

// ----------------------------------------------------------------------

type IProps = TypographyProps & LinkProps;

export interface TextMaxLineProps extends IProps {
	line?: number;
	asLink?: boolean;
	persistent?: boolean;
	children: React.ReactNode;
	variant?: Variant;
}

// ----------------------------------------------------------------------

const TextMaxLine = forwardRef<HTMLAnchorElement, TextMaxLineProps>(
	({ asLink, variant = 'body1', line = 2, persistent = false, children, sx, ...other }, ref) => {
		const { lineHeight } = useTypography(variant);

		const styles = {
			overflow: 'hidden',
			textOverflow: 'ellipsis',
			display: '-webkit-box',
			WebkitLineClamp: line,
			WebkitBoxOrient: 'vertical',
			...(persistent && {
				height: lineHeight * line,
			}),
			...sx,
		} as const;

		if (asLink) {
			return (
				<Link color="inherit" ref={ref} variant={variant} sx={{ ...styles }} {...other}>
					{children}
				</Link>
			);
		}

		return (
			<Typography ref={ref} variant={variant} sx={{ ...styles }} {...other}>
				{children}
			</Typography>
		);
	},
);

export default TextMaxLine;
