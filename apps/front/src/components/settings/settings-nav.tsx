import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { varAlpha } from 'minimal-shared/utils';
import type { ReactNode } from 'react';

import { RouterLink } from '#app/components/router-link.tsx';
import useMatchPath from '#app/hooks/use-match-path.ts';

export type SettingsNavItem = {
	label: string;
	href: string;
	/** If true, match sub-paths as active (default: false for exact match) */
	deep?: boolean;
	disabled?: boolean;
	endIcon?: ReactNode;
};

type SettingsNavProps = {
	items: SettingsNavItem[];
};

export const SettingsNav = ({ items }: SettingsNavProps) => {
	const matchPath = useMatchPath();

	return (
		<Box component="nav">
			<List
				disablePadding
				dense
				sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
			>
				{items.map((item) => {
					const isDisabled = item.disabled ?? false;
					const { active: isActive } = matchPath(
						item.href,
						isDisabled ? false : (item.deep ?? false),
					);

					let textColor = 'text.secondary';
					let textWeight = 400;

					if (isActive) {
						textColor = 'primary.main';
						textWeight = 600;
					}

					if (isDisabled) {
						textColor = 'text.disabled';
						textWeight = 400;
					}

					const listItemButtonProps = isDisabled
						? { component: 'div' as const }
						: { component: RouterLink, href: item.href };

					return (
						<ListItem
							key={item.href}
							disablePadding
							disableGutters
							secondaryAction={
								item.endIcon ? (
									<Box
										component="span"
										sx={{ display: 'inline-flex', color: 'text.disabled' }}
									>
										{item.endIcon}
									</Box>
								) : undefined
							}
						>
							<ListItemButton
								{...listItemButtonProps}
								disabled={isDisabled}
								selected={!isDisabled && isActive}
								sx={{
									py: 0.5,
									px: 1.25,
									minHeight: 30,
									pr: item.endIcon ? 4 : undefined,
									borderRadius: 1,
									'&:hover': isDisabled
										? undefined
										: { bgcolor: 'action.hover' },
									'&.Mui-selected': (theme) => ({
										bgcolor: varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.08,
										),
										'&:hover': {
											bgcolor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.16,
											),
										},
									}),
									'& .MuiListItemText-primary': {
										fontSize: '13px',
										fontWeight: textWeight,
										color: textColor,
									},
								}}
							>
								<ListItemText primary={item.label} />
							</ListItemButton>
						</ListItem>
					);
				})}
			</List>
		</Box>
	);
};
