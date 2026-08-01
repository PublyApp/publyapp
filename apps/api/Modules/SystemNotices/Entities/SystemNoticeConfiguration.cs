using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.SystemNotices.Entities;

public sealed class SystemNoticeConfiguration : IEntityTypeConfiguration<SystemNotice> {
	public void Configure(EntityTypeBuilder<SystemNotice> builder) {
		EntityConfigurationMarker.Mark(builder);
	}
}
