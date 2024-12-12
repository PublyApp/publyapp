import { Button as MantineButton } from '@mantine/core';

import { styles } from './Button.css';

export const Button = MantineButton.extend({
	classNames: () => {
		return {
			root: styles,
		};
	},
});
