import { useCallback } from 'react';

import IconButton from '@mui/material/IconButton';
// @mui
import MenuItem from '@mui/material/MenuItem';
import { m } from 'framer-motion';
import { varHover } from 'src/components/animate';

// components
import Iconify from '@devist/ui-react/components/Iconify';

import CustomPopover /* , { usePopover } */ from './CustomPopover';

// locales
// import { useLocales } from 'src/locales';

// ----------------------------------------------------------------------

const LanguagePopover = () => {
	// const locales = useLocales();

	const popover = usePopover();

	const handleChangeLang = useCallback(
		(newLang: string) => {
			console.log('====================================');
			console.log(newLang);
			console.log('====================================');
			// locales.onChangeLang(newLang);
			// popover.onClose();
		},
		[
			/* locales, popover */
		],
	);

	return (
		<>
			<IconButton
				component={m.button}
				whileTap="tap"
				whileHover="hover"
				variants={varHover(1.05)}
				onClick={popover.onOpen}
				sx={{
					width: 40,
					height: 40,
					...(popover.open && {
						bgcolor: 'action.selected',
					}),
				}}
			>
				{/* <Iconify icon={locales.currentLang.icon} sx={{ borderRadius: 0.65, width: 28 }} /> */}
			</IconButton>

			<CustomPopover open={popover.open} onClose={popover.onClose} sx={{ width: 160 }}>
				{
					/* locales.allLangs */ ([] as any[]).map((option) => {
						return (
							<MenuItem
								key={option.value}
								selected={option.value === /* locales.currentLang.value */ 'icon'}
								onClick={() => {
									return handleChangeLang(option.value);
								}}
							>
								<Iconify icon={option.icon} sx={{ borderRadius: 0.65, width: 28 }} />

								{option.label}
							</MenuItem>
						);
					})
				}
			</CustomPopover>
		</>
	);
};

export default LanguagePopover;
