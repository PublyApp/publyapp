import _ from "lodash";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import type { Breakpoint } from "@mui/material/styles";

import { Logo } from "@/front/components/logo/logo";
import { RouterLink } from "@/front/components/router-link";

import { SettingsButton } from "../components/settings-button";
import { HeaderSection, type HeaderSectionProps } from "../core/header-section";
import { LayoutSection, type LayoutSectionProps } from "../core/layout-section";
import { MainSection, type MainSectionProps } from "../core/main-section";

import {
	SimpleCompactContent,
	type SimpleCompactContentProps,
} from "./content";

// ----------------------------------------------------------------------

type LayoutBaseProps = Pick<LayoutSectionProps, "sx" | "children" | "cssVars">;

export type SimpleLayoutProps = LayoutBaseProps & {
	layoutQuery?: Breakpoint;
	slotProps?: {
		header?: HeaderSectionProps;
		main?: MainSectionProps;
		content?: SimpleCompactContentProps & { compact?: boolean };
	};
};

export const SimpleLayout = ({
	sx,
	cssVars,
	children,
	slotProps,
	layoutQuery = "md",
}: SimpleLayoutProps) => {
	const renderHeader = () => {
		const headerSlotProps: HeaderSectionProps["slotProps"] = {
			container: { maxWidth: false },
		};

		const headerSlots: HeaderSectionProps["slots"] = {
			topArea: (
				<Alert severity="info" sx={{ display: "none", borderRadius: 0 }}>
					This is an info Alert.
				</Alert>
			),
			leftArea: <Logo />,
			rightArea: (
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: { xs: 1, sm: 1.5 },
					}}
				>
					{/** @slot Help link */}
					{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
					<Link
						href="#"
						component={RouterLink}
						color="inherit"
						sx={{ typography: "subtitle2" }}
					>
						Need help?
					</Link>

					{/** @slot Settings button */}
					<SettingsButton />
				</Box>
			),
		};

		return (
			<HeaderSection
				layoutQuery={layoutQuery}
				{...slotProps?.header}
				slots={{ ...headerSlots, ...slotProps?.header?.slots }}
				slotProps={_.merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
				sx={slotProps?.header?.sx}
			/>
		);
	};

	const renderFooter = () => {
		return null;
	};

	const renderMain = () => {
		const { compact, ...restContentProps } = slotProps?.content ?? {};

		return (
			<MainSection {...slotProps?.main}>
				{compact ? (
					<SimpleCompactContent layoutQuery={layoutQuery} {...restContentProps}>
						{children}
					</SimpleCompactContent>
				) : (
					children
				)}
			</MainSection>
		);
	};

	return (
		<LayoutSection
			/** **************************************
			 * @Header
			 *************************************** */
			headerSection={renderHeader()}
			/** **************************************
			 * @Footer
			 *************************************** */
			footerSection={renderFooter()}
			/** **************************************
			 * @Styles
			 *************************************** */
			cssVars={{ "--layout-simple-content-compact-width": "448px", ...cssVars }}
			sx={sx}
		>
			{renderMain()}
		</LayoutSection>
	);
};
