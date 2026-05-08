type JsonLdProps = {
	schema: Record<string, unknown>;
};

// Renders a JSON-LD <script> tag. Uses dangerouslySetInnerHTML because
// React doesn't allow children inside <script>. Safe as long as the
// `schema` object is built from typed application data — sanitize first
// if any user-controlled string ever lands inside.
export const JsonLd = ({ schema }: JsonLdProps) => {
	return (
		<script
			type="application/ld+json"
			// eslint-disable-next-line react/no-danger
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
};
