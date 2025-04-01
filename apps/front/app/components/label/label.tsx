import _ from 'lodash';

import { mergeClasses } from 'minimal-shared/utils';

import { labelClasses } from './classes';
import { LabelIcon, LabelRoot } from './styles';
import type { LabelProps } from './types';

// ----------------------------------------------------------------------

export const Label = ({
	sx,
	endIcon,
	children,
	startIcon,
	className,
	disabled,
	variant = 'soft',
	color = 'default',
	...other
}: LabelProps) => {
	return (
		<LabelRoot
			color={color}
			variant={variant}
			disabled={disabled}
			className={mergeClasses([labelClasses.root, className])}
			sx={sx}
			{...other}
		>
			{startIcon && <LabelIcon className={labelClasses.icon}>{startIcon}</LabelIcon>}

			{typeof children === 'string' ? _.upperFirst(children) : children}

			{endIcon && <LabelIcon className={labelClasses.icon}>{endIcon}</LabelIcon>}
		</LabelRoot>
	);
};
