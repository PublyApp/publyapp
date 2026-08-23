import { useTranslation } from 'react-i18next';
import { Input } from '~/components/ui/input';
import { PersonAvatar } from '~/components/ui/person-avatar';

/**
 * Identity header shown inside the suspend and delete confirmation dialogs
 * (extracted from `$userId.tsx` to keep that route file lean — see the
 * `no-multi-component-file` React Doctor rule).
 */
export const ConfirmHeaderInfo = ({
	name,
	email,
	avatarUrl,
}: {
	name: string;
	email: string;
	avatarUrl: string | null;
}) => (
	<div className="rounded-[var(--publy-radius-card)] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-3">
		<div className="flex items-center gap-2.5">
			<PersonAvatar name={name} avatarUrl={avatarUrl} size="sm" />
			<div className="min-w-0">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="truncate text-xs text-muted-foreground">{email}</p>
			</div>
		</div>
	</div>
);

/** Type-to-confirm field for the delete dialog, same extraction rationale. */
export const DeleteConfirmField = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<div className="space-y-1.5">
			<p className="text-xs text-muted-foreground">
				{t('delete-confirm-instructions')}
			</p>
			<Input
				aria-label={t('confirm-delete-field-label')}
				value={value}
				placeholder={t('type-delete-to-confirm-placeholder')}
				onChange={(event) => onChange(event.target.value)}
				className="h-9"
			/>
		</div>
	);
};
