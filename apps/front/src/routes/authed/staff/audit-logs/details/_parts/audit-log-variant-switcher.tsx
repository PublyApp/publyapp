import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';

import {
	AUDIT_LOG_DETAIL_VARIANTS,
	type AuditLogDetailVariant,
	useAuditLogDetailVariant,
} from './use-audit-log-detail-variant';

export const AuditLogVariantSwitcher = () => {
	const { t } = useTranslate();
	const [variant, setVariant] = useAuditLogDetailVariant();

	const handleChange = (
		_event: React.MouseEvent<HTMLElement>,
		next: AuditLogDetailVariant | null,
	) => {
		if (!next) {
			return;
		}
		setVariant(next);
	};

	return (
		<ToggleButtonGroup
			size="small"
			exclusive
			value={variant}
			onChange={handleChange}
			aria-label={t('layout')}
		>
			{map(AUDIT_LOG_DETAIL_VARIANTS, (v) => (
				<ToggleButton key={v} value={v} sx={{ textTransform: 'none', px: 1.5 }}>
					{t(v as never)}
				</ToggleButton>
			))}
		</ToggleButtonGroup>
	);
};
