import Box, { type BoxProps } from '@mui/material/Box';
import type { Breakpoint } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';

import { layoutClasses } from '../core/classes';

// ----------------------------------------------------------------------

export type AuthSplitContentProps = BoxProps & { layoutQuery?: Breakpoint };

export const AuthSplitContent = ({
	sx,
	children,
	className,
	layoutQuery = 'md',
	...other
}: AuthSplitContentProps) => {
	return (
		<Box
			className={mergeClasses([layoutClasses.content, className])}
			sx={[
				(theme) => {
					return {
						display: 'flex',
						flex: '1 1 auto',
						alignItems: 'center',
						flexDirection: 'column',
						p: theme.spacing(3, 2, 10, 2),
						[theme.breakpoints.up(layoutQuery)]: {
							justifyContent: 'center',
							p: theme.spacing(10, 2, 10, 2),
						},
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Box
				sx={{
					width: 1,
					display: 'flex',
					flexDirection: 'column',
					maxWidth: 'var(--layout-auth-content-width)',
				}}
			>
				{children}
			</Box>
		</Box>
	);
};
