namespace MainApi.Src.Lib.Testing;

/// <summary>
/// Extension methods for building test HTTP requests
/// with auth headers.
/// Uses TryAddWithoutValidation to avoid exceptions
/// if called multiple times on the same request.
/// </summary>
internal static class HttpRequestMessageExtensions {
	public static HttpRequestMessage WithSessionToken(
		this HttpRequestMessage request,
		string sessionToken
	) {
		request.Headers.Remove(
			TestConstants.SessionTokenHeader
		);
		request.Headers.TryAddWithoutValidation(
			TestConstants.SessionTokenHeader,
			sessionToken
		);
		return request;
	}

	public static HttpRequestMessage WithTenantId(
		this HttpRequestMessage request,
		Guid tenantId
	) {
		request.Headers.Remove(
			TestConstants.TenantIdHeader
		);
		request.Headers.TryAddWithoutValidation(
			TestConstants.TenantIdHeader,
			tenantId.ToString()
		);
		return request;
	}
}
