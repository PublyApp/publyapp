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

// Tone is intentionally narrow: 'primary' / 'error' / 'warning'. No 'default' /
// 'info' escape — the canvas reserves color for the small status pill only, and
// these three map cleanly to MUI palette tokens. Adding more tones would erode
// the visual restraint that makes the error views feel like a coherent system.
type AppErrorTone = 'primary' | 'error' | 'warning';

export type AppErrorViewProps = {
	icon: IconifyName;
	tone: AppErrorTone;
	title: string;
	// Short status code for the monospace pill (e.g. "404 — Not Found"). The
	// pill is the ONLY tone-colored element — keeping HTTP reason phrases in
	// English is intentional (developer-facing convention, not user copy).
	// Omit for non-HTTP errors (generic, tenant-suspended, coming-soon).
	code?: string;
	description?: string;
	actions?: ReactNode;
	// Slot that sits between description and actions. Use it when the body
	// needs inline JSX (mailto link, code block) or when you want to surface
	// an underlying Error.message inline. See ViewTenantSuspended (mailto) and
	// GenericErrorView (Error.message in a monospace box) for the patterns.
	errorDetails?: ReactNode;
	// `true` (default) wraps in `SimpleLayout` — the standalone full-page
	// chrome (logo top-left, centered content). Use for top-level catch-all
	// boundaries (root.tsx, authed-layout, auth-layout) where this is the
	// only thing on screen.
	// `false` wraps in `SimpleCompactContent` only — no chrome of its own.
	// Use when the parent already owns layout chrome (page-level inline
	// errors inside an authenticated dashboard, e.g., a tenant-detail page
	// rendering View404 inside the existing sidebar+topbar shell).
	withLayout?: boolean;
	// Optional small monospace footer (e.g. correlation ID + timestamp). Wired
	// in for support escalations on 500/generic; currently unused — when we
	// start surfacing trace IDs from the backend, plumb them through here.
	diagnosticId?: string;
};

// Entry-motion override. The default `varFade('inUp')` runs at 640 ms which
// drags on an error page; 320 ms feels more responsive without losing the
// staggered-feel of the cascade. Distance is small (16 px) so each row barely
// moves — the goal is a gentle settle, not an attention-grab.
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
					{/* Icon circle stays neutral — `tone` does NOT color this. The
					    canvas reserves color for the small status pill below; the
					    circle uses background.paper + divider so it reads as a
					    quiet container, not a warning. */}
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
