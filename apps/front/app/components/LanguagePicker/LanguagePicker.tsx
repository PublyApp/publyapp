import { useState } from 'react';

import { Group, Menu, UnstyledButton } from '@mantine/core';
// import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { config } from '@/front/lib/i18n/config';

import { classes } from './LanguagePicker.css';

const supportedLanguages = config.supportedLngs;
const data = supportedLanguages.map((lang) => {
	return { label: lang };
});

export const LanguagePicker = () => {
	const [opened, setOpened] = useState(false);
	// const [selected, setSelected] = useState(data[0]);
	const { i18n } = useTranslation();
	const location = useLocation();

	const items = data.map((item) => {
		return (
			<Menu.Item
				// leftSection={<Image src={item.image} width={18} height={18} />}
				component={Link}
				to={`${location.pathname}?lng=${item.label}`}
				onClick={() => {
					// return setSelected(item);
					i18n.changeLanguage(item.label);
				}}
				key={item.label}
			>
				{item.label}
			</Menu.Item>
		);
	});

	return (
		<Menu
			onOpen={() => {
				return setOpened(true);
			}}
			onClose={() => {
				return setOpened(false);
			}}
			radius="md"
			width="target"
			withinPortal
		>
			<Menu.Target>
				<UnstyledButton className={classes.control} data-expanded={opened || undefined}>
					<Group gap="xs">
						{/* <Image src={selected.image} width={22} height={22} /> */}
						<span className={classes.label}>{i18n.language}</span>
					</Group>
					{/* <IconChevronDown size={16} className={classes.icon} stroke={1.5} /> */}
				</UnstyledButton>
			</Menu.Target>
			<Menu.Dropdown>{items}</Menu.Dropdown>
		</Menu>
	);
};
