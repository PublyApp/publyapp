import { Box, Link, Breadcrumbs as MUIBreadcrumbs, type BreadcrumbsProps as MUIBreadCrumbsProps } from '@mui/material';

import RouterLink from './RouterLink';

type BreadcrumbsProps = MUIBreadCrumbsProps & {
	links: BreadcrumbsLinkProps[];
	activeLast?: boolean;
};

const Breadcrumbs = ({ links, activeLast, ...other }: BreadcrumbsProps) => {
	const lastLink = links[links.length - 1].name;

	return (
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		<MUIBreadcrumbs separator={<Separator />} {...other}>
			{links.map((link) => {
				// eslint-disable-next-line @typescript-eslint/no-use-before-define
				return <LinkItem key={link.name || ''} link={link} activeLast={activeLast} disabled={link.name === lastLink} />;
			})}
		</MUIBreadcrumbs>
	);
};

export default Breadcrumbs;

// ----------------------------------------------------------------------

export type BreadcrumbsLinkProps = {
	name?: string;
	href?: string;
	icon?: React.ReactElement;
};

type LinkItemProps = {
	link: BreadcrumbsLinkProps;
	activeLast?: boolean;
	disabled: boolean;
};

const LinkItem = ({ link, activeLast, disabled }: LinkItemProps) => {
	const { name, href, icon } = link;

	const styles = {
		typography: 'body2',
		alignItems: 'center',
		color: 'text.primary',
		display: 'inline-flex',
		...(disabled &&
			!activeLast && {
				cursor: 'default',
				pointerEvents: 'none',
				color: 'text.disabled',
			}),
	};

	const renderContent = (
		<>
			{icon && (
				<Box
					component="span"
					sx={{
						mr: 1,
						display: 'inherit',
						'& svg': { width: 20, height: 20 },
					}}
				>
					{icon}
				</Box>
			)}

			{name}
		</>
	);

	if (href) {
		return (
			<Link component={RouterLink} href={href} sx={styles}>
				{renderContent}
			</Link>
		);
	}

	return <Box sx={styles}> {renderContent} </Box>;
};

// ----------------------------------------------------------------------

const Separator = () => {
	return (
		<Box
			component="span"
			sx={{
				width: 4,
				height: 4,
				borderRadius: '50%',
				bgcolor: 'text.disabled',
			}}
		/>
	);
};
