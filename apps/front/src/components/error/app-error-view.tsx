import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import type { ReactNode } from 'react';

import { SimpleCompactContent } from '#app/layouts/simple/content.tsx';
import { SimpleLayout } from '#app/layouts/simple/layout.tsx';

import { MotionContainer } from '../animate/motion-container';
import { varFade } from '../animate/variants';
import { Iconify } from '../iconify/iconify';
import type { IconifyName } from '../iconify/register-icons';

// ----------------------------------------------------------------------

type AppErrorTone = 'primary' | 'error' | 'warning';

export type AppErrorViewProps = {
	icon: IconifyName;
	tone: AppErrorTone;
	title: string;
	// Short status code for the monospace pill (e.g. "404", "401 — Unauthorized").
	// Omit for non-HTTP errors (generic, tenant-suspended).
	code?: string;
	description?: string;
	actions?: ReactNode;
	errorDetails?: ReactNode;
	withLayout?: boolean;
	// Diagnostic line at the bottom (correlation ID + timestamp). Useful for
	// support escalations on 500 / generic. Omit if there's nothing to show.
	diagnosticId?: string;
};

const FADE_DISTANCE = 16;
const FADE_DURATION = 0.32;
const fadeIn = () => {
	return varFade('inUp', {
		distance: FADE_DISTANCE,
		transitionIn: { duration: FADE_DURATION },
	});
};

export const AppErrorView = ({
	icon,
	tone,
	title,
	code,
	description,
	actions,
	errorDetails,
	withLayout = true,
	diagnosticId,
}: AppErrorViewProps) => {
	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				maxWidth="sm"
				sx={{ textAlign: 'center', py: { xs: 5, md: 8 } }}
			>
				<m.div variants={fadeIn()}>
					<Box
						sx={{
							width: 88,
							height: 88,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							mb: 3,
						}}
					>
						<Iconify icon={icon} width={40} sx={{ color: 'text.secondary' }} />
					</Box>
				</m.div>

				{code && (
					<m.div variants={fadeIn()}>
						<Chip
							size="small"
							color={tone}
							variant="outlined"
							label={code}
							sx={{
								fontFamily: 'monospace',
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
								mb: 3,
							}}
						/>
					</m.div>
				)}

				<m.div variants={fadeIn()}>
					<Typography
						component="h1"
						sx={{
							mb: 1.5,
							fontWeight: 600,
							letterSpacing: '-0.02em',
							lineHeight: 1.2,
							// Theme h-scale is Metronic-compact (h1 caps ~32 px, h4 is
							// 14 px); error views need canvas-prominent sizing here, so
							// override with explicit pxs that match the Dashboard Error
							// canvas reference.
							fontSize: { xs: 24, md: 30 },
						}}
					>
						{title}
					</Typography>
				</m.div>

				{description !== undefined && (
					<m.div variants={fadeIn()}>
						<Typography
							sx={{
								color: 'text.secondary',
								mb: errorDetails ? 2 : 4,
								maxWidth: 460,
								mx: 'auto',
								lineHeight: 1.6,
								fontSize: { xs: 14, md: 15 },
							}}
						>
							{description}
						</Typography>
					</m.div>
				)}

				{errorDetails && (
					<m.div variants={fadeIn()}>
						<Box sx={{ mb: 4 }}>{errorDetails}</Box>
					</m.div>
				)}

				{actions && (
					<m.div variants={fadeIn()}>
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={1.5}
							justifyContent="center"
						>
							{actions}
						</Stack>
					</m.div>
				)}

				{diagnosticId && (
					<m.div variants={fadeIn()}>
						<Typography
							variant="caption"
							sx={{
								display: 'block',
								mt: 6,
								fontFamily: 'monospace',
								color: 'text.disabled',
								letterSpacing: '0.05em',
								userSelect: 'all',
							}}
						>
							{diagnosticId}
						</Typography>
					</m.div>
				)}
			</Container>
		);
	};

	if (!withLayout) {
		return (
			<SimpleCompactContent layoutQuery="md">
				{renderContent()}
			</SimpleCompactContent>
		);
	}

	return (
		<SimpleLayout slotProps={{ content: { compact: true } }}>
			{renderContent()}
		</SimpleLayout>
	);
};
