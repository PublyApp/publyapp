import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';
import { useId } from 'react';

import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';

import { CustomPopover } from '#app/components/custom-popover/custom-popover.tsx';
import { FlagIcon } from '#app/components/flag-icon/flag-icon.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { allLangs } from '#app/lib/locales/all-langs.ts';

// ----------------------------------------------------------------------

export const LanguageMenuItem = () => {
	const { t, onChangeLang, currentLang } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const submenuId = useId();

	const handleChangeLang = (newLang: AppLocale) => {
		void onChangeLang(newLang);
		onClose();
	};

	return (
		<>
			<MenuItem
				onClick={onOpen}
				aria-haspopup="menu"
				aria-expanded={open ? 'true' : undefined}
				aria-controls={open ? submenuId : undefined}
				sx={{
					'&.MuiMenuItem-root': { gap: 1 },
					py: 0.5,
					px: 1.5,
					minHeight: 32,
				}}
			>
				<FlagIcon
					code={currentLang.countryCode}
					sx={{ width: 18, height: 18 }}
				/>
				<Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
					{t('language')}
				</Typography>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
				>
					{currentLang.label}
				</Typography>
			</MenuItem>

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					arrow: { placement: 'left-top', hide: true },
					paper: { sx: { ml: 0.5 } },
				}}
			>
				<MenuList id={submenuId} autoFocusItem={open} sx={{ width: 160 }}>
					{allLangs.map((option) => {
						const isSelected = option.value === currentLang.value;

						return (
							<MenuItem
								key={option.value}
								selected={isSelected}
								autoFocus={isSelected}
								onClick={() => {
									handleChangeLang(option.value as AppLocale);
								}}
							>
								<FlagIcon code={option.countryCode} />
								{option.label}
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		</>
	);
};
