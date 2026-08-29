import { lookup as defaultLookup } from 'node:dns/promises';

/**
 * Resolves the trusted proxy list for srvx. Two modes:
 *
 * 1. Explicit TRUSTED_PROXY_CIDRS (production, local smoke): parse the CSV,
 *    strip CIDR suffixes (srvx uses exact string matching, not subnet
 *    matching), and trust only those peers.
 *
 * 2. E2E_DISCOVER_TRUSTED_PROXY (e2e compose stack): Docker allocates a free
 *    subnet for the stack's network, so the subnet cannot be known ahead of
 *    time. Resolve Traefik's IP at startup via Docker's embedded DNS
 *    (`traefik` hostname → container IP on the shared network) and trust
 *    only that peer. This preserves the exact security property — only
 *    Traefik's x-forwarded-* headers are honored — without depending on a
 *    frozen subnet that may collide with an existing network on the host.
 *
 * In both cases, a direct request from any other IP falls back to the real
 * socket origin.
 *
 * The `lookup` parameter is injectable for tests — pass a stub to exercise
 * the DNS-discovery path without a real resolver. The default is Node's
 * `dns/promises` `lookup`.
 */
export const resolveTrustProxyFromEnv = async ({
	lookup = defaultLookup,
} = {}) => {
	// E2E_DISCOVER_TRUSTED_PROXY takes precedence: the Dockerfile sets a
	// default TRUSTED_PROXY_CIDRS (loopback-only), but the e2e compose stack
	// explicitly opts into runtime discovery of Traefik's IP. Without this
	// ordering, the Dockerfile default would always win and discovery would
	// never trigger.
	if (process.env.E2E_DISCOVER_TRUSTED_PROXY === 'true') {
		try {
			const address = await lookup('traefik', { family: 4 });
			console.log(
				`[trust-proxy] discovered Traefik at ${address.address} via Docker DNS — trusting only this peer for x-forwarded-* headers.`,
			);
			return [address.address];
		} catch (error) {
			console.error(
				`[trust-proxy] E2E_DISCOVER_TRUSTED_PROXY is set but failed to resolve Traefik's IP (${String(error)}). ` +
					'Falling back to loopback-only trust — the e2e stack will not function correctly.',
			);
			return ['127.0.0.1', '::1'];
		}
	}

	const raw = process.env.TRUSTED_PROXY_CIDRS?.trim();
	if (raw) {
		const entries = raw
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
		// Validate every CIDR entry at startup. srvx uses exact string
		// matching (Array.includes), not subnet matching, so a "trust" list
		// containing `0.0.0.0` or `::` matches no real peer — every client
		// appears as the proxy's own address, silently breaking per-IP rate
		// limiting and audit logging. A value the parser cannot honor must
		// never be silently coerced to a "safe" default — fail loud, name the
		// offender, and say what to put instead.
		//
		// For each entry that carries a slash, the prefix-length suffix must
		// be a plain decimal string (no sign, no space, no decimal point,
		// no trailing junk) and fall within the valid range for the address
		// family (0-32 for IPv4, 0-128 for IPv6). A prefix length of 0 is the
		// universal wildcard and is refused with the dedicated message below;
		// any absent, empty, or non-conforming suffix fails startup with a
		// distinct message that names the offending entry.
		//
		// A bare address without a slash (e.g. `10.0.0.9`) is a valid
		// srvx exact-match entry and is accepted as-is. It is not a wildcard:
		// srvx matches it against the literal peer address, and a bare
		// `0.0.0.0` simply matches no real peer (a visibly broken
		// configuration, not a silent one). The silent danger is the `/0`
		// form, which operators mistake for "trust everything".
		for (const entry of entries) {
			const slashIdx = entry.lastIndexOf('/');
			if (slashIdx === -1) {
				continue;
			}
			const addrPart = entry.slice(0, slashIdx);
			const suffix = entry.slice(slashIdx + 1);
			if (!/^\d+$/.test(suffix)) {
				throw new Error(
					`Refusing to start: TRUSTED_PROXY_CIDRS contains '${entry}' with an unreadable prefix length ` +
						`(expected decimal digits, got '${suffix || '<empty>'}'). ` +
						`Give the exact proxy address followed by /32 (IPv4) or /128 (IPv6), e.g. '10.0.0.9/32'.`,
				);
			}
			const prefixLength = Number.parseInt(suffix, 10);
			const isIpv6 = addrPart.includes(':');
			const maxPrefix = isIpv6 ? 128 : 32;
			if (prefixLength > maxPrefix) {
				throw new Error(
					`Refusing to start: TRUSTED_PROXY_CIDRS contains '${entry}' with prefix length ${prefixLength}, ` +
						`above the ${isIpv6 ? 'IPv6' : 'IPv4'} maximum of ${maxPrefix}. ` +
						`Give the exact proxy address followed by /32 (IPv4) or /128 (IPv6), e.g. '10.0.0.9/32'.`,
				);
			}
			if (prefixLength === 0) {
				throw new Error(
					`Refusing to start: TRUSTED_PROXY_CIDRS contains universal CIDR '${entry}', ` +
						`which would silently break per-IP rate limiting and audit logging. ` +
						`Replace it with the proxy's exact address as /32 (IPv4) or /128 (IPv6), ` +
						`e.g. '10.0.0.9/32'.`,
				);
			}
		}
		return entries.map((entry) => entry.split('/')[0]);
	}

	console.warn(
		'[trust-proxy] TRUSTED_PROXY_CIDRS is unset or empty — falling back to loopback-only trust (127.0.0.1, ::1). ' +
			'In production with a reverse proxy (Traefik), set TRUSTED_PROXY_CIDRS to the proxy peer address as /32.',
	);
	return ['127.0.0.1', '::1'];
};
