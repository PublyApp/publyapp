import { styled } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';

import { navSectionClasses } from '#app/components/nav-section/index.ts';

// ----------------------------------------------------------------------

export const Nav = styled('nav')``;

// ----------------------------------------------------------------------

type NavLiProps = React.ComponentProps<'li'> & {
	disabled?: boolean;
};

export const NavLi = styled(
	(props: NavLiProps) => {
		return (
			<li
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
		<ul
			{...props}
			className={mergeClasses([navSectionClasses.ul, props.className])}
		/>
	);
})(() => {
	return { display: 'flex', flexDirection: 'column' };
});
