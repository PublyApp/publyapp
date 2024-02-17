import { useCallback } from 'react';

import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import { m } from 'framer-motion';

import { varHover } from '@devist/ui-react/components/animate/variants/actions';

import CustomPopover from '@/ui-react/components/CustomPopover';
import Iconify from '@/ui-react/components/Iconify';
import usePopover from '@/ui-react/hooks/usePopover';
import useTranslate from '@/ui-react/hooks/useTranslate';

// import CustomPopover, { usePopover } from 'src/components/custom-popover';
// import Iconify from 'src/components/iconify';
// import { useLocales, useTranslate } from 'src/locales';

// ----------------------------------------------------------------------

const LanguagePopover = () => {
	const popover = usePopover();

	const { setLocale, allLangs, lang: currentLang } = useTranslate();

	const handleChangeLang = useCallback(
		(newLang: string) => {
			setLocale(newLang as never);
			popover.onClose();
		},
		[popover, setLocale],
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
				<Iconify icon={currentLang.icon} sx={{ borderRadius: 0.65, width: 28 }} />
			</IconButton>

			<CustomPopover open={popover.open} onClose={popover.onClose} sx={{ width: 160 }}>
				{allLangs.map((option) => {
					return (
						<MenuItem
							key={option.value}
							selected={option.value === currentLang.value}
							onClick={() => {
								return handleChangeLang(option.value);
							}}
						>
							<Iconify icon={option.icon} sx={{ borderRadius: 0.65, width: 28 }} />

							{option.label}
						</MenuItem>
					);
				})}
			</CustomPopover>
		</>
	);
};

export default LanguagePopover;
