import type { ReactNode } from 'react';

type AuthFormHeaderProps = {
	title: string;
	secondary?: ReactNode;
};

/** Page title + secondary line (link or plain copy) shared by every auth form (A1–A6). */
export const AuthFormHeader = ({ title, secondary }: AuthFormHeaderProps) => {
	return (
		<div className="space-y-1">
			<h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-foreground md:text-2xl">
				{title}
			</h1>
			{secondary ? (
				<p className="text-sm text-muted-foreground">{secondary}</p>
			) : null}
		</div>
	);
};
