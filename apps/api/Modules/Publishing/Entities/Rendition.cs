using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// The per-destination content view of ONE publication (#2172). It stores ONLY
/// overrides: a missing row, an empty text map, and a null media override all mean "inherit everything from the post". The effective content is
/// always computed by <c>RenditionResolver</c>; nothing else may overlay these
/// columns onto a post. The JSON columns are opaque strings here and typed by
/// <c>RenditionOverrides</c>, so the schema stays permissive while the contract is
/// bounded in code (same stance as <c>EmailPreparedSend.Envelope</c>).
/// </summary>
[Table("renditions")]
public class Rendition : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(Rendition), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	// Unique: at most one rendition per publication. Deleted with the publication.
	[Column("publication_id")]
	public required Guid PublicationId { get; set; }

	// {"<segment position, 0 = root>": "<text>"} - overridden segment texts only.
	[Column("text_overrides", TypeName = "jsonb")]
	public string TextOverrides { get; set; } = "{}";

	// {"assetIds": [...]|null, "altTexts": {"<assetId>": "<alt>"}}; null = no media override.
	[Column("media_override", TypeName = "jsonb")]
	public string? MediaOverride { get; set; }
}
