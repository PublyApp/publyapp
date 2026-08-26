export const DetailMetaItem = ({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) => (
	<div className="space-y-1.5">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="publy-type-metadata-value">{value}</div>
	</div>
);
