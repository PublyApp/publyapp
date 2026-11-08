import nativewindPreset from 'nativewind/preset';
import type { Config } from 'tailwindcss';

/**
 * Tokens copied from apps/front/src/styles/app.css (light theme only).
 * ponytail: temporary until @radandevist/radan-ui ships its native theme —
 * then this file disappears in favour of the shared theme import.
 */
const config: Config = {
	content: ['./src/**/*.{ts,tsx}'],
	presets: [nativewindPreset],
	theme: {
		extend: {
			colors: {
				background: '#f7f7f7',
				card: '#f2f2f2',
				foreground: '#18181b',
				'foreground-secondary': '#3f3f46',
				'foreground-muted': '#6b6b73',
				border: '#e3e3e3',
				input: '#e4e4e7',
				primary: '#fecd00',
				'primary-active': '#d9aa00',
				'primary-foreground': '#423600',
				destructive: '#dc2626',
				success: '#047857',
				warning: '#b45309',
				'chip-pending-bg': '#fef3c7',
				'chip-pending-text': '#92400e',
				'chip-active-bg': '#dcfce7',
				'chip-active-text': '#166534',
			},
			borderRadius: {
				control: '14px',
				field: '10px',
				chip: '8px',
			},
		},
	},
	plugins: [],
};

export default config;
