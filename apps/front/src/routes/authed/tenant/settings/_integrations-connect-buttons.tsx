import { IconPlugConnected } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

export type ConnectDrawerKey =
	| 'mastodonOpen'
	| 'pixelfedOpen'
	| 'discordOpen'
	| 'connectOpen';

/** The connect buttons of the providers the operator has not switched off: the
 * wire name the switch uses, the drawer each opens and its label. Bluesky is
 * the primary action. */
export const ConnectButtons = ({
	disabledProviders,
	disabled,
	onOpen,
}: {
	disabledProviders: ReadonlySet<string>;
	disabled: boolean;
	onOpen: (key: ConnectDrawerKey) => void;
}) => {
	const { t } = useTranslation('settings');
	const buttons = [
		{
			provider: 'mastodon',
			drawer: 'mastodonOpen',
			label: t('connect-mastodon'),
			primary: false,
		},
		{
			provider: 'pixelfed',
			drawer: 'pixelfedOpen',
			label: t('connect-pixelfed'),
			primary: false,
		},
		{
			provider: 'discord_webhook',
			drawer: 'discordOpen',
			label: t('connect-discord'),
			primary: false,
		},
		{
			provider: 'bluesky',
			drawer: 'connectOpen',
			label: t('connect-bluesky'),
			primary: true,
		},
	] as const;

	return (
		<div className="flex flex-wrap justify-end gap-2">
			{buttons
				.filter((button) => !disabledProviders.has(button.provider))
				.map((button) => (
					<Button
						key={button.provider}
						type="button"
						variant={button.primary ? 'default' : 'outline'}
						disabled={disabled}
						onClick={() => onOpen(button.drawer)}
					>
						<IconPlugConnected aria-hidden="true" className="size-4" />
						{button.label}
					</Button>
				))}
		</div>
	);
};
