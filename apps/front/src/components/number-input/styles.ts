import ButtonBase from '@mui/material/ButtonBase';
import FormHelperText from '@mui/material/FormHelperText';
import InputBase, { inputBaseClasses } from '@mui/material/InputBase';
import { styled } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const NumberInputRoot = styled('div')(({ theme }) => {
	return {
		display: 'flex',
		overflow: 'hidden',
		borderRadius: theme.shape.borderRadius,
		border: 'solid 1px var(--border-color)',
	};
});

export const InputContainer = styled('div')(() => {
	return {
		display: 'flex',
		alignItems: 'center',
		flexDirection: 'column',
		justifyContent: 'center',
		backgroundColor: 'var(--input-background)',
		borderLeft: 'solid 1px var(--divider-vertical-color)',
		borderRight: 'solid 1px var(--divider-vertical-color)',
	};
});

export const CenteredInput = styled(InputBase)(({ theme }) => {
	return {
		[`& .${inputBaseClasses.input}`]: {
			...theme.typography.body2,
			minHeight: 24,
			textAlign: 'center',
			padding: theme.spacing(0.5, 0),
			fontWeight: theme.typography.fontWeightMedium,
		},
	};
});

export const CounterButton = styled(ButtonBase, {
	shouldForwardProp: (prop: string) => {
		return !['disabled', 'sx'].includes(prop);
	},
})(() => {
	return {
		width: 32,
		flexShrink: 0,
		variants: [
			{
				props: { disabled: true },
				style: {
					opacity: 0.48,
					pointerEvents: 'none',
				},
			},
		],
	};
});

export const CaptionText = styled('span')(({ theme }) => {
	return {
		...theme.typography.caption,
		width: '100%',
		display: 'flex',
		textAlign: 'center',
		alignItems: 'center',
		gap: theme.spacing(0.5),
		justifyContent: 'center',
		marginTop: theme.spacing(-0.25),
		color: theme.vars.palette.text.disabled,
		padding: theme.spacing(0, 0.5, 0.5, 0.5),
	};
});

export const HelperText = styled(FormHelperText)(({ theme }) => {
	return {
		display: 'flex',
		alignItems: 'center',
		gap: theme.spacing(0.5),
	};
});
