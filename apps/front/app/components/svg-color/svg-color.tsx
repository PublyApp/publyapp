import { styled } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';

import { svgColorClasses } from './classes';
import type { SvgColorProps } from './types';

// ----------------------------------------------------------------------

export const SvgColor = ({ src, className, sx, ...other }: SvgColorProps) => {
	return (
		<SvgRoot
			className={mergeClasses([svgColorClasses.root, className])}
			sx={[
				{
					mask: `url(${src}) no-repeat center / contain`,
					WebkitMask: `url(${src}) no-repeat center / contain`,
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		/>
	);
};

// ----------------------------------------------------------------------

const SvgRoot = styled('span')(() => {
	return {
		width: 24,
		height: 24,
		flexShrink: 0,
		display: 'inline-flex',
		backgroundColor: 'currentColor',
	};
});
