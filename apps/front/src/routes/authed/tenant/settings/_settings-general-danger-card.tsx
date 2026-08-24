import { IconAlertTriangle } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { ReadOnlyBadge } from '../_workspace-page-parts';

type Translate = (key: string) => string;

type SettingsGeneralDangerCardProps = {
	t: Translate;
};

export const SettingsGeneralDangerCard = ({
	t,
}: SettingsGeneralDangerCardProps) => (
	<Card>
		<CardHeader>
			<CardTitle>{t('common:danger-zone')}</CardTitle>
			<ReadOnlyBadge />
		</CardHeader>
		<CardContent>
			<StateSurface
				icon={IconAlertTriangle}
				title={t('settings:danger-zone-coming-later-title')}
				description={t('settings:danger-zone-coming-later-description')}
				testId="tenant-settings-general-danger-empty"
			/>
		</CardContent>
	</Card>
);
