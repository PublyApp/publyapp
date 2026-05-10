import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import View400 from '#app/components/error/400-view.tsx';
import { View401 } from '#app/components/error/401-view.tsx';
import { View403 } from '#app/components/error/403-view.tsx';
import { View500 } from '#app/components/error/500-view.tsx';
import { GenericErrorView } from '#app/components/error/generic-error-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import { ViewTenantSuspended } from '#app/components/error/tenant-suspended-view.tsx';
import { MarketingErrorView } from '#app/routes/marketing/_components/marketing-error-view.tsx';

// ----------------------------------------------------------------------

// Dev-only sandbox that stacks every error view on one scrollable page.
// Lets reviewers eyeball all variants in light + dark mode without having
// to trigger 7 different runtime conditions. Mounted only in DEV builds
// (see routes/_tree/dev.routes.ts) so it can never ship to production.

// ----------------------------------------------------------------------

type Variant = {
	id: string;
	name: string;
	tone: 'primary' | 'error' | 'warning';
	code?: string;
	notes?: string;
	render: () => ReactNode;
};

const VARIANTS: Variant[] = [
	{
		id: '400',
		name: 'View400',
		tone: 'warning',
		code: '400',
		render: () => <View400 withLayout={false} />,
	},
	{
		id: '401',
		name: 'View401',
		tone: 'primary',
		code: '401',
		notes:
			'Auth-surface 401 (no logout). Authed-surface 401 lives in authed-layout and triggers logout.',
		render: () => <View401 withLayout={false} />,
	},
	{
		id: '403',
		name: 'View403',
		tone: 'error',
		code: '403',
		render: () => <View403 withLayout={false} />,
	},
	{
		id: '404',
		name: 'NotFoundView',
		tone: 'primary',
		code: '404',
		render: () => <NotFoundView withLayout={false} />,
	},
	{
		id: '500',
		name: 'View500',
		tone: 'error',
		code: '500',
		render: () => <View500 withLayout={false} />,
	},
	{
		id: 'generic',
		name: 'GenericErrorView',
		tone: 'warning',
		notes: 'With a sample errorDetails block (monospace error message).',
		render: () => (
			<GenericErrorView
				withLayout={false}
				error={
					new Error(
						'TypeError: Cannot read properties of undefined (reading "id") at processItem (utils.ts:42)',
					)
				}
			/>
		),
	},
	{
		id: 'tenant-suspended',
		name: 'ViewTenantSuspended',
		tone: 'warning',
		notes:
			'Uses errorDetails slot for inline mailto link (no description prop).',
		render: () => <ViewTenantSuspended withLayout={false} />,
	},
];

const SectionHeader = ({ variant }: { variant: Variant }) => {
	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={1.5}
			sx={{
				alignItems: { xs: 'flex-start', sm: 'center' },
				flexWrap: 'wrap',
				mb: 2,
			}}
		>
			<Typography
				variant="h6"
				sx={{ fontFamily: 'monospace', fontWeight: 700 }}
			>
				{variant.name}
			</Typography>
			<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
				<Chip label={variant.tone} color={variant.tone} size="small" />
				{variant.code && (
					<Chip
						label={variant.code}
						variant="outlined"
						size="small"
						sx={{ fontFamily: 'monospace' }}
					/>
				)}
			</Stack>
			{variant.notes && (
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', flex: 1, minWidth: 240 }}
				>
					{variant.notes}
				</Typography>
			)}
		</Stack>
	);
};

const ErrorViewsSandboxPage = () => {
	return (
		<Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
			<Stack spacing={1} sx={{ mb: 4 }}>
				<Typography variant="h4" sx={{ fontWeight: 700 }}>
					Error views sandbox
				</Typography>
				<Typography sx={{ color: 'text.secondary', maxWidth: 720 }}>
					Every error view rendered side-by-side. Toggle dark mode in the authed
					dashboard then navigate back here to compare. Wrappers below use{' '}
					<Box component="code">withLayout=false</Box> so they render inline (no
					full-page chrome). MarketingErrorView is its own design language and
					is intentionally not migrated to the AppErrorView shell.
				</Typography>
			</Stack>

			<Stack spacing={6}>
				{VARIANTS.map((variant) => {
					return (
						<Box component="section" key={variant.id}>
							<SectionHeader variant={variant} />
							<Box
								sx={{
									border: 1,
									borderColor: 'divider',
									borderRadius: 1,
									overflow: 'hidden',
									bgcolor: 'background.paper',
								}}
							>
								{variant.render()}
							</Box>
						</Box>
					);
				})}

				<Divider />

				<Box component="section">
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{
							alignItems: { xs: 'flex-start', sm: 'center' },
							flexWrap: 'wrap',
							mb: 2,
						}}
					>
						<Typography
							variant="h6"
							sx={{ fontFamily: 'monospace', fontWeight: 700 }}
						>
							MarketingErrorView
						</Typography>
						<Chip label="marketing" variant="outlined" size="small" />
						<Typography
							variant="caption"
							sx={{ color: 'text.secondary', flex: 1, minWidth: 240 }}
						>
							Standalone marketing-surface 404. Different design language — not
							part of the AppErrorView shell.
						</Typography>
					</Stack>
					<Box
						sx={{
							border: 1,
							borderColor: 'divider',
							borderRadius: 1,
							overflow: 'hidden',
							bgcolor: 'background.paper',
						}}
					>
						<MarketingErrorView
							numeral="404"
							title="This page wandered off"
							subhead="The link may have been moved, renamed, or the page might never have existed. Try one of these popular destinations instead."
						/>
					</Box>
				</Box>
			</Stack>
		</Container>
	);
};

export default ErrorViewsSandboxPage;

export const meta = () => {
	return [{ title: 'Error views sandbox (DEV)' }];
};
