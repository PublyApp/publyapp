import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { Fragment } from 'react';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type {
	ComparisonCellKind,
	ComparisonFeatureGroup,
} from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type ComparisonFeatureTableProps = {
	title: string;
	subhead?: string;
	usDisplayName: string;
	themDisplayName: string;
	usInitial: string;
	themInitial: string;
	groups: ComparisonFeatureGroup[];
};

// ----------------------------------------------------------------------

const Cell = ({ value }: { value: ComparisonCellKind }) => {
	if (value.kind === 'yes') {
		return (
			<Iconify
				icon="ph:check-circle-fill"
				width={22}
				sx={{ color: 'primary.main' }}
			/>
		);
	}

	if (value.kind === 'weak') {
		return (
			<Iconify
				icon="ph:check-circle-fill"
				width={22}
				sx={{ color: 'text.disabled' }}
			/>
		);
	}

	if (value.kind === 'no') {
		return (
			<Iconify
				icon="ph:minus-bold"
				width={20}
				sx={{ color: 'text.disabled' }}
			/>
		);
	}

	return (
		<Box
			component="span"
			sx={{
				display: 'inline-block',
				px: 1.25,
				py: 0.5,
				borderRadius: '6px',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				fontSize: 12,
				fontWeight: 600,
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			{value.label}
		</Box>
	);
};

const ProductHeaderCell = ({
	initial,
	displayName,
	highlight,
}: {
	initial: string;
	displayName: string;
	highlight: boolean;
}) => {
	return (
		<Stack direction="row" spacing={1.5} alignItems="center">
			<Box
				sx={{
					width: 24,
					height: 24,
					borderRadius: '6px',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 11,
					fontWeight: 700,
					bgcolor: highlight ? 'primary.main' : 'background.neutral',
					color: highlight ? 'common.white' : 'text.secondary',
				}}
			>
				{initial}
			</Box>
			<Typography
				component="span"
				sx={{
					fontSize: 14,
					fontWeight: highlight ? 700 : 600,
					color: highlight ? 'text.primary' : 'text.secondary',
				}}
			>
				{displayName}
			</Typography>
		</Stack>
	);
};

// ----------------------------------------------------------------------

export const ComparisonFeatureTable = ({
	title,
	subhead,
	usDisplayName,
	themDisplayName,
	usInitial,
	themInitial,
	groups,
}: ComparisonFeatureTableProps) => {
	return (
		<Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
			<Container maxWidth="md" component={MotionViewport}>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						mb: { xs: 5, md: 7 },
						textAlign: 'center',
					}}
				>
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							color: 'text.primary',
							mb: subhead ? 1.5 : 0,
						}}
					>
						{title}
					</Typography>
					{subhead ? (
						<Typography
							sx={{
								fontSize: { xs: 15, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							{subhead}
						</Typography>
					) : null}
				</Box>

				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						borderRadius: '24px',
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						overflow: 'hidden',
						boxShadow: '0 1px 2px 0 rgba(17,24,39,0.04)',
					}}
				>
					<Box sx={{ overflowX: 'auto' }}>
						<Box
							component="table"
							sx={{
								width: '100%',
								minWidth: 700,
								borderCollapse: 'collapse',
								fontSize: 14,
								'& th, & td': {
									textAlign: 'left',
									px: 3,
									py: 2.5,
									verticalAlign: 'middle',
								},
							}}
						>
							<Box component="thead" sx={{ bgcolor: 'background.paper' }}>
								<Box component="tr">
									<Box
										component="th"
										scope="col"
										sx={{
											fontWeight: 700,
											color: 'text.primary',
											width: '34%',
											borderBottom: '1px solid',
											borderColor: 'divider',
										}}
									>
										Feature
									</Box>
									<Box
										component="th"
										scope="col"
										sx={{
											width: '20%',
											borderBottom: '1px solid',
											borderColor: 'divider',
										}}
									>
										<ProductHeaderCell
											initial={usInitial}
											displayName={usDisplayName}
											highlight
										/>
									</Box>
									<Box
										component="th"
										scope="col"
										sx={{
											width: '20%',
											borderBottom: '1px solid',
											borderColor: 'divider',
										}}
									>
										<ProductHeaderCell
											initial={themInitial}
											displayName={themDisplayName}
											highlight={false}
										/>
									</Box>
									<Box
										component="th"
										scope="col"
										sx={{
											fontWeight: 600,
											color: 'text.secondary',
											borderBottom: '1px solid',
											borderColor: 'divider',
										}}
									>
										Notes
									</Box>
								</Box>
							</Box>
							<Box component="tbody">
								{groups.map((group) => {
									return (
										<Fragment key={group.id}>
											<Box component="tr">
												<Box
													component="td"
													colSpan={4}
													sx={{
														bgcolor: 'background.neutral',
														color: 'text.primary',
														fontWeight: 700,
														fontSize: 12,
														textTransform: 'uppercase',
														letterSpacing: '0.12em',
														borderBottom: '1px solid',
														borderColor: 'divider',
													}}
												>
													{group.label}
												</Box>
											</Box>
											{group.rows.map((row) => {
												return (
													<Box
														component="tr"
														key={`${group.id}-${row.id}`}
														sx={{
															borderBottom: '1px solid',
															borderColor: 'divider',
															transition: 'background-color 180ms ease',
															'&:last-of-type': {
																borderBottom: 'none',
															},
															'&:hover': {
																bgcolor: 'action.hover',
															},
														}}
													>
														<Box
															component="td"
															sx={{
																fontWeight: 600,
																color: 'text.primary',
															}}
														>
															{row.feature}
														</Box>
														<Box component="td">
															<Cell value={row.us} />
														</Box>
														<Box component="td">
															<Cell value={row.them} />
														</Box>
														<Box
															component="td"
															sx={{
																color: row.notesEmphasis
																	? 'text.primary'
																	: 'text.secondary',
																fontWeight: row.notesEmphasis ? 600 : 400,
															}}
														>
															{row.notes}
														</Box>
													</Box>
												);
											})}
										</Fragment>
									);
								})}
							</Box>
						</Box>
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
