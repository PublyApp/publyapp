// theme.ts
import { createTheme } from '@mantine/core';

import { Button } from './components/Button/Button';
import { themeOptions } from './options';

// Do not forget to pass theme to MantineProvider
export const theme = createTheme(themeOptions);

const components = {
	Button,
};

theme.components = components;
