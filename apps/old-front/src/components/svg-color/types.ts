import type { SxProps, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export type SvgColorProps = React.ComponentProps<'span'> & {
	src: string;
	sx?: SxProps<Theme>;
};
