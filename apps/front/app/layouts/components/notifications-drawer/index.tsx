import { useCallback, useState } from "react";

import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton, { type IconButtonProps } from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { m } from "framer-motion";
import { useBoolean } from "minimal-shared/hooks";

import { transitionTap, varHover, varTap } from "@/front/components/animate";
import { CustomTabs } from "@/front/components/custom-tabs";
import { Iconify } from "@/front/components/iconify/iconify";
import { Label } from "@/front/components/label";
import { Scrollbar } from "@/front/components/scrollbar";

import {
	NotificationItem,
	type NotificationItemProps,
} from "./notification-item";

// ----------------------------------------------------------------------

const TABS = [
	{ value: "all", label: "All", count: 22 },
	{ value: "unread", label: "Unread", count: 12 },
	{ value: "archived", label: "Archived", count: 10 },
];

// ----------------------------------------------------------------------

export type NotificationsDrawerProps = IconButtonProps & {
	data?: NotificationItemProps["notification"][];
};

export const NotificationsDrawer = ({
	data = [],
	sx,
	...other
}: NotificationsDrawerProps) => {
	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

	const [currentTab, setCurrentTab] = useState("all");

	const handleChangeTab = useCallback(
		(_event: React.SyntheticEvent, newValue: string) => {
			setCurrentTab(newValue);
		},
		[],
	);

	const [notifications, setNotifications] = useState(data);

	const totalUnRead = notifications.filter((item) => {
		return item.isUnRead === true;
	}).length;

	const handleMarkAllAsRead = () => {
		setNotifications(
			notifications.map((notification) => {
				return { ...notification, isUnRead: false };
			}),
		);
	};

	const renderHead = () => {
		return (
			<Box
				sx={{
					py: 2,
					pr: 1,
					pl: 2.5,
					minHeight: 68,
					display: "flex",
					alignItems: "center",
				}}
			>
				<Typography variant="h6" sx={{ flexGrow: 1 }}>
					Notifications
				</Typography>

				{!!totalUnRead && (
					<Tooltip title="Mark all as read">
						<IconButton color="primary" onClick={handleMarkAllAsRead}>
							<Iconify icon="eva:done-all-fill" />
						</IconButton>
					</Tooltip>
				)}

				<IconButton
					onClick={onClose}
					sx={{ display: { xs: "inline-flex", sm: "none" } }}
				>
					<Iconify icon="mingcute:close-line" />
				</IconButton>

				<IconButton>
					<Iconify icon="solar:settings-bold-duotone" />
				</IconButton>
			</Box>
		);
	};

	const renderTabs = () => {
		return (
			<CustomTabs
				variant="fullWidth"
				value={currentTab}
				onChange={handleChangeTab}
			>
				{TABS.map((tab) => {
					return (
						<Tab
							key={tab.value}
							iconPosition="end"
							value={tab.value}
							label={tab.label}
							icon={
								<Label
									variant={
										((tab.value === "all" || tab.value === currentTab) &&
											"filled") ||
										"soft"
									}
									color={
										(tab.value === "unread" && "info") ||
										(tab.value === "archived" && "success") ||
										"default"
									}
								>
									{tab.count}
								</Label>
							}
						/>
					);
				})}
			</CustomTabs>
		);
	};

	const renderList = () => {
		return (
			<Scrollbar>
				<Box component="ul">
					{notifications?.map((notification) => {
						return (
							<Box
								component="li"
								key={notification.id}
								sx={{ display: "flex" }}
							>
								<NotificationItem notification={notification} />
							</Box>
						);
					})}
				</Box>
			</Scrollbar>
		);
	};

	return (
		<>
			<IconButton
				component={m.button}
				whileTap={varTap(0.96)}
				whileHover={varHover(1.04)}
				transition={transitionTap()}
				aria-label="Notifications button"
				onClick={onOpen}
				sx={sx}
				{...other}
			>
				<Badge badgeContent={totalUnRead} color="error">
					<Iconify width={24} icon="solar:bell-bing-bold-duotone" />
				</Badge>
			</IconButton>

			<Drawer
				open={open}
				onClose={onClose}
				anchor="right"
				slotProps={{
					backdrop: { invisible: true },
					paper: { sx: { width: 1, maxWidth: 420 } },
				}}
			>
				{renderHead()}
				{renderTabs()}
				{renderList()}

				<Box sx={{ p: 1 }}>
					<Button fullWidth size="large">
						View all
					</Button>
				</Box>
			</Drawer>
		</>
	);
};
