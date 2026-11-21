using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// A <see cref="AppDbContext"/> living in its own DI scope; dispose the handle to release both.
/// </summary>
internal sealed class DbHandle : IAsyncDisposable {
	private readonly AsyncServiceScope _Scope;

	public DbHandle(AsyncServiceScope scope) {
		this._Scope = scope;
		this.Context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
	}

	public AppDbContext Context { get; }

	public ValueTask DisposeAsync() {
		return this._Scope.DisposeAsync();
	}
}

internal static class ApiFixtureExtensions {
	/// <summary>
	/// Opens a fresh scope on the fixture's host: <c>await using var db = fixture.OpenDb();</c>, then
	/// <c>db.Context</c>.
	/// </summary>
	public static DbHandle OpenDb(this ApiFixture fixture) {
		return new DbHandle(fixture.Factory.Services.CreateAsyncScope());
	}
}
