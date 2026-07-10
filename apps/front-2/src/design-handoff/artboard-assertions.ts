export const DELIVERED_ARTBOARD_IDS = [
	'2a',
	'2b',
	'2c',
	'2d',
	'2e',
	'2f',
	'2g',
	'2h',
	'2i',
	'3a',
	'3b',
	'3c',
	'3d',
	'3e',
	'4a',
	'4b',
	'4c',
	'4d',
	'5a',
	'5b',
	'5c',
	'5d',
	'5e',
	'5f',
	'5g',
	'5h',
	'5i',
	'5j',
	'6a',
	'6b',
	'6c',
	'6d',
	'7a',
	'7b',
	'7c',
	'7d',
	'7e',
	'7f',
	'7g',
	'7h',
	'7i',
	'8a',
	'8b',
	'8c',
	'8d',
	'8e',
	'8f',
	'8g',
	'8h',
	'8i',
	'8j',
	'8k',
	'8l',
	'8m',
	'8n',
	'8o',
	'8p',
] as const;

export const JSON_BACKED_ARTBOARD_IDS = [
	'2a',
	'2b',
	'2c',
	'2d',
	'2e',
	'2f',
	'2g',
	'2h',
	'3a',
	'3b',
	'3c',
	'3d',
	'4a',
	'4b',
	'5a',
	'5b',
	'5c',
	'5d',
	'5e',
	'6a',
	'6b',
	'6c',
	'6d',
] as const;

export const PROSE_BACKED_ARTBOARD_IDS = [
	'2i',
	'3e',
	'4c',
	'4d',
	'5f',
	'5g',
	'5h',
	'5i',
	'5j',
	'7a',
	'7b',
	'7c',
	'7d',
	'7e',
	'7f',
	'7g',
	'7h',
	'7i',
	'8a',
	'8b',
	'8c',
	'8d',
	'8e',
	'8f',
	'8g',
	'8h',
	'8i',
	'8j',
	'8k',
	'8l',
	'8m',
	'8n',
	'8o',
	'8p',
] as const;

type JsonBackedArtboardId = (typeof JSON_BACKED_ARTBOARD_IDS)[number];
type ProseBackedArtboardId = (typeof PROSE_BACKED_ARTBOARD_IDS)[number];

type FocusKind = 'token' | 'radius' | 'layout';

export type ArtboardFocusExpectation = {
	kind: FocusKind;
	component: string;
	property: string;
	expected: string;
};

export type ArtboardCoverage = {
	source: 'json-backed' | 'prose-backed';
	focus: readonly ArtboardFocusExpectation[];
	notes: readonly string[];
};

const JSON_BACKED_FOCUS: Record<
	JsonBackedArtboardId,
	readonly ArtboardFocusExpectation[]
> = {
	'2a': [
		{
			kind: 'layout',
			component: 'shell.rail',
			property: 'width',
			expected: '49px',
		},
		{
			kind: 'token',
			component: 'shell.rail',
			property: 'background',
			expected: '#fafafa',
		},
		{
			kind: 'radius',
			component: 'topbar.iconButton',
			property: 'border-radius',
			expected: '999px',
		},
		{
			kind: 'layout',
			component: 'bodyGrid',
			property: 'grid-template-columns',
			expected: '1fr 420px',
		},
	],
	'2b': [
		{
			kind: 'layout',
			component: 'shell.panel',
			property: 'width',
			expected: '272px',
		},
		{
			kind: 'token',
			component: 'shell.panel',
			property: 'background',
			expected: '#fafafa',
		},
		{
			kind: 'radius',
			component: 'shell.panel.searchRow',
			property: 'border-radius',
			expected: '10px',
		},
	],
	'2c': [
		{
			kind: 'token',
			component: 'identity.suspendButton',
			property: 'background',
			expected: 'rgba(220,38,38,0.08)',
		},
		{
			kind: 'layout',
			component: 'tabs.rule',
			property: 'border-bottom',
			expected: '1px solid #e4e4e7',
		},
		{
			kind: 'radius',
			component: 'card',
			property: 'border-radius',
			expected: '14px',
		},
	],
	'2d': [
		{
			kind: 'layout',
			component: 'field.input',
			property: 'height',
			expected: '36px',
		},
		{
			kind: 'radius',
			component: 'field.input',
			property: 'border-radius',
			expected: '10px',
		},
		{
			kind: 'token',
			component: 'field.input',
			property: 'border',
			expected: '1px solid #e4e4e7',
		},
	],
	'2e': [
		{
			kind: 'token',
			component: 'backdrop',
			property: 'background',
			expected: 'rgba(24,24,27,0.32)',
		},
		{
			kind: 'layout',
			component: 'modal',
			property: 'width',
			expected: '480px',
		},
		{
			kind: 'radius',
			component: 'modal',
			property: 'border-radius',
			expected: '28px',
		},
		{
			kind: 'radius',
			component: 'table.statusChip',
			property: 'border-radius',
			expected: '8px',
		},
	],
	'2f': [
		{
			kind: 'radius',
			component: 'empty.iconTile',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'radius',
			component: 'error.iconTile',
			property: 'border-radius',
			expected: '16px',
		},
		{
			kind: 'token',
			component: 'empty.iconTile',
			property: 'background',
			expected: '#f4f4f5',
		},
		{
			kind: 'layout',
			component: 'skeleton.row',
			property: 'height',
			expected: '48px',
		},
	],
	'2g': [
		{
			kind: 'layout',
			component: 'table',
			property: 'grid-template-columns',
			expected: '40px 240px 1fr 104px 140px 120px 40px',
		},
		{
			kind: 'radius',
			component: 'table.profileTile',
			property: 'border-radius',
			expected: '9px',
		},
	],
	'2h': [
		{
			kind: 'radius',
			component: 'identity.iconTile',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'layout',
			component: 'bodyGrid',
			property: 'grid-template-columns',
			expected: '1fr 420px',
		},
	],
	'3a': [
		{
			kind: 'token',
			component: 'shell.panel.viewsGroupLabel',
			property: 'text-transform',
			expected: 'uppercase',
		},
		{
			kind: 'layout',
			component: 'table',
			property: 'grid-template-columns',
			expected: '40px 248px 116px 124px 92px 1fr 132px 40px',
		},
		{
			kind: 'radius',
			component: 'table.tenantTile',
			property: 'border-radius',
			expected: '8px',
		},
	],
	'3b': [
		{
			kind: 'radius',
			component: 'identity.brandTile',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'layout',
			component: 'bodyGrid',
			property: 'grid-template-columns',
			expected: '1fr 420px',
		},
		{
			kind: 'token',
			component: 'meter.fill',
			property: 'background',
			expected: '#FDC700',
		},
	],
	'3c': [
		{
			kind: 'layout',
			component: 'field.input',
			property: 'height',
			expected: '36px',
		},
		{
			kind: 'radius',
			component: 'field.input',
			property: 'border-radius',
			expected: '10px',
		},
	],
	'3d': [
		{
			kind: 'layout',
			component: 'toolbar.dateRange',
			property: 'height',
			expected: '36px',
		},
		{
			kind: 'radius',
			component: 'toolbar.dateRange',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'token',
			component: 'table.row.selected',
			property: 'background',
			expected: '#f4f4f5',
		},
	],
	'4a': [
		{
			kind: 'token',
			component: 'panel.draftsBadge',
			property: 'background',
			expected: '#fffbeb',
		},
		{
			kind: 'radius',
			component: 'calendarToolbar.navButton',
			property: 'border-radius',
			expected: '10px',
		},
		{
			kind: 'layout',
			component: 'calendar.weekdayHeader',
			property: 'height',
			expected: '34px',
		},
	],
	'4b': [
		{
			kind: 'layout',
			component: 'table',
			property: 'grid-template-columns',
			expected: '40px 1fr 132px 190px 190px 168px 40px',
		},
		{
			kind: 'token',
			component: 'table.statusChip.scheduled',
			property: 'background',
			expected: '#f0f9ff',
		},
	],
	'5a': [
		{
			kind: 'token',
			component: 'panel.invitationsBadge',
			property: 'background',
			expected: '#fffbeb',
		},
		{
			kind: 'layout',
			component: 'table',
			property: 'grid-template-columns',
			expected: '40px 210px 250px 150px 122px 1fr 40px',
		},
		{
			kind: 'radius',
			component: 'inviteModal',
			property: 'border-radius',
			expected: '28px',
		},
	],
	'5b': [
		{
			kind: 'layout',
			component: 'table',
			property: 'grid-template-columns',
			expected: '220px 116px 128px 1fr 40px',
		},
		{
			kind: 'radius',
			component: 'table.roleTile',
			property: 'border-radius',
			expected: '9px',
		},
		{
			kind: 'token',
			component: 'table.typeChip.system',
			property: 'background',
			expected: '#f4f4f5',
		},
	],
	'5c': [
		{
			kind: 'layout',
			component: 'matrix',
			property: 'grid-template-columns',
			expected: '1fr 1fr',
		},
		{
			kind: 'token',
			component: 'group.header',
			property: 'background',
			expected: '#fcfcfd',
		},
		{
			kind: 'radius',
			component: 'perm.checkbox',
			property: 'border-radius',
			expected: '5px',
		},
	],
	'5d': [
		{
			kind: 'layout',
			component: 'grid',
			property: 'grid-template-columns',
			expected: 'repeat(3,1fr)',
		},
		{
			kind: 'radius',
			component: 'card',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'radius',
			component: 'card.button',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'token',
			component: 'card.button.connected',
			property: 'background',
			expected: '#ecfdf5',
		},
	],
	'5e': [
		{
			kind: 'radius',
			component: 'planCard',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'layout',
			component: 'planCard.footerStrip',
			property: 'grid-template-columns',
			expected: 'repeat(3,1fr)',
		},
		{
			kind: 'token',
			component: 'invoices.header',
			property: 'background',
			expected: '#fcfcfd',
		},
	],
	'6a': [
		{
			kind: 'layout',
			component: 'field.input',
			property: 'height',
			expected: '36px',
		},
		{
			kind: 'radius',
			component: 'field.input',
			property: 'border-radius',
			expected: '10px',
		},
	],
	'6b': [
		{
			kind: 'radius',
			component: 'passwordField',
			property: 'border-radius',
			expected: '10px',
		},
		{
			kind: 'token',
			component: 'twoFactorTile',
			property: 'background',
			expected: '#ecfdf5',
		},
	],
	'6c': [
		{
			kind: 'layout',
			component: 'switch',
			property: 'width',
			expected: '44px',
		},
	],
	'6d': [
		{
			kind: 'token',
			component: 'page',
			property: 'background',
			expected: '#fafafa',
		},
		{
			kind: 'layout',
			component: 'search',
			property: 'height',
			expected: '44px',
		},
		{
			kind: 'radius',
			component: 'search',
			property: 'border-radius',
			expected: '14px',
		},
	],
};

const PROSE_BACKED_FOCUS: Record<
	ProseBackedArtboardId,
	readonly ArtboardFocusExpectation[]
> = {
	'2i': [
		{
			kind: 'layout',
			component: 'table.row',
			property: 'height',
			expected: '48px',
		},
		{
			kind: 'radius',
			component: 'invitation.statusChip',
			property: 'border-radius',
			expected: '8px',
		},
	],
	'3e': [
		{
			kind: 'layout',
			component: 'field.input',
			property: 'height',
			expected: '36px',
		},
		{
			kind: 'token',
			component: 'dangerRow.transferOwnership',
			property: 'color',
			expected: '#dc2626',
		},
	],
	'4c': [
		{
			kind: 'token',
			component: 'draft.statusChip',
			property: 'background',
			expected: '#f4f4f5',
		},
		{
			kind: 'layout',
			component: 'table.row',
			property: 'height',
			expected: '48px',
		},
	],
	'4d': [
		{
			kind: 'token',
			component: 'published.statusChip',
			property: 'background',
			expected: '#ecfdf5',
		},
		{
			kind: 'layout',
			component: 'table.row',
			property: 'height',
			expected: '48px',
		},
	],
	'5f': [
		{
			kind: 'radius',
			component: 'settings.card',
			property: 'border-radius',
			expected: '14px',
		},
		{
			kind: 'token',
			component: 'settings.card',
			property: 'box-shadow',
			expected: '0 0 0 1px rgba(24,24,27,0.06)',
		},
	],
	'5g': [
		{
			kind: 'layout',
			component: 'settings.switchRow',
			property: 'min-height',
			expected: '48px',
		},
		{
			kind: 'radius',
			component: 'settings.smallControl',
			property: 'border-radius',
			expected: '10px',
		},
	],
	'5h': [
		{
			kind: 'layout',
			component: 'workspaces.grid',
			property: 'grid-template-columns',
			expected: 'repeat(3,1fr)',
		},
		{
			kind: 'radius',
			component: 'workspaces.addCard',
			property: 'border-radius',
			expected: '14px',
		},
	],
	'5i': [
		{
			kind: 'layout',
			component: 'security.switch',
			property: 'width',
			expected: '44px',
		},
		{
			kind: 'token',
			component: 'security.switch.on',
			property: 'background',
			expected: '#FDC700',
		},
	],
	'5j': [
		{
			kind: 'layout',
			component: 'invitations.table.row',
			property: 'height',
			expected: '48px',
		},
		{
			kind: 'radius',
			component: 'invitations.statusChip',
			property: 'border-radius',
			expected: '8px',
		},
	],
	'7a': [
		{
			kind: 'layout',
			component: 'responsive.tablet.list',
			property: 'grid-template-columns',
			expected: 'list-card rows',
		},
	],
	'7b': [
		{
			kind: 'layout',
			component: 'responsive.mobile.list',
			property: 'grid-template-columns',
			expected: '1fr',
		},
	],
	'7c': [
		{
			kind: 'layout',
			component: 'responsive.navDrawer',
			property: 'width',
			expected: 'min(320px,100vw)',
		},
	],
	'7d': [
		{
			kind: 'layout',
			component: 'responsive.mobile.detail',
			property: 'grid-template-columns',
			expected: '1fr',
		},
	],
	'7e': [
		{
			kind: 'layout',
			component: 'responsive.form.input',
			property: 'height',
			expected: '44px',
		},
	],
	'7f': [
		{
			kind: 'radius',
			component: 'responsive.confirmSheet',
			property: 'border-radius',
			expected: '28px 28px 0 0',
		},
	],
	'7g': [
		{
			kind: 'layout',
			component: 'responsive.tablet.detail',
			property: 'grid-template-columns',
			expected: '1fr',
		},
	],
	'7h': [
		{
			kind: 'layout',
			component: 'responsive.cardGrid',
			property: 'grid-template-columns',
			expected: '1fr',
		},
	],
	'7i': [
		{
			kind: 'layout',
			component: 'responsive.calendarAgenda',
			property: 'grid-template-columns',
			expected: '1fr',
		},
	],
	'8a': [
		{
			kind: 'layout',
			component: 'drawer.inviteStaff',
			property: 'width',
			expected: '460px',
		},
	],
	'8b': [
		{
			kind: 'layout',
			component: 'drawer.assignProfile',
			property: 'width',
			expected: '460px',
		},
	],
	'8c': [
		{
			kind: 'layout',
			component: 'drawer.editContact',
			property: 'width',
			expected: '460px',
		},
	],
	'8d': [
		{
			kind: 'layout',
			component: 'drawer.invitationDetail',
			property: 'width',
			expected: '460px',
		},
	],
	'8e': [
		{
			kind: 'layout',
			component: 'drawer.createProfile',
			property: 'width',
			expected: '460px',
		},
	],
	'8f': [
		{
			kind: 'layout',
			component: 'drawer.bulkAssignProfile',
			property: 'width',
			expected: '460px',
		},
	],
	'8g': [
		{
			kind: 'layout',
			component: 'drawer.composePost',
			property: 'width',
			expected: '460px',
		},
	],
	'8h': [
		{
			kind: 'layout',
			component: 'drawer.changeMemberRole',
			property: 'width',
			expected: '460px',
		},
	],
	'8i': [
		{
			kind: 'layout',
			component: 'drawer.createRole',
			property: 'width',
			expected: '460px',
		},
	],
	'8j': [
		{
			kind: 'layout',
			component: 'drawer.configureIntegration',
			property: 'width',
			expected: '460px',
		},
	],
	'8k': [
		{
			kind: 'layout',
			component: 'drawer.changePlan',
			property: 'width',
			expected: '460px',
		},
	],
	'8l': [
		{
			kind: 'layout',
			component: 'drawer.paymentMethod',
			property: 'width',
			expected: '460px',
		},
	],
	'8m': [
		{
			kind: 'layout',
			component: 'drawer.manageTwoFactor',
			property: 'width',
			expected: '460px',
		},
	],
	'8n': [
		{
			kind: 'layout',
			component: 'drawer.notifications',
			property: 'width',
			expected: '460px',
		},
	],
	'8o': [
		{
			kind: 'layout',
			component: 'drawer.newWorkspace',
			property: 'width',
			expected: '460px',
		},
	],
	'8p': [
		{
			kind: 'layout',
			component: 'drawer.filters',
			property: 'width',
			expected: '400px',
		},
		{
			kind: 'token',
			component: 'drawer',
			property: 'border-left',
			expected: '1px solid #e4e4e7',
		},
	],
};

const coverage: Record<string, ArtboardCoverage> = {};

for (const artboardId of JSON_BACKED_ARTBOARD_IDS) {
	coverage[artboardId] = {
		source: 'json-backed',
		focus: JSON_BACKED_FOCUS[artboardId],
		notes: ['JSON-backed assertions mirrored from spec.json.'],
	};
}

for (const artboardId of PROSE_BACKED_ARTBOARD_IDS) {
	coverage[artboardId] = {
		source: 'prose-backed',
		focus: PROSE_BACKED_FOCUS[artboardId],
		notes: ['Focused assertions derived from SPEC.md prose sections.'],
	};
}

export const ARTBOARD_ASSERTION_COVERAGE = coverage;
export const ALL_HANDOFF_ARTBOARD_IDS = Object.keys(
	ARTBOARD_ASSERTION_COVERAGE,
).sort();
