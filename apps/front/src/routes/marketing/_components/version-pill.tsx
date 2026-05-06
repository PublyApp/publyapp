import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { copyToClipboard } from '#app/lib/clipboard.ts';

// ----------------------------------------------------------------------

// Convert a semver-style version string into an HTML-id-safe anchor slug.
// 'v1.4.2' → 'v1-4-2'. Dots are valid in HTML ids but ugly in CSS selectors
// (need backslash-escape) — dashes match the rest of our slug conventions.
export const slugifyVersion = (version: string): string => {
	return version.toLowerCase().replace(/\./g, '-');
};

// ----------------------------------------------------------------------

type VersionPillProps = {
	version: string; // 'v1.4.2'
};

export const VersionPill = ({ version }: VersionPillProps) => {
	const [copied, setCopied] = useState(false);
	const slug = slugifyVersion(version);

	const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();

		// Build the absolute URL so the copied link includes origin + the
		// year route the entry is rendered on.
		const absoluteUrl =
			typeof window !== 'undefined'
				? `${window.location.origin}${window.location.pathname}#${slug}`
				: `#${slug}`;

		const ok = await copyToClipboard(absoluteUrl);

		if (ok) {
			setCopied(true);
			setTimeout(() => {
				return setCopied(false);
			}, 2000);
		}

		// Smooth-scroll the entry into view after the copy succeeds. Each
		// entry has scrollMarginTop in its sx so it parks below the topbar.
		if (typeof document !== 'undefined') {
			const target = document.getElementById(slug);
			target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	return (
		<Stack
			component="a"
			href={`#${slug}`}
			onClick={handleClick}
			direction="row"
			spacing={0.75}
			alignItems="center"
			aria-label={copied ? 'Copied' : `Copy link to ${version}`}
			title={copied ? 'Copied!' : `Copy link to ${version}`}
			sx={{
				display: 'inline-flex',
				px: 1,
				py: '4px',
				borderRadius: '6px',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				fontFamily:
					'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				fontSize: 11,
				fontWeight: 500,
				textDecoration: 'none',
				border: '1px solid',
				borderColor: 'transparent',
				cursor: 'pointer',
				transition: 'background-color 200ms ease, border-color 200ms ease',
				'&:hover': {
					bgcolor: 'background.paper',
					borderColor: 'divider',
				},
			}}
		>
			<Box component="span">{`#${version}`}</Box>
			<Iconify
				icon={copied ? 'ph:check-bold' : 'ph:link-bold'}
				width={11}
				sx={{
					color: copied ? 'primary.main' : 'inherit',
					transition: 'color 200ms ease',
				}}
			/>
		</Stack>
	);
};
