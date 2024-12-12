import { createTheme } from '@mantine/core';
import { themeToVars } from '@mantine/vanilla-extract';

import { themeOptions } from './options';

// import { themeOptions } from './theme';

const theme = createTheme(themeOptions);

// CSS variables object, can be access in *.css.ts files
export const vars = themeToVars(theme);
