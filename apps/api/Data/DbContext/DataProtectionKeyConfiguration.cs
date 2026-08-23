using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Data.DbContext;

/// <summary>
/// Configuration for the ASP.NET Core Data Protection key ring entity.
/// Maps the <see cref="DataProtectionKey"/> entity to the
/// <c>data_protection_keys</c> table.
/// </summary>
public sealed class DataProtectionKeyConfiguration
	: IEntityTypeConfiguration<DataProtectionKey> {
	public void Configure(EntityTypeBuilder<DataProtectionKey> builder) {
		builder.ToTable("data_protection_keys");
	}
}
