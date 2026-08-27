using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Lib;

/// <summary>
/// #220 proof that <see cref="CursorSortFieldHandlerFactory"/> produces expression trees that
/// reach a real Postgres database. The in-memory delegate tests pin the *shape*; this spec pins
/// that EF can translate the factory's generated keyset filter (and the cursor-value projection)
/// for every key type the extraction supports. A regression that emits an untranslatable tree
/// (e.g. the enum-comparison or string-equality defects the first draft had) fails here with an
/// EF translation exception, not a silent in-memory-only pass.
///
/// <see cref="Tenant"/> is used as the probe entity because it carries three of the four cursor
/// key types in one table: a string key (<see cref="Tenant.Name"/>), an enum key
/// (<see cref="Tenant.Status"/>), and the always-present DateTime/ Guid audit- and id keys.
/// </summary>
public sealed class CursorSortFieldHandlerFactorySqlSpec : IClassFixture<ApiFixture> {
	private const string CodePrefix = "zzz_cursor_factory_";

	private readonly ApiFixture _fixture;

	public CursorSortFieldHandlerFactorySqlSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldTranslateAndReadAStringKeyCursorValue() {
		await using var db = await CreateDbContextAsync();
		var tenant = await SeedAsync(db, "alpha", TenantStatus.Active, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

		var handler = CursorSortFieldHandlerFactory.Create<Tenant, string, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.Name,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);

		var raw = await handler.GetCursorValue(tenant.GetRequiredId());
		raw.Should().NotBeNull();
		var (key, id) = ((string, Guid?))raw!;

		key.Should().Be("alpha");
		id.Should().Be(tenant.GetRequiredId());
	}

	[Fact]
	public async Task ItShouldTranslateAndReadAnEnumKeyCursorValue() {
		await using var db = await CreateDbContextAsync();
		var tenant = await SeedAsync(db, "enum-key", TenantStatus.Suspended, new DateTime(2026, 2, 2, 0, 0, 0, DateTimeKind.Utc));

		var handler = CursorSortFieldHandlerFactory.Create<Tenant, TenantStatus, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.Status,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);

		var raw = await handler.GetCursorValue(tenant.GetRequiredId());
		raw.Should().NotBeNull();
		var (key, id) = ((TenantStatus, Guid?))raw!;

		key.Should().Be(TenantStatus.Suspended);
		id.Should().Be(tenant.GetRequiredId());
	}

	[Fact]
	public async Task ItShouldTranslateAndReadADateTimeKeyCursorValue() {
		await using var db = await CreateDbContextAsync();
		var tenant = await SeedAsync(db, "dt-key", TenantStatus.Active, new DateTime(2026, 3, 3, 0, 0, 0, DateTimeKind.Utc));

		// BaseAttributes.CreatedAt carries a default and the audit interceptor stamps insert time,
		// so the persisted value is not necessarily the seed. Read the real stored timestamp back
		// and assert the factory projects exactly that row's key.
		var storedAt = await db.Tenant
			.Where(t => t.Id == tenant.Id)
			.Select(t => t.CreatedAt)
			.SingleAsync(CancellationToken.None);

		var handler = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.CreatedAt,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);

		var raw = await handler.GetCursorValue(tenant.GetRequiredId());
		raw.Should().NotBeNull();
		var (key, id) = ((DateTime, Guid?))raw!;

		key.Should().Be(storedAt);
		id.Should().Be(tenant.GetRequiredId());
	}

	[Fact]
	public async Task ItShouldTranslateTheKeysetFilterToSqlForEveryKeyType() {
		await using var db = await CreateDbContextAsync();
		var tenant = await SeedAsync(db, "filter", TenantStatus.Active, new DateTime(2026, 4, 4, 0, 0, 0, DateTimeKind.Utc));

		var stringHandler = CursorSortFieldHandlerFactory.Create<Tenant, string, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.Name,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);
		var enumHandler = CursorSortFieldHandlerFactory.Create<Tenant, TenantStatus, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.Status,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);
		var dateHandler = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.CreatedAt,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);

		// Materialising each filtered query forces EF to compile the factory's generated
		// expression tree to SQL; an untranslatable node throws here rather than in production.
		// The keyset excludes the cursor row itself (a row is never strictly beyond itself), so a
		// successful materialisation with the cursor row absent proves the keyset was applied.
		var stringCursor = await stringHandler.GetCursorValue(tenant.GetRequiredId());
		var enumCursor = await enumHandler.GetCursorValue(tenant.GetRequiredId());
		var dateCursor = await dateHandler.GetCursorValue(tenant.GetRequiredId());

		var stringRows = await stringHandler.ApplyFilter(db.Tenant.AsQueryable(), stringCursor, true).ToListAsync(CancellationToken.None);
		var enumRows = await enumHandler.ApplyFilter(db.Tenant.AsQueryable(), enumCursor, false).ToListAsync(CancellationToken.None);
		var dateRows = await dateHandler.ApplyFilter(db.Tenant.AsQueryable(), dateCursor, true).ToListAsync(CancellationToken.None);

		stringRows.Should().NotContain(r => r.Id == tenant.Id);
		enumRows.Should().NotContain(r => r.Id == tenant.Id);
		dateRows.Should().NotContain(r => r.Id == tenant.Id);
	}

	[Fact]
	public async Task ItShouldReturnNullForAGoneCursorRow() {
		await using var db = await CreateDbContextAsync();
		await SeedAsync(db, "gone", TenantStatus.Active, new DateTime(2026, 5, 5, 0, 0, 0, DateTimeKind.Utc));

		var handler = CursorSortFieldHandlerFactory.Create<Tenant, string, Guid?>(
			cursorLookupQuery: () => db.Tenant.AsQueryable(),
			keySelector: t => t.Name,
			idSelector: t => t.Id,
			cancellationToken: CancellationToken.None
		);

		var value = await handler.GetCursorValue(Guid.NewGuid());

		value.Should().BeNull();
	}

	private static async Task<Tenant> SeedAsync(AppDbContext db, string name, TenantStatus status, DateTime createdAt) {
		var tenant = new Tenant {
			Code = CodePrefix + Guid.NewGuid().ToString("N"),
			Name = name,
			Status = status,
			MaxUsers = 1,
			CreatedAt = createdAt
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync(CancellationToken.None);
		if (tenant.Id is null) {
			throw new InvalidOperationException("Seeded tenant did not receive an Id.");
		}

		return tenant;
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		var connectionString = await GetConnectionStringAsync();
		var db = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
		await RegisterCleanupAsync(db);
		return db;
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return connectionString;
	}

	private static async Task RegisterCleanupAsync(AppDbContext db) {
		// Best-effort cleanup of this class's probe rows; ignore failure in the dispose path.
		await db.Database.ExecuteSqlAsync(
			$@"DELETE FROM tenants WHERE code LIKE {CodePrefix + "%"}"
		);
	}
}
