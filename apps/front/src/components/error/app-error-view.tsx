import Box from '@mui/material/Box';
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

type AppErrorViewBaseProps = {
	title: string;
	// Optional — wrappers may render their body via the `errorDetails`
	// slot when inline JSX is needed (e.g. ViewTenantSuspended's mailto link).
	description?: string;
	actions?: ReactNode;
	errorDetails?: ReactNode;
	tone: AppErrorTone;
	withLayout?: boolean;
};

type AppErrorViewWithNumeral = AppErrorViewBaseProps & {
	numeral: string;
	icon?: never;
};

type AppErrorViewWithIcon = AppErrorViewBaseProps & {
	icon: IconifyName;
	numeral?: never;
};

export type AppErrorViewProps = AppErrorViewWithNumeral | AppErrorViewWithIcon;

const FADE_DISTANCE = 24;

export const AppErrorView = (props: AppErrorViewProps) => {
	const {
		title,
		description,
		actions,
		errorDetails,
		tone,
		withLayout = true,
	} = props;

	const renderVisual = () => {
		if ('numeral' in props && props.numeral !== undefined) {
			return (
				<Typography
					variant="h1"
					sx={(theme) => ({
						fontSize: { xs: '6rem', md: '8rem' },
						fontWeight: 800,
						lineHeight: 1,
						color: theme.palette[tone].main,
						mb: 2,
					})}
				>
					{props.numeral}
				</Typography>
			);
		}

		if ('icon' in props && props.icon !== undefined) {
			return (
				<Box
					sx={(theme) => ({
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 120,
						height: 120,
						borderRadius: '50%',
						bgcolor: theme.palette[tone].lighter,
						mb: 3,
					})}
				>
					<Iconify
						icon={props.icon}
						width={64}
						sx={(theme) => ({ color: theme.palette[tone].main })}
					/>
				</Box>
			);
		}

		return null;
	};

	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				sx={{ textAlign: 'center', py: { xs: 5, md: 10 } }}
			>
				<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
					{renderVisual()}
				</m.div>

				<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
					<Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
						{title}
					</Typography>
				</m.div>

				{description !== undefined && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Typography
							sx={{
								color: 'text.secondary',
								mb: errorDetails ? 2 : 4,
								maxWidth: 480,
								mx: 'auto',
								lineHeight: 1.6,
							}}
						>
							{description}
						</Typography>
					</m.div>
				)}

				{errorDetails && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Box sx={{ mb: 4 }}>{errorDetails}</Box>
					</m.div>
				)}

				{actions && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={2}
							justifyContent="center"
						>
							{actions}
						</Stack>
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
