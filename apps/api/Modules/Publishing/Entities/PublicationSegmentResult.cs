using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// The persisted outcome of ONE successfully published segment of a thread
/// publication (#2171): written right after each segment lands so a crash,
/// timeout or later failure never loses the uri/cid the next reply needs. A
/// retry resumes after the last stored segment and never republishes these.
/// Only successes are stored; the failing segment is the first position without
/// a row. <see cref="SegmentPosition"/> is 0-based (0 = the root segment).
/// </summary>
[Table("publication_segment_results")]
public class PublicationSegmentResult : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get {
			return RequiredNavigation.Get(
				this._Tenant, nameof(PublicationSegmentResult), nameof(this.Tenant)
			);
		}
		set { this._Tenant = value; }
	}

	[Column("publication_id")]
	public required Guid PublicationId { get; set; }

	[Column("segment_position")]
	public required int SegmentPosition { get; set; }

	/// <summary>The at:// uri of the created record.</summary>
	[Column("external_record_id")]
	public required string ExternalRecordId { get; set; }

	/// <summary>The record's content id: half of the strong reference replies point at.</summary>
	[Column("external_cid")]
	public required string ExternalCid { get; set; }

	[Column("external_url")]
	public required string ExternalUrl { get; set; }
}
