import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';

export const EditIdentitySection = ({
	isSubmittingForm,
	onChangeEmailClick,
}: {
	isSubmittingForm: boolean;
	onChangeEmailClick: () => void;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('common:identity')}</p>
			</div>
			<div className="grid gap-4 p-5 md:grid-cols-2">
				<Field.Text
					name="firstName"
					label={t('common:first-name')}
					placeholder={t('common:first-name')}
					isDisabled={isSubmittingForm}
				/>
				<Field.Text
					name="lastName"
					label={t('common:last-name')}
					placeholder={t('common:last-name')}
					isDisabled={isSubmittingForm}
				/>
				<div className="space-y-2">
					<Field.Email
						name="email"
						label={t('common:email-address')}
						helperText={t('email-managed-separately')}
						isDisabled
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onChangeEmailClick}
					>
						{t('change-email')}
					</Button>
				</div>
				<Field.Text
					name="avatarUrl"
					label={t('common:avatar-url')}
					placeholder="https://example.com/avatar.png"
					isDisabled={isSubmittingForm}
				/>
			</div>
		</section>
	);
};
