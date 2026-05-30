import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';

import { navSectionClasses } from '../styles/classes';

// ----------------------------------------------------------------------

export const Nav = styled('nav')``;

// ----------------------------------------------------------------------

type NavLiProps = React.ComponentProps<'li'> & {
	disabled?: boolean;
};

export const NavLi = styled(
	(props: NavLiProps) => {
		return (
			<Box
				component="li"
				{...props}
				className={mergeClasses([navSectionClasses.li, props.className])}
			/>
		);
	},
	{
		shouldForwardProp: (prop: string) => {
			return !['disabled', 'sx'].includes(prop);
		},
	},
)(() => {
	return {
		display: 'inline-block',
		variants: [{ props: { disabled: true }, style: { cursor: 'not-allowed' } }],
	};
});

// ----------------------------------------------------------------------

type NavUlProps = React.ComponentProps<'ul'>;

export const NavUl = styled((props: NavUlProps) => {
	return (
		<Box
			component="ul"
			{...props}
			className={mergeClasses([navSectionClasses.ul, props.className])}
		/>
	);
})(() => {
	return { display: 'flex', flexDirection: 'column' };
});
