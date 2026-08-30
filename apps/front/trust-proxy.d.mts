export const resolveTrustProxyFromEnv: (options?: {
	lookup?: (
		hostname: string,
		options: { family: number },
	) => Promise<{ address: string }>;
}) => Promise<string[]>;
