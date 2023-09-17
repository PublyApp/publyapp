import { Theme } from '@mui/material';

import { Button } from './Button';
import { Input } from './Input';
import { Lists } from './Lists';
import { Menu } from './Menu';
import { Paper } from './Paper';
import { Select } from './Select';
import { Skeleton } from './Skeleton';
import { ToggleButtons } from './ToggleButtons';

export const getComponentOverrides = (theme: Theme) => {
	return Object.assign(
		ToggleButtons(theme),
		Select(),
		Input(theme),
		Lists(theme),
		Paper(),
		Button(theme),
		Menu(theme),
		Skeleton(theme),
	);
};
