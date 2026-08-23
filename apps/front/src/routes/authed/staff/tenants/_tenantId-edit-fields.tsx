/** Read-only twin of the create form's SlugField: same bordered container and
 * `publyapp.com/` prefix, but the slug is server-assigned and immutable. */
export const ReadOnlySlugField = ({
	code,
	label,
	hint,
}: {
	code: string;
	label: string;
	hint: string;
}) => (
	<div className="space-y-1.5">
		<span className="flex items-center gap-2 text-[13px] leading-none font-medium">
			{label}
		</span>
		<div className="flex h-9 items-center gap-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 opacity-70 shadow-[var(--publy-shadow-input)]">
			<span className="shrink-0 font-mono text-[13px] text-muted-foreground">
				publyapp.com/
			</span>
			<span
				className="min-w-0 flex-1 truncate font-mono text-[13px]"
				data-testid="edit-tenant-slug"
			>
				{code}
			</span>
		</div>
		<p data-slot="field-helper" className="publy-field-helper">
			{hint}
		</p>
	</div>
);
