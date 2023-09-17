import { SvgIcon, SvgIconProps } from '@mui/material';

// Using for Select Input
export const InputSelectIcon = (props: SvgIconProps) => {
	return (
		<SvgIcon
			{...props}
			sx={{
				width: 18,
				height: 18,
				right: 12,
				fontSize: 'unset',
				position: 'absolute',
				top: 'calc(50% - 8px)',
				pointerEvents: 'none',
			}}
		>
			<path d="M12 16.5 4.5 9l1.05-1.05L12 14.4l6.45-6.45L19.5 9z" />
		</SvgIcon>
	);
};
