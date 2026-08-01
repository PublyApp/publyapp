using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Invitations.Entities;

public sealed class InvitationEmailOutboxConfiguration : IEntityTypeConfiguration<InvitationEmailOutbox> {
	public void Configure(EntityTypeBuilder<InvitationEmailOutbox> builder) {
		EntityConfigurationMarker.Mark(builder);
	}
}
