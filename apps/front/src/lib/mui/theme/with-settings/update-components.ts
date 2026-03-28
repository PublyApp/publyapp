import type {
	Components,
	ComponentsOverrides,
	ComponentsPropsList,
	CSSObject,
	Theme,
} from '@mui/material/styles';

import type { SettingsState } from '#app/components/settings/index.ts';

import type { ThemeOptions } from '../types';

// ----------------------------------------------------------------------

type ComponentSlot<
	Name extends keyof ComponentsOverrides<Theme>,
	Slot extends keyof NonNullable<ComponentsOverrides<Theme>[Name]>,
> = NonNullable<ComponentsOverrides<Theme>[Name]>[Slot];

const getSlotStyles = <
	Name extends keyof ComponentsOverrides<Theme>,
	Slot extends keyof NonNullable<ComponentsOverrides<Theme>[Name]>,
>(
	slot: ComponentSlot<Name, Slot>,
	props?: ComponentsPropsList[Name],
): CSSObject => {
	const slotStyles =
		typeof slot === 'function' && props ? slot(props) : (slot ?? {});

	return slotStyles;
};

// ----------------------------------------------------------------------

export const updateComponentsWithSettings = (
	components?: Components<Theme>,
	settingsState?: SettingsState,
): Pick<ThemeOptions, 'components'> => {
	const MuiCard: Components<Theme>['MuiCard'] = {
		styleOverrides: {
			root: (props) => {
				const { theme } = props;

				const rootStyles = getSlotStyles<'MuiCard', 'root'>(
					components?.MuiCard?.styleOverrides?.root,
					props,
				);

				return {
					...rootStyles,
					...(settingsState?.contrast === 'hight' && {
						boxShadow: theme.vars.customShadows.z1,
					}),
				};
			},
		},
	};

	const MuiCssBaseline: Components<Theme>['MuiCssBaseline'] = {
		styleOverrides: {
			html: {
				fontSize: settingsState?.fontSize,
			},
		},
	};

	return {
		components: {
			MuiCard,
			MuiCssBaseline,
		},
	};
};
