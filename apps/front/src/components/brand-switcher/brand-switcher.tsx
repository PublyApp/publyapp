import { useCallback } from 'react';
import { usePopover } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';

import { Iconify } from '@/front/components/iconify';
import { Scrollbar } from '@/front/components/scrollbar';
import { CustomPopover } from '@/front/components/custom-popover';

import { useBrand } from './brand-context';

import type { BrandItem, BrandSwitcherProps } from './types';

// ----------------------------------------------------------------------

export function BrandSwitcher({ sx }: BrandSwitcherProps) {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const { brand, brands, setBrand } = useBrand();

	const handleChangeBrand = useCallback(
		(newBrand: BrandItem) => {
			setBrand(newBrand);
			onClose();
		},
		[setBrand, onClose],
	);

	const renderTrigger = () => (
		<ButtonBase
			disableRipple
			onClick={onOpen}
			sx={[
				(theme) => ({
					...theme.typography.body2,
					py: 0.25,
					px: 0.5,
					mx: -0.5,
					gap: 0.5,
					borderRadius: 0.5,
					alignItems: 'center',
					display: 'inline-flex',
					color: theme.vars.palette.text.primary,
					'&:hover': {
						bgcolor: theme.vars.palette.action.hover,
					},
				}),
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		>
			{brand?.logo && (
				<Box
					component="img"
					alt={brand.name}
					src={brand.logo}
					sx={{ width: 16, height: 16, borderRadius: '50%' }}
				/>
			)}

			<Box component="span">{brand?.name}</Box>

			<Iconify
				width={14}
				icon="eva:chevron-down-fill"
				sx={{ color: 'text.disabled' }}
			/>
		</ButtonBase>
	);

	const renderMenu = () => (
		<CustomPopover
			open={open}
			anchorEl={anchorEl}
			onClose={onClose}
			slotProps={{
				arrow: { placement: 'top-left' },
				paper: { sx: { mt: 0.5, width: 200 } },
			}}
		>
			<Scrollbar sx={{ maxHeight: 240 }}>
				<MenuList>
					{brands.map((option) => (
						<MenuItem
							key={option.id}
							selected={option.id === brand?.id}
							onClick={() => handleChangeBrand(option)}
							sx={{ height: 30, gap: 0.75 }}
						>
							{option.logo ? (
								<Avatar
									alt={option.name}
									src={option.logo}
									sx={{ width: 20, height: 20 }}
								/>
							) : (
								<Avatar sx={{ width: 20, height: 20, fontSize: 12 }}>
									{option.name.charAt(0)}
								</Avatar>
							)}

							<Typography
								noWrap
								component="span"
								variant="body2"
								sx={{ flexGrow: 1, fontWeight: 'fontWeightMedium' }}
							>
								{option.name}
							</Typography>

							{option.id === brand?.id && (
								<Iconify
									icon="eva:checkmark-fill"
									width={16}
									sx={{ color: 'primary.main' }}
								/>
							)}
						</MenuItem>
					))}
				</MenuList>
			</Scrollbar>
		</CustomPopover>
	);

	return (
		<>
			{renderTrigger()}
			{renderMenu()}
		</>
	);
}
