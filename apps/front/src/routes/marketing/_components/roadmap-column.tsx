import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

type ColumnTone = 'primary' | 'amber' | 'neutral';

type RoadmapColumnProps = {
	label: string; // e.g. "Now (Q2 2026)"
	icon?: IconifyName;
	tone: ColumnTone;
	muted?: boolean; // dim the column body slightly (used for "Later")
	children: ReactNode;
};

// ----------------------------------------------------------------------

type Token = {
	bgcolor: string;
	color: string;
	borderColor: string;
};

const toneToToken = (tone: ColumnTone): Token => {
	if (tone === 'primary') {
		return {
			bgcolor: 'primary.lighter',
			color: 'primary.darker',
			borderColor: 'primary.light',
		};
	}
	if (tone === 'amber') {
		return {
			bgcolor: 'warning.lighter',
			color: 'warning.darker',
			borderColor: 'warning.light',
		};
	}
	return {
		bgcolor: 'background.neutral',
		color: 'text.primary',
		borderColor: 'divider',
	};
};

// ----------------------------------------------------------------------

const PrimaryDot = () => (
	<Box
		sx={{
			position: 'relative',
			display: 'inline-flex',
			width: 8,
			height: 8,
		}}
	>
		<Box
			sx={{
				position: 'absolute',
				inset: 0,
				borderRadius: '50%',
				bgcolor: 'primary.main',
				opacity: 0.55,
				animation: 'rm-ping 2s cubic-bezier(0,0,0.2,1) infinite',
				'@keyframes rm-ping': {
					'75%, 100%': {
						transform: 'scale(2.25)',
						opacity: 0,
					},
				},
			}}
		/>
		<Box
			sx={{
				position: 'relative',
				width: 8,
				height: 8,
				borderRadius: '50%',
				bgcolor: 'primary.main',
			}}
		/>
	</Box>
);

// ----------------------------------------------------------------------

const renderHeaderGlyph = (tone: ColumnTone, icon?: IconifyName) => {
	if (tone === 'primary') {
		return <PrimaryDot />;
	}
	if (icon) {
		return <Iconify icon={icon} width={14} />;
	}
	return null;
};

// ----------------------------------------------------------------------

export const RoadmapColumn = ({
	label,
	icon,
	tone,
	muted = false,
	children,
}: RoadmapColumnProps) => {
	const token = toneToToken(tone);
	const headerGlyph = renderHeaderGlyph(tone, icon);

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				minWidth: 0,
			}}
		>
			{/* Header pill */}
			<Box sx={{ mb: 3 }}>
				<Stack
					direction="row"
					alignItems="center"
					spacing={1}
					sx={{
						display: 'inline-flex',
						px: 1.5,
						py: 0.75,
						borderRadius: '8px',
						bgcolor: token.bgcolor,
						color: token.color,
						border: '1px solid',
						borderColor: token.borderColor,
						fontSize: 13,
						fontWeight: 700,
					}}
				>
					{headerGlyph}
					<Box component="span">{label}</Box>
				</Stack>
			</Box>

			{/* Body — stacked cards. Muted columns dim slightly. */}
			<Stack
				spacing={2}
				sx={{
					opacity: muted ? 0.85 : 1,
					transition: 'opacity 240ms ease',
				}}
			>
				{children}
			</Stack>
		</Box>
	);
};
