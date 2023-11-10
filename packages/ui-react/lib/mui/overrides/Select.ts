import { Components } from '@mui/material';

import { InputSelectIcon } from '@ui-react/components/CustomIcons';

type Return = Pick<Components, 'MuiSelect'>;

export const Select = (): Return => {
	return {
		MuiSelect: {
			defaultProps: {
				IconComponent: InputSelectIcon,
			},
		},
	};
};
