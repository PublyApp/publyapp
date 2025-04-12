/* eslint-disable @typescript-eslint/no-use-before-define */
import GlobalStyles from "@mui/material/GlobalStyles";
import {
	styled,
	type CSSObject,
	type SxProps,
	type Theme,
} from "@mui/material/styles";
import { mergeClasses } from "minimal-shared/utils";

import { layoutClasses } from "./classes";
import { layoutSectionVars } from "./css-vars";

// ----------------------------------------------------------------------

export type LayoutSectionProps = React.ComponentProps<"div"> & {
	sx?: SxProps<Theme>;
	cssVars?: CSSObject;
	children?: React.ReactNode;
	footerSection?: React.ReactNode;
	headerSection?: React.ReactNode;
	sidebarSection?: React.ReactNode;
};

export const LayoutSection = ({
	sx,
	cssVars,
	children,
	footerSection,
	headerSection,
	sidebarSection,
	className,
	...other
}: LayoutSectionProps) => {
	const inputGlobalStyles = (
		<GlobalStyles
			styles={(theme) => {
				return { body: { ...layoutSectionVars(theme), ...cssVars } };
			}}
		/>
	);

	return (
		<>
			{inputGlobalStyles}

			<LayoutRoot
				id="root__layout"
				className={mergeClasses([layoutClasses.root, className])}
				sx={sx}
				{...other}
			>
				{sidebarSection ? (
					<>
						{sidebarSection}
						<LayoutSidebarContainer className={layoutClasses.sidebarContainer}>
							{headerSection}
							{children}
							{footerSection}
						</LayoutSidebarContainer>
					</>
				) : (
					<>
						{headerSection}
						{children}
						{footerSection}
					</>
				)}
			</LayoutRoot>
		</>
	);
};

// ----------------------------------------------------------------------

const LayoutRoot = styled("div")``;

const LayoutSidebarContainer = styled("div")(() => {
	return {
		display: "flex",
		flex: "1 1 auto",
		flexDirection: "column",
	};
});
