import { useCallback } from 'react';

import { IconButton, MenuItem } from '@mui/material';
import { useLocation } from '@remix-run/react';
import { m } from 'framer-motion';

import { varHover } from '@devist/ui-react/components/animate/variants/actions';

import RouterLink from '@/front/components/RouterLink';
import { appLocales } from '@/shared/lib/i18n/resources';
import CustomPopover from '@/ui-react/components/CustomPopover';
import Iconify from '@/ui-react/components/Iconify';
import usePopover from '@/ui-react/hooks/usePopover';
import useTranslate from '@/ui-react/hooks/useTranslate';

// ----------------------------------------------------------------------

const LanguagePopover = () => {
	const popover = usePopover();
	const location = useLocation();

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
							// eslint-disable-next-line @typescript-eslint/no-use-before-define
							href={`/${option.value}/${getPathnameWithoutLocale(location.pathname).substring(1)}`}
							disableAddLocaleToPath
							component={RouterLink}
							// LinkComponent="a"
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

//  ----------------------------------------------------------------------

const getPathnameWithoutLocale = (pathname: string) => {
	const locale = appLocales.find((iLocale) => {
		return pathname.startsWith(`/${iLocale}`);
	});

	if (locale) {
		return pathname.substring(1 + (locale?.length ?? 0));
	}

	return pathname;
};
