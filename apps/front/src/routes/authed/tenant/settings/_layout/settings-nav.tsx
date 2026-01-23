import Box from '@mui/material/Box';

import { RouterLink } from '@/front/components/router-link';
import useMatchPath from '@/front/hooks/use-match-path';

export type SettingsNavItem = {
	label: string;
	href: string;
	/** If true, match sub-paths as active (default: false for exact match) */
	deep?: boolean;
};

type SettingsNavProps = {
	items: SettingsNavItem[];
};

export const SettingsNav = ({ items }: SettingsNavProps) => {
	const matchPath = useMatchPath();

	return (
		<Box component="nav">
			<Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
				{items.map((item) => {
					const { active: isActive } = matchPath(item.href, item.deep ?? false);

					return (
						<Box component="li" key={item.href}>
							<Box
								component={RouterLink}
								href={item.href}
								sx={{
									display: 'block',
									py: 0.75,
									textDecoration: 'none',
									color: isActive ? 'primary.main' : 'text.secondary',
									fontWeight: isActive ? 600 : 400,
									fontSize: '0.875rem',
									transition: 'color 0.15s ease-in-out',
									'&:hover': {
										color: 'primary.main',
									},
								}}
							>
								{item.label}
							</Box>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};
