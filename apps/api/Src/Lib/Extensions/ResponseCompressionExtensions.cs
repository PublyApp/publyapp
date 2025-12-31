using System.IO.Compression;

using Microsoft.AspNetCore.ResponseCompression;

namespace MainApi.Src.Lib.Extensions;

public static class ResponseCompressionExtensions {
	/// <summary>
	/// Adds response compression services with Brotli and Gzip providers.
	/// The actual provider used depends on the client's Accept-Encoding header.
	/// Brotli offers better compression ratios; Gzip provides broader compatibility.
	/// </summary>
	public static IServiceCollection AddResponseCompressionServices(this IServiceCollection services) {
		services.AddResponseCompression(options => {
			options.EnableForHttps = true;
			options.Providers.Add<BrotliCompressionProvider>();
			options.Providers.Add<GzipCompressionProvider>();

			// Extend default MIME types with API-specific types
			options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat([
				"application/problem+json", // RFC 7807 problem details
			]).Distinct();
		});

		// Brotli: optimize for speed over compression ratio
		services.Configure<BrotliCompressionProviderOptions>(options => {
			options.Level = CompressionLevel.Fastest;
		});

		// Gzip: optimize for compression ratio (fallback for older clients)
		services.Configure<GzipCompressionProviderOptions>(options => {
			options.Level = CompressionLevel.SmallestSize;
		});

		return services;
	}
}
