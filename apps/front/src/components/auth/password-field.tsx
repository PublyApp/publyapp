import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

type PasswordFieldProps = {
	id: string;
	label: string;
	register: UseFormRegisterReturn;
	placeholder?: string;
	invalid?: boolean;
	required?: boolean;
	labelAdornment?: ReactNode;
	autoComplete?: string;
};

/** Password input + 30×30 show/hide toggle, shared by every password field across A1–A5. */
export const PasswordField = ({
	id,
	label,
	register,
	placeholder,
	invalid,
	required,
	labelAdornment,
	autoComplete,
}: PasswordFieldProps) => {
	const { t } = useTranslation('common');
	const [isVisible, setIsVisible] = useState(false);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<label htmlFor={id} className="text-[13px] font-medium text-foreground">
					{label}
				</label>
				{labelAdornment}
			</div>
			<div className="relative">
				<Input
					{...register}
					id={id}
					type={isVisible ? 'text' : 'password'}
					required={required}
					placeholder={placeholder}
					aria-invalid={invalid || undefined}
					autoComplete={autoComplete}
					className={cn('h-11 pr-10 text-sm lg:h-10 lg:text-[13px]')}
				/>
				<button
					type="button"
					onClick={() => setIsVisible((previous) => !previous)}
					aria-label={isVisible ? t('hide-password') : t('show-password')}
					className="absolute inset-y-0 right-0 flex size-[30px] items-center justify-center rounded-[var(--publy-radius-chip)] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					{isVisible ? (
						<IconEyeOff aria-hidden="true" className="size-[17px]" />
					) : (
						<IconEye aria-hidden="true" className="size-[17px]" />
					)}
				</button>
			</div>
		</div>
	);
};
