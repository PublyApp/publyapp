import Box, { type BoxProps } from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { Breakpoint } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

export type AuthSplitSectionProps = BoxProps & {
	title?: string;
	method?: string;
	imgUrl?: string;
	subtitle?: string;
	layoutQuery?: Breakpoint;
	methods?: {
		path: string;
		icon: string;
		label: string;
	}[];
};

export const AuthSplitSection = ({
	sx,
	method,
	methods,
	layoutQuery = 'md',
	title = 'Manage the job',
	imgUrl = '/assets/illustrations/illustration-dashboard.webp',
	subtitle = 'More effectively with optimized workflows.',
	...other
}: AuthSplitSectionProps) => {
	return (
		<Box
			sx={[
				(theme) => {
					return {
						...theme.mixins.bgGradient({
							images: [
								`linear-gradient(0deg, ${varAlpha(theme.vars.palette.background.defaultChannel, 0.92)}, ${varAlpha(theme.vars.palette.background.defaultChannel, 0.92)})`,
								'url(/assets/background/background-3-blur.webp)',
							],
						}),
						px: 3,
						pb: 3,
						width: 1,
						maxWidth: 480,
						display: 'none',
						position: 'relative',
						pt: 'var(--layout-header-desktop-height)',
						[theme.breakpoints.up(layoutQuery)]: {
							gap: 8,
							display: 'flex',
							alignItems: 'center',
							flexDirection: 'column',
							justifyContent: 'center',
						},
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Box>
				<Typography variant="h3" sx={{ textAlign: 'center' }}>
					{title}
				</Typography>

				{subtitle && (
					<Typography
						sx={{ color: 'text.secondary', textAlign: 'center', mt: 2 }}
					>
						{subtitle}
					</Typography>
				)}
			</Box>

			<Image
				alt="Dashboard illustration"
				src={imgUrl}
				ratio="4/3"
				sx={{ width: 1 }}
			/>

			{!!methods?.length && method && (
				<Box component="ul" sx={{ gap: 2, display: 'flex' }}>
					{methods.map((option) => {
						const selected = method === option.label.toLowerCase();

						return (
							<Box
								key={option.label}
								component="li"
								sx={{
									...(!selected && {
										cursor: 'not-allowed',
										filter: 'grayscale(1)',
									}),
								}}
							>
								<Tooltip title={option.label} placement="top">
									<Link
										component={RouterLink}
										href={option.path}
										sx={{ ...(!selected && { pointerEvents: 'none' }) }}
									>
										<Image
											alt={option.label}
											src={option.icon}
											ratio="1/1"
											sx={{ width: 32, height: 32 }}
										/>
									</Link>
								</Tooltip>
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
};
