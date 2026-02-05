import { addCollection, type IconifyJSON } from '@iconify/react';
import _ from 'lodash';

import allIcons from './icon-sets';

// ----------------------------------------------------------------------

export const iconSets = Object.entries(allIcons).reduce((acc, [key, value]) => {
	const [prefix, iconName] = key.split(':');
	const existingPrefix = acc.find((item) => {
		return item.prefix === prefix;
	});

	if (existingPrefix) {
		existingPrefix.icons[iconName] = value;
	} else {
		acc.push({
			prefix,
			icons: {
				[iconName]: value,
			},
		});
	}

	return acc;
}, [] as IconifyJSON[]);

export const allIconNames = Object.keys(allIcons) as IconifyName[];

export type IconifyName = keyof typeof allIcons;

// ----------------------------------------------------------------------

let areIconsRegistered = false;

export const registerIcons = () => {
	if (areIconsRegistered) {
		return;
	}

	_.forEach(iconSets, (iconSet) => {
		const iconSetConfig = {
			...iconSet,
			width: (iconSet.prefix === 'carbon' && 32) || 24,
			height: (iconSet.prefix === 'carbon' && 32) || 24,
		};

		addCollection(iconSetConfig);
	});

	areIconsRegistered = true;
};
