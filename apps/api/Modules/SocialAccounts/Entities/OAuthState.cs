using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// One pending OAuth authorization (#2174): the single-use <c>state</c> bound to
/// the tenant, the user who started it and the instance host. Only a SHA-256 of
/// the state is stored, so a database read cannot replay a pending flow.
/// </summary>
[Table("oauth_states")]
public class OAuthState : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(OAuthState), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	[Column("user_id")]
	public required Guid UserId { get; set; }

	[Column("state_hash")]
	public required string StateHash { get; set; }

	// Which fediverse network this flow connects (Mastodon or Pixelfed, #2175).
	[Column("provider")]
	public SocialProvider Provider { get; set; } = SocialProvider.Mastodon;

	[Column("instance_host")]
	public required string InstanceHost { get; set; }

	// The PKCE code verifier (RFC 7636), encrypted: only the instance holds the matching
	// challenge, so this is the one secret that lets a stolen code be redeemed. Null when
	// the instance does not advertise PKCE (that flow runs without it, #2186).
	[Column("protected_code_verifier")]
	public string? ProtectedCodeVerifier { get; set; }

	// Set when the flow was started to reconnect this account: the callback must come back
	// as the same Mastodon identity, else it is refused instead of linking a different one.
	[Column("reconnect_social_account_id")]
	public Guid? ReconnectSocialAccountId { get; set; }

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }

	[Column("consumed_at")]
	public DateTime? ConsumedAt { get; set; }
}

public sealed class OAuthStateConfiguration : IEntityTypeConfiguration<OAuthState> {
	public void Configure(EntityTypeBuilder<OAuthState> builder) {
		builder
			.HasIndex(state => state.StateHash)
			.IsUnique()
			.HasDatabaseName("ux_oauth_states_state_hash");

		builder
			.Property(state => state.Provider)
			.HasDefaultValue(SocialProvider.Mastodon)
			.HasSentinel(SocialProvider.Mastodon);

		builder
			.HasOne(state => state.Tenant)
			.WithMany()
			.HasForeignKey(state => state.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
