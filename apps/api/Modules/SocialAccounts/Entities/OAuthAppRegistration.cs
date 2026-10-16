using System.ComponentModel.DataAnnotations.Schema;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// The OAuth app PublyApp registered on one Mastodon or Pixelfed instance
/// (<c>POST /api/v1/apps</c>, #2174). One row per instance host, shared by every
/// tenant (the app only identifies PublyApp to that instance; each user still
/// authorizes with their own account). The client secret is encrypted with the
/// provider-specific credential protector and never leaves the server.
/// </summary>
[Table("oauth_app_registrations")]
public class OAuthAppRegistration : BaseAttributes, INoTenantEntity {
	[Column("host")]
	public required string Host { get; set; }

	// One app per (host, network): Mastodon and Pixelfed register different scopes,
	// so they must never overwrite each other's client (#2175).
	[Column("provider")]
	public SocialProvider Provider { get; set; } = SocialProvider.Mastodon;

	[Column("client_id")]
	public required string ClientId { get; set; }

	[Column("protected_client_secret")]
	public required string ProtectedClientSecret { get; set; }

	[Column("scopes")]
	public required string Scopes { get; set; }

	// The redirect the instance has on record: a changed FRONT_URL registers anew.
	[Column("redirect_uri")]
	public required string RedirectUri { get; set; }
}

public sealed class OAuthAppRegistrationConfiguration : IEntityTypeConfiguration<OAuthAppRegistration> {
	public void Configure(EntityTypeBuilder<OAuthAppRegistration> builder) {
		builder
			.Property(registration => registration.Provider)
			.HasDefaultValue(SocialProvider.Mastodon)
			.HasSentinel(SocialProvider.Mastodon);

		builder
			.HasIndex(registration => new { registration.Host, registration.Provider })
			.IsUnique()
			.HasFilter("is_deleted = false")
			.HasDatabaseName("ux_oauth_app_registrations_live_host");
	}
}
