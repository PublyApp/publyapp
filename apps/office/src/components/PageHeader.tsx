import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Breadcrumbs, { type BreadcrumbsProps } from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import type { SxProps } from '@mui/material/styles';
import Typography, { type TypographyProps } from '@mui/material/Typography';

import { mergeSxProps } from '@devist/ui-react/utils/mui.utils';

import RouterLink from './RouterLink';

// ----------------------------------------------------------------------

export type BreadcrumbsLinkProps = {
	name?: string;
	href?: string;
	icon?: React.ReactElement;
};

export interface PageHeaderProps {
	heading?: ReactNode;
	moreLink?: string[];
	// activeLast?: boolean;
	actions?: ReactNode;
	// links: BreadcrumbsLinkProps[];
	sx?: SxProps;
	breadcrumbs?: ReactNode;
}

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

// ----------------------------------------------------------------------

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

const PageHeader = ({
	/* links, */
	actions,
	heading,
	moreLink,
	/* activeLast, */
	sx,
	/* ...other  */
	breadcrumbs,
}: PageHeaderProps) => {
	// const lastLink = links[links.length - 1].name;

	return (
		<Box sx={mergeSxProps({ mb: 4 }, sx)}>
			<Stack direction="row" alignItems="center">
				<Box sx={{ flexGrow: 1 }}>
					{/* HEADING */}
					{heading}
					{/* {heading && (
						<Typography variant="h4" gutterBottom>
							{heading}
						</Typography>
					)} */}

					{/* BREADCRUMBS */}
					{breadcrumbs}
					{/* {!!links.length && (
						<Breadcrumbs separator={<Separator />} {...other}>
							{links.map((link) => {
								return (
									<LinkItem
										key={link.name || ''}
										link={link}
										activeLast={activeLast}
										disabled={link.name === lastLink}
									/>
								);
							})}
						</Breadcrumbs>
					)} */}
				</Box>

				{actions && <Box sx={{ flexShrink: 0 }}> {actions} </Box>}
			</Stack>

			{/* MORE LINK */}
			{!!moreLink && (
				<Box sx={{ mt: 2 }}>
					{moreLink.map((href) => {
						return (
							<Link key={href} href={href} variant="body2" target="_blank" rel="noopener" sx={{ display: 'table' }}>
								{href}
							</Link>
						);
					})}
				</Box>
			)}
		</Box>
	);
};

type PageHeaderBreadcrumbsProps = BreadcrumbsProps & {
	links: BreadcrumbsLinkProps[];
	activeLast?: boolean;
};

PageHeader.Breadcrumbs = ({ links, activeLast, ...other }: PageHeaderBreadcrumbsProps) => {
	const lastLink = links[links.length - 1].name;

	return (
		<Breadcrumbs separator={<Separator />} {...other}>
			{links.map((link) => {
				return <LinkItem key={link.name || ''} link={link} activeLast={activeLast} disabled={link.name === lastLink} />;
			})}
		</Breadcrumbs>
	);
};

PageHeader.Heading = ({ variant = 'h4', gutterBottom = true, children, ...otherProps }: TypographyProps) => {
	return (
		<Typography variant={variant} gutterBottom={gutterBottom} {...otherProps}>
			{children}
		</Typography>
	);
};

export default PageHeader;
