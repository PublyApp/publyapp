/* eslint-disable @typescript-eslint/no-use-before-define */
import Box, { type BoxProps } from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m, type MotionProps } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { varFade } from '@/front/components/animate/variants/fade';

// ----------------------------------------------------------------------

type TextProps = {
	sx?: SxProps<Theme>;
	title: React.ReactNode;
	variants?: MotionProps['variants'];
};

type SectionTitleProps = BoxProps & {
	txtGradient?: string;
	title: React.ReactNode;
	caption?: React.ReactNode;
	description?: React.ReactNode;
	slotProps?: {
		title?: Omit<TextProps, 'title'>;
		caption?: Omit<TextProps, 'title'>;
		description?: Omit<TextProps, 'title'>;
	};
};

export const SectionTitle = ({
	sx,
	title,
	caption,
	slotProps,
	txtGradient,
	description,
	...other
}: SectionTitleProps) => {
	return (
		<Box
			sx={[
				{
					gap: 3,
					display: 'flex',
					flexDirection: 'column',
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{caption && (
				<SectionCaption
					title={caption}
					variants={slotProps?.caption?.variants}
					sx={slotProps?.caption?.sx}
				/>
			)}

			<Typography
				component={m.h2}
				variant="h2"
				variants={
					slotProps?.title?.variants ?? varFade('inUp', { distance: 24 })
				}
				sx={slotProps?.title?.sx}
			>
				{`${title} `}
				<Box
					component="span"
					sx={(theme) => {
						return {
							opacity: 0.4,
							display: 'inline-block',
							...theme.mixins.textGradient(
								`to right, ${theme.vars.palette.text.primary}, ${varAlpha(theme.vars.palette.text.primaryChannel, 0.2)}`,
							),
						};
					}}
				>
					{txtGradient}
				</Box>
			</Typography>

			{description && (
				<Typography
					component={m.p}
					variants={
						slotProps?.description?.variants ??
						varFade('inUp', { distance: 24 })
					}
					sx={[
						{ color: 'text.secondary' },
						...(Array.isArray(slotProps?.description?.sx)
							? (slotProps?.description?.sx ?? [])
							: [slotProps?.description?.sx]),
					]}
				>
					{description}
				</Typography>
			)}
		</Box>
	);
};

// ----------------------------------------------------------------------

export const SectionCaption = ({
	title,
	variants,
	sx,
	...other
}: TextProps) => {
	return (
		<Box
			component={m.span}
			variants={variants ?? varFade('inUp', { distance: 24 })}
			sx={[
				() => {
					return { typography: 'overline', color: 'text.disabled' };
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{title}
		</Box>
	);
};
