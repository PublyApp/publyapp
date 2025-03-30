/* eslint-disable @typescript-eslint/no-use-before-define */
import { styled } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';
import SimpleBar from 'simplebar-react';

import { scrollbarClasses } from './classes';
import type { ScrollbarProps } from './types';

// ----------------------------------------------------------------------

export const Scrollbar = ({
	sx,
	ref,
	children,
	className,
	slotProps,
	fillContent = true,
	...other
}: ScrollbarProps) => {
	return (
		<ScrollbarRoot
			scrollableNodeProps={{ ref }}
			clickOnTrack={false}
			fillContent={fillContent}
			className={mergeClasses([scrollbarClasses.root, className])}
			sx={[
				{
					'& .simplebar-wrapper': slotProps?.wrapperSx as React.CSSProperties,
					'& .simplebar-content-wrapper': slotProps?.contentWrapperSx as React.CSSProperties,
					'& .simplebar-content': slotProps?.contentSx as React.CSSProperties,
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{children}
		</ScrollbarRoot>
	);
};

// ----------------------------------------------------------------------

const ScrollbarRoot = styled(SimpleBar, {
	shouldForwardProp: (prop: string) => {
		return !['fillContent', 'sx'].includes(prop);
	},
})<Pick<ScrollbarProps, 'fillContent'>>(({ fillContent }) => {
	return {
		minWidth: 0,
		minHeight: 0,
		flexGrow: 1,
		display: 'flex',
		flexDirection: 'column',
		...(fillContent && {
			'& .simplebar-content': {
				display: 'flex',
				flex: '1 1 auto',
				minHeight: '100%',
				flexDirection: 'column',
			},
		}),
	};
});
