using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// Migration spec for AddSocialAccounts (#640, epic C #630). Asserts the applied schema
// shape on a real Testcontainers database (same fixture pattern as the neighbouring
// migration specs): table existence, primary key, unique + list indexes, and the
// check constraints that pin persisted enum domains.
public sealed class AddSocialAccountsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddSocialAccountsSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldCreateTheSocialAccountsTableWithKeysIndexesAndConstraints() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tableExists = await dbContext.Database.SqlQuery<bool>(
			$"SELECT to_regclass('public.social_accounts') IS NOT NULL AS \"Value\""
		).SingleAsync();
		tableExists.Should().BeTrue();

		var columns = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT column_name || ':' || data_type || ':' || is_nullable AS "Value"
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'social_accounts'
			ORDER BY ordinal_position
			"""
		).ToListAsync();
		columns.Should().Contain("id:uuid:NO");
		columns.Should().Contain("tenant_id:uuid:NO");
		columns.Should().Contain("provider:integer:NO");
		columns.Should().Contain("external_account_id:text:NO");
		columns.Should().Contain("display_handle:text:YES");
		columns.Should().Contain("protected_credentials:text:NO");
		columns.Should().Contain("status:integer:NO");

		var primaryKeyColumns = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT attribute.attname AS "Value"
			FROM pg_constraint constraint_row
			JOIN unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, position)
				ON true
			JOIN pg_attribute attribute
				ON attribute.attrelid = constraint_row.conrelid
				AND attribute.attnum = key_column.attnum
			WHERE constraint_row.conrelid = 'social_accounts'::regclass
				AND constraint_row.contype = 'p'
			ORDER BY key_column.position
			"""
		).ToListAsync();
		primaryKeyColumns.Should().Equal("id");

		var uniqueIndex = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ux_social_accounts_tenant_provider_external_account'
			"""
		).SingleAsync();
		uniqueIndex.Should().Contain("(tenant_id, provider, external_account_id)");
		uniqueIndex.Should().Contain("WHERE (is_deleted = false)");

		var statusIndex = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_social_accounts_tenant_provider_status'
			"""
		).SingleAsync();
		statusIndex.Should().Contain("(tenant_id, provider, status)");

		var checkConstraints = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT conname AS "Value"
			FROM pg_constraint
			WHERE conrelid = 'social_accounts'::regclass
				AND contype = 'c'
			ORDER BY conname
			"""
		).ToListAsync();
		checkConstraints.Should().Contain("CK_SocialAccount_Status");
		checkConstraints.Should().Contain("CK_SocialAccount_Provider");

		var foreignKeyTargets = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT confrelid::regclass::text AS "Value"
			FROM pg_constraint
			WHERE conrelid = 'social_accounts'::regclass
				AND contype = 'f'
			"""
		).ToListAsync();
		foreignKeyTargets.Should().Equal("tenants");
	}
}
