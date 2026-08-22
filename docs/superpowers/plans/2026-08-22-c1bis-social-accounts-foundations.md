# Social Accounts Foundations (C1-bis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the closed PR #1159 into the Epic C-approved foundations slice: tenant-scoped `SocialAccount` + `SocialAccountProject` entities with Postgres-persisted Data Protection keys encrypted by `SOCIAL_ACCOUNTS_MASTER_KEY`, a startup witness that refuses to boot on a wrong key, a `LastError` sanitiser, and a `VisibleIn` visibility function — no endpoints, handlers, permissions seeding, or screens.

**Architecture:** Vertical slice `apps/api/Modules/SocialAccounts`. Entities live under `Entities/`, EF configs are co-located (`*Configuration.cs`, discovered by `AppDbContext`), and the credential protector is a `[Service]` Singleton depending only on `IDataProtectionProvider`. Data Protection keys persist to Postgres via `PersistKeysToDbContext<AppDbContext>` and are encrypted at rest with a custom `IXmlEncryptor`/`IXmlDecryptor` keyed from `SOCIAL_ACCOUNTS_MASTER_KEY`. A startup witness round-trips a sentinel after the migration gate and fails fast on any error.

**Tech Stack:** .NET 10 / EF Core 10 (`Microsoft.EntityFrameworkCore` 10.0.0, `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.0), `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore` 10.0.1, xUnit, FluentAssertions, Testcontainers (via `ApiFixture`), `just` recipes.

## Global Constraints

- Entity base: `SocialAccount` extends `BaseAttributes` and implements `ITenantEntity` (audit columns + soft delete + tenant scoping come from these). `SocialAccountProject` is a **pure junction** (no `BaseAttributes`, no `id`, no soft delete) implementing `INoTenantEntity`, with a composite PK of its two foreign keys — mirror `UserAccountProfile`.
- Enums stored as int + PostgreSQL check constraint (like `PostStatus`). Provider enum starts at `Bluesky = 0`; `CredentialType` is `AppPassword = 0, OAuth = 1`; `Status` is `Active = 10, NeedsReconnect = 20, Revoked = 30`. Unique index on `(tenant_id, provider, external_account_id)`.
- JSON wire fields are camelCase; URL/query params snake_case (`sort_id`, etc.); C# symbols PascalCase; DB columns snake_case. Never collapse wire values to `updatedat`.
- The secret (`ProtectedCredentials` cleartext) is **never** returned by any API, never logged, never in an error message, never in an audit row. `LastError` is sanitised to ≤ 2 KB and must never contain the secret.
- `AppEnvironment.Initialize()` must be called before anything else; per the AGENTS.md note, repo builds must use the pinned `just` recipes (they export `APP_ROLE=api`). `SOCIAL_ACCOUNTS_MASTER_KEY` is required in every role (incl. Testing) — base64, exactly 32 bytes (AES-256-GCM key).
- No hosted service is added (Data Protection adds none), so `AppRoleCompositionSpec` is unaffected. State this in the PR body.
- Analyzers `PUBLY0001`/`0002`/`0003`/`0004`/`0005`/`0006`/`0007` are errors: no `!`, no `?? throw`, no `ToLower()` dispatch, wire DTOs lack `Dto` suffix, cache repeated `JsonElement` getter results, services must not depend on other services, tenant-scoped service methods must use `tenantId`.
- Migrations are applied only by the one-shot `migrate` service; locally run `just db-migrate`. Migration recipe: `just db-add <Name>` then `just db-migrate`.
- `just build-api && just generate-client` is run after any contract change (none here — no endpoints — but the `DataProtectionKeys` table is new, so build must still pass).

---

## File Structure

**Create**
- `apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs` — tenant-scoped account entity (TenantId, Provider, ExternalAccountId, DisplayHandle, CredentialType, ProtectedCredentials, Status, LastSuccessAt, LastError, audit cols).
- `apps/api/Modules/SocialAccounts/Entities/SocialAccountProject.cs` — pure junction (SocialAccountId, ProjectId).
- `apps/api/Modules/SocialAccounts/Entities/SocialProvider.cs` — enum (`Bluesky = 0`).
- `apps/api/Modules/SocialAccounts/Entities/SocialCredentialType.cs` — enum (`AppPassword = 0, OAuth = 1`).
- `apps/api/Modules/SocialAccounts/Entities/SocialAccountStatus.cs` — enum (`Active = 10, NeedsReconnect = 20, Revoked = 30`).
- `apps/api/Modules/SocialAccounts/Entities/SocialAccountConfiguration.cs` — table `social_accounts`, check constraint on `status`, unique `(tenant_id, provider, external_account_id)`, FK to `tenants`.
- `apps/api/Modules/SocialAccounts/Entities/SocialAccountProjectConfiguration.cs` — composite PK, FKs to `social_accounts` + `projects`, cascade delete.
- `apps/api/Modules/SocialAccounts/Services/ICredentialProtector.cs` — protect/unprotect-by-provider interface; never returns the secret outside the publishing path.
- `apps/api/Modules/SocialAccounts/Services/CredentialProtector.cs` — `[Service]` Singleton; one `IDataProtectionProvider` purpose per provider.
- `apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlEncryptor.cs` — `IXmlEncryptor` using `SOCIAL_ACCOUNTS_MASTER_KEY`.
- `apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlDecryptor.cs` — `IXmlDecryptor`.
- `apps/api/Modules/SocialAccounts/Infrastructure/SocialAccountsMasterKeyWitness.cs` — static `EnsureMasterKeyUsable(IServiceProvider)`.
- `apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs` — `Sanitize(string?)` ≤ 2 KB, secret-never-present.
- `apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs` — `VisibleIn(SocialAccount, Guid)` pure function.
- `apps/api/Modules/SocialAccounts/Seeder.cs` — **absent**: C1-bis seeds NO permissions (deferred to C2). Do not add a seeder here.
- Tests:
  - `apps/api/Modules/SocialAccounts/Tests/SocialAccountArchitecture.Spec.cs` — guard (every service method with `Guid tenantId` uses it; entity check constraints/indexes; junction is pure).
  - `apps/api/Modules/SocialAccounts/Tests/CredentialProtectorSpec.cs` — round-trip, wrong-key refusal at boot, witness decrypt.
  - `apps/api/Modules/SocialAccounts/Tests/LastErrorSanitiserSpec.cs` — length cap + secret scrub.
  - `apps/api/Modules/SocialAccounts/Tests/VisibleInSpec.cs` — unattached visible everywhere; attached invisible in Y.
  - `apps/api/Modules/SocialAccounts/Tests/SocialAccountEntitySpec.cs` — EF model: table, composite PK, check constraint, unique index, FKs.

**Modify**
- `Directory.Packages.props` — add `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore` 10.0.1.
- `apps/api/PublyApp.Api.csproj` — add the package reference.
- `apps/api/Data/DbContext/AppDbContext.cs` — add `DbSet<DataProtectionKey> DataProtectionKeys` (import `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`).
- `apps/api/Lib/AppEnvironment.cs` — add `SOCIAL_ACCOUNTS_MASTER_KEY` (required, base64, exactly 32 bytes), exposed as `SocialAccountsMasterKey` (byte[]).
- `apps/api/Lib/ServiceRegistration.cs` — `AddDataProtection().PersistKeysToDbContext<AppDbContext>()`; register `IXmlEncryptor`/`IXmlDecryptor`/`ICredentialProtector` singletons (add to `AddInfraServices` or a new `AddSocialAccountServices` called from `AddAppServices`).
- `apps/api/Program.cs` — call `SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(app.Services)` after `builder.Build()` / before `app.Run()` for the web host (and in the worker host after build).
- `.env.example` — remove any `FILE_STORAGE_ROOT/.data-protection/keys` artifact; add `SOCIAL_ACCOUNTS_MASTER_KEY=`.
- `dokploy.yml` — remove the data-protection file volume; inject `SOCIAL_ACCOUNTS_MASTER_KEY` into `publyapp-api`, `publyapp-worker`, `publyapp-migrate`.
- `docs/deployment/production-deployment-design.md` (or a new `docs/deployment/social-accounts-master-key.md` linked from it) — loss-of-master-key procedure.

**Generated**
- One migration after Task 4 (the model already carries `DataProtectionKeys` from Task 2 plus the two entities here): `just db-add SocialAccountsModule` then `just db-migrate`. Do **not** run a separate `db-add` for `DataProtectionKeys` — EF diffs the whole model against the last snapshot, so a single `db-add` captures all three tables at once; a second `db-add` would be empty.

---

## Task 1: Add the master-key environment variable and Data Protection package

**Files:**
- Modify: `apps/api/Lib/AppEnvironment.cs`
- Modify: `Directory.Packages.props`
- Modify: `apps/api/PublyApp.Api.csproj`

**Interfaces:**
- Produces: `AppEnvironment.Instance.SocialAccountsMasterKey` (`byte[]`, exactly 32 bytes, base64-decoded from `SOCIAL_ACCOUNTS_MASTER_KEY`). Later tasks read it.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Lib/AppEnvironmentMasterKeySpec.cs
using FluentAssertions;
using PublyApp.Api.Lib;
using Xunit;

namespace PublyApp.Api.Lib;

public sealed class AppEnvironmentMasterKeySpec {
	[Fact]
	public void ItShouldExposeTheDecodedMasterKeyAsAtLeast32Bytes() {
		// AppEnvironment.Instance is initialized once at assembly load from
		// .env.development (see Lib/Testing/Fixtures/TestEnvironment.Bootstrap). The
		// SOCIAL_ACCOUNTS_MASTER_KEY it reads is the committed placeholder in
		// .env.example — materialized to .env.development in CI, and present in local
		// .env.development. The boot wiring (Task 7) fails fast if the key is missing,
		// so the placeholder keeps the whole test assembly bootable.
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;

		key.Should().HaveCountGreaterOrEqualTo(32);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AppEnvironmentMasterKeySpec"`

Expected: FAIL — `AppEnvironment` has no `SocialAccountsMasterKey` property; the code does not compile.

- [ ] **Step 3: Write minimal implementation**

In `AppEnvironment.cs`, add the property and a required-secret parser. Mirror the existing `GetRequiredString` pattern (lines 624+). Add the field near the other secrets (after `STAFF_OWNER_BOOTSTRAP_CODE`, line 44):

```csharp
// apps/api/Lib/AppEnvironment.cs
public byte[] SocialAccountsMasterKey { get; }
```

Add to the private constructor parameter list (after `staffOwnerBootstrapCode`) and assign in the body:

```csharp
		string socialAccountsMasterKey,
```

```csharp
		SocialAccountsMasterKey = ParseMasterKey(nameof(SOCIAL_ACCOUNTS_MASTER_KEY), socialAccountsMasterKey);
```

In `Initialize()`, pass `GetRequiredString(nameof(SOCIAL_ACCOUNTS_MASTER_KEY))` into the constructor call (near line 436). Add the helpers at the bottom of the class:

```csharp
	private static byte[] ParseMasterKey(string name, string value) {
		var trimmed = (value ?? string.Empty).Trim();
		if (trimmed.Length == 0) {
			throw new InvalidOperationException(
				$"{name} is required (base64-encoded, exactly 32 bytes)."
			);
		}
		byte[] bytes;
		try {
			bytes = Convert.FromBase64String(trimmed);
		} catch (FormatException) {
			throw new InvalidOperationException(
				$"{name} must be base64-encoded."
			);
		}
		if (bytes.Length != 32) {
			throw new InvalidOperationException(
				$"{name} must decode to exactly 32 bytes (AES-256-GCM key); got {bytes.Length}."
			);
		}
		return bytes;
	}
```

Also add a **placeholder** to `.env.example` (it is the committed template materialized to `.env.development` in CI and copied by local dev). The placeholder is a valid 32-byte base64 key — NOT a secret, committed on purpose so the test assembly and `just build-api` boot; production overrides it via Dokploy (Task 8). Add near the other secrets:

```bash
# Social accounts credential encryption master key (Epic C §4). Placeholder — DO NOT use in
# production. Generate a real one: openssl rand -base64 32  (32 bytes). Override in Dokploy for
# api, worker, and migrate (see docs/deployment). Required in every role incl. Testing.
SOCIAL_ACCOUNTS_MASTER_KEY=NmPlOY4IXMIqksyOOpwMmo0oZGHr3gIrqpMP/eKHVkY=
```

In `Directory.Packages.props` add (near line 16, the EF Core block):

```xml
    <PackageVersion Include="Microsoft.AspNetCore.DataProtection.EntityFrameworkCore" Version="10.0.1" />
```

In `apps/api/PublyApp.Api.csproj` add inside `<ItemGroup>` of `<PackageReference>` entries:

```xml
    <PackageReference Include="Microsoft.AspNetCore.DataProtection.EntityFrameworkCore" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AppEnvironmentMasterKeySpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Lib/AppEnvironment.cs Directory.Packages.props apps/api/PublyApp.Api.csproj \
  apps/api/Lib/AppEnvironmentMasterKeySpec.cs .env.example
git commit -m "feat(api): require SOCIAL_ACCOUNTS_MASTER_KEY and reference DataProtection EF Core"
```

---

## Task 2: Persist Data Protection keys to Postgres + encrypt with the master key

**Files:**
- Modify: `apps/api/Data/DbContext/AppDbContext.cs`
- Create: `apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlEncryptor.cs`
- Create: `apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlDecryptor.cs`
- Modify: `apps/api/Lib/ServiceRegistration.cs`
- Create: `apps/api/Modules/SocialAccounts/Infrastructure/SocialAccountsMasterKeyWitness.cs`

**Interfaces:**
- Consumes: `AppEnvironment.Instance.SocialAccountsMasterKey` (Task 1).
- Produces: `IXmlEncryptor`/`IXmlDecryptor` singletons; `SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(IServiceProvider)` — later tasks (3, 5) rely on the witness passing at boot.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Tests/MasterKeyXmlSpec.cs
using FluentAssertions;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Infrastructure;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class MasterKeyXmlSpec {
	[Fact]
	public void ItShouldRoundTripEncryptedXmlUnderTheMasterKey() {
		// Arrange
		var encryptor = new MasterKeyXmlEncryptor();
		var decryptor = new MasterKeyXmlDecryptor();
		var clear = new System.Xml.Linq.XElement("key", "secret-blob");

		// Act
		var encrypted = encryptor.Encrypt(clear);
		var decrypted = decryptor.Decrypt(encrypted.EncryptedElement);

		// Assert
		decrypted.ToString(SaveOptions.DisableFormatting).Should().Be(
			clear.ToString(SaveOptions.DisableFormatting)
		);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~MasterKeyXmlSpec"`

Expected: FAIL — `MasterKeyXmlEncryptor`/`MasterKeyXmlDecryptor` do not exist.

- [ ] **Step 3: Write minimal implementation**

`MasterKeyXmlEncryptor.cs` — AES-256-GCM, unique 12-byte nonce per call, stored with the ciphertext:

```csharp
using System.Xml.Linq;

using Microsoft.AspNetCore.DataProtection.XmlEncryption;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class MasterKeyXmlEncryptor : IXmlEncryptor {
	private static readonly byte[] Magic = "PAPK"u8.ToArray(); // publyapp protection key

	public EncryptedXmlInfo Encrypt(XElement plaintextElement) {
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		using var aes = new System.Security.Cryptography.AesGcm(key);
		var nonce = new byte[AesGcm.NonceByteSizes.MaxSize]; // 12 bytes
		System.Security.Cryptography.RandomNumberGenerator.Fill(nonce);
		var plaintext = System.Text.Encoding.UTF8.GetBytes(
			plaintextElement.ToString(SaveOptions.DisableFormatting)
		);
		// AES-GCM needs the ciphertext and the auth tag in SEPARATE buffers; concatenate
		// them (ciphertext || tag) so the blob is self-contained for decryption.
		var ciphertext = new byte[plaintext.Length];
		var tag = new byte[AesGcm.TagByteSizes.MaxSize];
		aes.Encrypt(nonce, plaintext, ciphertext, tag);

		var blob = new byte[Magic.Length + 1 + nonce.Length + ciphertext.Length + tag.Length];
		var offset = 0;
		Array.Copy(Magic, 0, blob, offset, Magic.Length); offset += Magic.Length;
		blob[offset++] = 1; // version
		Array.Copy(nonce, 0, blob, offset, nonce.Length); offset += nonce.Length;
		Array.Copy(ciphertext, 0, blob, offset, ciphertext.Length); offset += ciphertext.Length;
		Array.Copy(tag, 0, blob, offset, tag.Length);

		return new EncryptedXmlInfo(
			new XElement("encryptedKey", Convert.ToBase64String(blob)),
			new Uri("https://publyapp.dev/key-encryption/master-key")
		);
	}
}
```

`MasterKeyXmlDecryptor.cs`:

```csharp
using System.Xml.Linq;

using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class MasterKeyXmlDecryptor : IXmlDecryptor {
	public XElement Decrypt(XElement encryptedElement) {
		var b64 = encryptedElement.Value
			?? throw new InvalidOperationException("Missing encryptedKey element.");
		var blob = Convert.FromBase64String(b64);
		var tagSize = System.Security.Cryptography.AesGcm.TagByteSizes.MaxSize;
		// magic(4) + version(1) + nonce(12) + ciphertext(>=0) + tag(16)
		if (blob.Length < 4 + 1 + 12 + tagSize) {
			throw new InvalidOperationException("Malformed master-key blob.");
		}
		if (!blob.AsSpan(0, 4).SequenceEqual("PAPK"u8)) {
			throw new InvalidOperationException("Unknown master-key blob magic.");
		}
		var version = blob[4];
		if (version != 1) {
			throw new InvalidOperationException($"Unsupported master-key version {version}.");
		}
		var nonce = blob.AsSpan(5, 12).ToArray();
		var ciphertextEnd = blob.Length - tagSize;
		var ciphertext = blob.AsSpan(5 + 12, ciphertextEnd - (5 + 12)).ToArray();
		var tag = blob.AsSpan(ciphertextEnd, tagSize).ToArray();
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		using var aes = new System.Security.Cryptography.AesGcm(key);
		var plaintext = new byte[ciphertext.Length];
		aes.Decrypt(nonce, ciphertext, tag, plaintext);

		return XElement.Parse(System.Text.Encoding.UTF8.GetString(plaintext));
	}
}
```

`AppDbContext.cs` — add the DbSet (after the `Post` DbSet, line 111) and the import at top:

```csharp
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
```

```csharp
	// Data Protection key ring (C1-bis): keys persisted in Postgres, encrypted at rest
	// with SOCIAL_ACCOUNTS_MASTER_KEY.
	public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
```

`ServiceRegistration.cs` — in `AddInfraServices`, before `return builder;`, add the Data Protection wiring (replacing any PR #1159 `PersistKeysToFileSystem`):

```csharp
		// Social account credential protection (C1-bis): key ring in Postgres, encrypted
		// with SOCIAL_ACCOUNTS_MASTER_KEY. No hosted service is added, so the
		// AppRoleCompositionSpec allowlist is unaffected.
		builder.Services
			.AddDataProtection()
			.SetApplicationName("publyapp-social-accounts")
			.PersistKeysToDbContext<AppDbContext>();
		builder.Services.AddSingleton<IXmlEncryptor, MasterKeyXmlEncryptor>();
		builder.Services.AddSingleton<IXmlDecryptor, MasterKeyXmlDecryptor>();
		builder.Services.AddSingleton<ICredentialProtector, CredentialProtector>();
```

`SocialAccountsMasterKeyWitness.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Startup witness: proves SOCIAL_ACCOUNTS_MASTER_KEY can protect then unprotect a sentinel
/// through the persisted Postgres key ring. Throws with a clear message on any failure so the
/// API/worker refuse to boot with a missing or wrong master key (Epic C §4).
/// </summary>
public static class SocialAccountsMasterKeyWitness {
	private const string Sentinel = "__social_accounts_master_key_sentinel__";

	public static void EnsureMasterKeyUsable(IServiceProvider services) {
		var protector = services.GetRequiredService<ICredentialProtector>();
		try {
			var protectedValue = protector.Protect(Sentinel, SocialProvider.Bluesky);
			var roundTripped = protector.Unprotect(protectedValue, SocialProvider.Bluesky);
			if (roundTripped != Sentinel) {
				throw new InvalidOperationException(
					"Master key round-trip produced an unexpected value."
				);
			}
		} catch (Exception ex) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY is missing or wrong: the social-account key ring "
					+ "cannot be protected/unprotected. The API/worker will not start. "
					+ "Generate a 32-byte key (openssl rand -base64 32) and set "
					+ "SOCIAL_ACCOUNTS_MASTER_KEY for api, worker, and migrate services.",
				ex
			);
		}
	}
}
```

Note: `ICredentialProtector`/`CredentialProtector` are created in Task 3; this task compiles only after Task 3 is done, OR you may create the interface+stub now (see Task 3 Step 3) so the witness compiles. Preferred: implement Task 3 immediately after this one and combine the build.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~MasterKeyXmlSpec"`

Expected: PASS. (`CredentialProtector` must exist for the witness to compile — ensure Task 3 is committed first or in the same change set.)

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Data/DbContext/AppDbContext.cs apps/api/Lib/ServiceRegistration.cs \
  apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlEncryptor.cs \
  apps/api/Modules/SocialAccounts/Infrastructure/MasterKeyXmlDecryptor.cs \
  apps/api/Modules/SocialAccounts/Infrastructure/SocialAccountsMasterKeyWitness.cs \
  apps/api/Modules/SocialAccounts/Tests/MasterKeyXmlSpec.cs
git commit -m "feat(api): persist Data Protection keys to Postgres, encrypt with master key"
```

---

## Task 3: Credential protector (one purpose per provider)

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Services/ICredentialProtector.cs`
- Create: `apps/api/Modules/SocialAccounts/Services/CredentialProtector.cs`

**Interfaces:**
- Consumes: `IDataProtectionProvider` (from `Microsoft.AspNetCore.DataProtection`; registered by `AddDataProtection()` in Task 2), `SocialProvider` (Task 4).
- Produces: `ICredentialProtector.Protect(string, SocialProvider)` / `Unprotect(string?, SocialProvider)` used by the witness (Task 2) and later slices.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Tests/CredentialProtectorSpec.cs
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class CredentialProtectorSpec {
	private static CredentialProtector Provider() => new(new NullDataProtectionProvider());

	[Fact]
	public void ItShouldRoundTripASecretPerProviderPurpose() {
		var provider = Provider();
		var clear = "app-password-secret";

		var protectedValue = provider.Protect(clear, SocialProvider.Bluesky);
		protectedValue.Should().NotBe(clear);

		provider.Unprotect(protectedValue, SocialProvider.Bluesky).Should().Be(clear);
	}

	[Fact]
	public void ItShouldReturnNullOnGarbageNotThrow() {
		var provider = Provider();
		provider.Unprotect("not-a-valid-token", SocialProvider.Bluesky).Should().BeNull();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~CredentialProtectorSpec"`

Expected: FAIL — types do not exist.

- [ ] **Step 3: Write minimal implementation**

`ICredentialProtector.cs`:

```csharp
namespace PublyApp.Api.Modules.SocialAccounts.Services;

public interface ICredentialProtector {
	// purpose is per-provider so a Bluesky key cannot decrypt an OAuth-stored secret.
	string Protect(string plaintext, SocialProvider provider);
	string? Unprotect(string? protectedText, SocialProvider provider);
}
```

`CredentialProtector.cs` — registered explicitly as a Singleton in `ServiceRegistration` (Task 2). Do **not** also put `[Service]` on it: `RegisterDiscoveredServices` fails fast if an interface is both `[Service]`-scanned (it auto-registers `I{ClassName}`) and explicitly registered — and the attribute's second arg is a `string? Key`, not a `Type`, so `[Service(ServiceLifetime.Singleton, typeof(ICredentialProtector))]` would not compile. The provider (`IDataProtectionProvider`) is itself singleton, so a singleton protector is correct.

```csharp
using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public sealed class CredentialProtector : ICredentialProtector {
	private readonly IDataProtectionProvider _dataProtectionProvider;

	public CredentialProtector(IDataProtectionProvider dataProtectionProvider) {
		_dataProtectionProvider = dataProtectionProvider;
	}

	public string Protect(string plaintext, SocialProvider provider) {
		return _dataProtectionProvider
			.CreateProtector($"social-account-{provider.ToString().ToLowerInvariant()}-v1")
			.Protect(plaintext);
	}

	public string? Unprotect(string? protectedText, SocialProvider provider) {
		if (string.IsNullOrEmpty(protectedText)) {
			return null;
		}
		try {
			return _dataProtectionProvider
				.CreateProtector($"social-account-{provider.ToString().ToLowerInvariant()}-v1")
				.Unprotect(protectedText);
		} catch (System.Security.Cryptography.CryptographicException) {
			return null;
		}
	}
}
```

Note on `PUBLY0003`: the purpose string uses `ToLowerInvariant()` (explicit, not `ToLower()`), which is permitted; it is not a comparison/dispatch — it only forms the purpose identifier.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~CredentialProtectorSpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Modules/SocialAccounts/Services/ICredentialProtector.cs \
  apps/api/Modules/SocialAccounts/Services/CredentialProtector.cs \
  apps/api/Modules/SocialAccounts/Tests/CredentialProtectorSpec.cs
git commit -m "feat(api): add per-provider ICredentialProtector (no endpoint yet)"
```

---

## Task 4: Entities + EF configuration + migration

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialProvider.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialCredentialType.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialAccountStatus.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialAccountProject.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialAccountConfiguration.cs`
- Create: `apps/api/Modules/SocialAccounts/Entities/SocialAccountProjectConfiguration.cs`
- Modify: `apps/api/Data/DbContext/AppDbContext.cs` (add DbSets for the two entities; the `DataProtectionKeys` DbSet was added in Task 2)

**Interfaces:**
- Produces: `SocialAccount`, `SocialAccountProject` types used by the sanitiser/visibility tasks (5, 6) and by later slices. DbSets enable the migration.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Tests/SocialAccountEntitySpec.cs
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class SocialAccountEntitySpec {
	private static IReadOnlyList<Microsoft.EntityFrameworkCore.Metadata.IEntityType> Model() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=social_account_guard")
			.Options;
		using var db = new AppDbContext(options);
		return db.GetService<IDesignTimeModel>().Model.GetEntityTypes().ToList();
	}

	[Fact]
	public void ItShouldConfigureSocialAccountCheckConstraintAndUniqueIndex() {
		var entity = Model().Single(e => e.ClrType == typeof(SocialAccount));
		entity.GetCheckConstraints().Single(c => c.Name == "CK_SocialAccount_Status")
			.Sql.Should().Be("status IN (10, 20, 30)");
		entity.GetIndexes().Single(i => i.GetDatabaseName() == "ix_social_accounts_tenant_provider_external")
			.Properties.Select(p => p.Name).Should().Equal("TenantId", "Provider", "ExternalAccountId");
	}

	[Fact]
	public void ItShouldConfigureSocialAccountProjectCompositeKey() {
		var entity = Model().Single(e => e.ClrType == typeof(SocialAccountProject));
		entity.FindPrimaryKey()!.Properties.Select(p => p.Name)
			.Should().Equal("SocialAccountId", "ProjectId");
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountEntitySpec"`

Expected: FAIL — entities/configs do not exist.

- [ ] **Step 3: Write minimal implementation**

`SocialProvider.cs`:

```csharp
namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public enum SocialProvider {
	Bluesky = 0,
}
```

`SocialCredentialType.cs`:

```csharp
namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public enum SocialCredentialType {
	AppPassword = 0,
	OAuth = 1,
}
```

`SocialAccountStatus.cs`:

```csharp
namespace PublyApp.Api.Modules.SocialAccounts.Entities;

// Active = 10, NeedsReconnect = 20, Revoked = 30 (Epic C §2).
public enum SocialAccountStatus {
	Active = 10,
	NeedsReconnect = 20,
	Revoked = 30,
}
```

`SocialAccount.cs` — mirror `Post` (audit + tenant through `BaseAttributes`/`ITenantEntity`; navigation via `RequiredNavigation`; enums as ints via EF convention):

```csharp
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

[Table("social_accounts")]
public class SocialAccount : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(_tenant, nameof(SocialAccount), nameof(Tenant)); }
		set { _tenant = value; }
	}

	[Column("provider")]
	public SocialProvider Provider { get; set; } = SocialProvider.Bluesky;

	// Bluesky DID — stable when the handle changes (Epic C §2).
	[Column("external_account_id")]
	public required string ExternalAccountId { get; set; }

	[Column("display_handle")]
	public required string DisplayHandle { get; set; }

	[Column("credential_type")]
	public SocialCredentialType CredentialType { get; set; } = SocialCredentialType.AppPassword;

	// Opaque blob, encrypted with the provider-specific Data Protection purpose.
	// Never returned by any API, never logged (Epic C §4).
	[Column("protected_credentials")]
	public required string ProtectedCredentials { get; set; }

	[Column("status")]
	public SocialAccountStatus Status { get; set; } = SocialAccountStatus.Active;

	[Column("last_success_at")]
	public DateTime? LastSuccessAt { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }

	// Populated by the service from SocialAccountProject rows; not mapped to a column.
	// VisibleIn (Task 6) reads this to decide per-project visibility.
	[NotMapped]
	public List<SocialAccountProject> Projects { get; set; } = [];

	// Safe before the entity is saved (Id is null pre-insert). Used by the junction
	// constructor in the VisibleIn test without a persisted row.
	internal Guid SafeId() => Id ?? Guid.Empty;
}
```

`SocialAccountProject.cs` — mirror `UserAccountProfile` (pure junction, `INoTenantEntity`, manual timestamps, no `BaseAttributes`):

```csharp
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// Pure junction: links a social account to the projects it may post in.
/// Empty set = visible everywhere in the tenant; non-empty = visible only there
/// (Epic C §2). Composite PK of the two FKs; unassignment hard-deletes the row.
/// </summary>
[Table("social_account_projects")]
public class SocialAccountProject : INoTenantEntity {
	[Column("social_account_id")]
	public Guid SocialAccountId { get; set; }

	private SocialAccount? _socialAccount;
	[JsonIgnore]
	public SocialAccount SocialAccount {
		get { return RequiredNavigation.Get(_socialAccount, nameof(SocialAccountProject), nameof(SocialAccount)); }
		set { _socialAccount = value; }
	}

	[Column("project_id")]
	public Guid ProjectId { get; set; }

	private PublyApp.Api.Modules.Projects.Entities.Project? _project;
	[JsonIgnore]
	public PublyApp.Api.Modules.Projects.Entities.Project Project {
		get { return RequiredNavigation.Get(_project, nameof(SocialAccountProject), nameof(Project)); }
		set { _project = value; }
	}

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
```

`SocialAccountConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountConfiguration : IEntityTypeConfiguration<SocialAccount> {
	public void Configure(EntityTypeBuilder<SocialAccount> builder) {
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_SocialAccount_Status",
			"status IN (10, 20, 30)"
		));

		builder
			.HasIndex(account => new { account.TenantId, account.Provider, account.ExternalAccountId })
			.IsUnique()
			.HasDatabaseName("ix_social_accounts_tenant_provider_external");

		builder
			.HasOne(account => account.Tenant)
			.WithMany()
			.HasForeignKey(account => account.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
```

`SocialAccountProjectConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountProjectConfiguration : IEntityTypeConfiguration<SocialAccountProject> {
	public void Configure(EntityTypeBuilder<SocialAccountProject> builder) {
		builder.HasKey(link => new { link.SocialAccountId, link.ProjectId });

		builder
			.HasOne(link => link.SocialAccount)
			.WithMany()
			.HasForeignKey(link => link.SocialAccountId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(link => link.Project)
			.WithMany()
			.HasForeignKey(link => link.ProjectId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
```

`AppDbContext.cs` — add the two DbSets (near the `Post` DbSet):

```csharp
	public DbSet<SocialAccount> SocialAccount { get; set; } = null!;
	public DbSet<SocialAccountProject> SocialAccountProject { get; set; } = null!;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountEntitySpec"`

Expected: PASS.

- [ ] **Step 5: Create the migration and apply**

Run (the model now carries `DataProtectionKeys` from Task 2 plus these two entities, so one `db-add` captures all three tables):

`just db-add SocialAccountsModule` then `just db-migrate`

Expected: one new migration file under `apps/api/Data/DbContext/Migrations/`; `just db-migrate` exits 0; `\dt` shows `social_accounts`, `social_account_projects`, `DataProtectionKeys`.

- [ ] **Step 6: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Modules/SocialAccounts/Entities/ apps/api/Data/DbContext/AppDbContext.cs \
  apps/api/Data/DbContext/Migrations/
git commit -m "feat(api): SocialAccount + SocialAccountProject entities, config, migration"
```

---

## Task 5: LastError sanitiser

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs`
- Create: `apps/api/Modules/SocialAccounts/Tests/LastErrorSanitiserSpec.cs`

**Interfaces:**
- Produces: `LastErrorSanitiser.Sanitize(string?)` — caps at 2 KB and scrubs the secret. Later slices call this before persisting `SocialAccount.LastError`.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Tests/LastErrorSanitiserSpec.cs
using FluentAssertions;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class LastErrorSanitiserSpec {
	[Fact]
	public void ItShouldCapAtTwoKilobytes() {
		var huge = new string('x', 10_000);
		LastErrorSanitiser.Sanitize(huge)!.Length.Should().BeLessThanOrEqualTo(2048);
	}

	[Fact]
	public void ItShouldScrubTheSecret() {
		var raw = "Bluesky refused: invalid app password 'hunter2-secret-token-123'";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("hunter2-secret-token-123");
		sanitised.Should().Contain("[redacted]");
	}

	[Fact]
	public void ItShouldPassThroughNull() {
		LastErrorSanitiser.Sanitize(null).Should().BeNull();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~LastErrorSanitiserSpec"`

Expected: FAIL — type missing.

- [ ] **Step 3: Write minimal implementation**

`LastErrorSanitiser.cs` — deterministic scrub using a fixed marker (no regex backtracking; secret never stored):

```csharp
namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Sanitises a failure message before it is persisted to SocialAccount.LastError.
/// Caps length at 2 KB and replaces any credential-shaped token with [redacted]
/// so the secret never lands in the database, logs, or audit rows (Epic C §4).
/// </summary>
public static class LastErrorSanitiser {
	private const int MaxBytes = 2048;
	// Matches quoted single-token secrets: '...' with no whitespace.
	private static readonly System.Text.RegularExpressions.Regex SecretPattern =
		new("'[^\\s'\"]{4,}'", System.Text.RegularExpressions.RegexOptions.Compiled);

	public static string? Sanitize(string? raw) {
		if (string.IsNullOrEmpty(raw)) {
			return raw;
		}
		var scrubbed = SecretPattern.Replace(raw, "'[redacted]'");
		var bytes = System.Text.Encoding.UTF8.GetBytes(scrubbed);
		if (bytes.Length <= MaxBytes) {
			return scrubbed;
		}
		// Trim to the last complete UTF-8 char within budget.
		var truncated = System.Text.Encoding.UTF8.GetString(bytes, 0, MaxBytes);
		var lastChar = truncated.LastIndexOfAny([' ', '\t', '\n']);
		return lastChar > 0 ? truncated[..lastChar] : truncated;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~LastErrorSanitiserSpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs \
  apps/api/Modules/SocialAccounts/Tests/LastErrorSanitiserSpec.cs
git commit -m "feat(api): add LastError sanitiser (<=2KB, secret never present)"
```

---

## Task 6: Visibility rule

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs`
- Create: `apps/api/Modules/SocialAccounts/Tests/VisibleInSpec.cs`

**Interfaces:**
- Consumes: `SocialAccount` (Task 4).
- Produces: `VisibleIn.Visible(SocialAccount, Guid)` — used by the list endpoint, post composer, and publish path in later slices (C2/C3/C4). Not called by any endpoint in C1-bis.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Tests/VisibleInSpec.cs
using FluentAssertions;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class VisibleInSpec {
	private static SocialAccount Active() {
		return new SocialAccount {
			TenantId = Guid.NewGuid(),
			ExternalAccountId = "did:plc:abc",
			DisplayHandle = "@x",
			ProtectedCredentials = "x",
			Status = SocialAccountStatus.Active,
		};
	}

	[Fact]
	public void ItShouldBeVisibleEverywhereWhenUnattached() {
		var account = Active();
		// No SocialAccountProject rows → VisibleIn true for any project.
		VisibleIn.Visible(account, Guid.NewGuid()).Should().BeTrue();
	}

	[Fact]
	public void ItShouldBeInvisibleInProjectNotAttachedTo() {
		var account = Active();
		var attached = Guid.NewGuid();
		var other = Guid.NewGuid();
		// Simulate attachment by giving the account one project link.
		account.Projects = new List<SocialAccountProject> {
			new SocialAccountProject { SocialAccountId = account.SafeId(), ProjectId = attached },
		};
		VisibleIn.Visible(account, other).Should().BeFalse();
		VisibleIn.Visible(account, attached).Should().BeTrue();
	}

	[Fact]
	public void ItShouldBeInvisibleWhenNotActive() {
		var account = Active();
		account.Status = SocialAccountStatus.NeedsReconnect;
		VisibleIn.Visible(account, Guid.NewGuid()).Should().BeFalse();
	}
}
```

Note: the test uses `account.Projects` and `account.SafeId()`; both are already defined on `SocialAccount` in Task 4 (the `[NotMapped] List<SocialAccountProject> Projects` and `internal Guid SafeId()`). No further change to the entity is needed here. When re-running Task 4's `SocialAccountEntitySpec` after Task 6's additions, the `[NotMapped]` nav does not affect the `social_accounts` table or the check/unique constraints, so the spec stays green.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~VisibleInSpec"`

Expected: FAIL — `VisibleIn` missing.

- [ ] **Step 3: Write minimal implementation**

`VisibleIn.cs` — exact mirror of the spec's rule:

```csharp
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Single visibility rule (Epic C §2): an account is visible in a project iff it is Active
/// and either attached to no project (visible everywhere in the tenant) or attached to that
/// project. Used by the list endpoint, post composer, and publish path in later slices.
/// </summary>
public static class VisibleIn {
	public static bool Visible(SocialAccount account, Guid projectId) {
		if (account.Status != SocialAccountStatus.Active) {
			return false;
		}
		var projects = account.Projects;
		if (projects.Count == 0) {
			return true;
		}
		return projects.Any(link => link.ProjectId == projectId);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~VisibleInSpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs \
  apps/api/Modules/SocialAccounts/Tests/VisibleInSpec.cs \
  apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs
git commit -m "feat(api): add VisibleIn visibility rule + Projects nav on SocialAccount"
```

---

## Task 7: Startup witness at boot + architecture guard

**Files:**
- Modify: `apps/api/Program.cs`
- Create: `apps/api/Modules/SocialAccounts/Tests/SocialAccountArchitecture.Spec.cs`

**Interfaces:**
- Consumes: `SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable` (Task 2).
- Produces: a booting API under a wrong master key must fail (the adversarial proof).

- [ ] **Step 1: Write the failing test (architecture guard)**

```csharp
// apps/api/Modules/SocialAccounts/Tests/SocialAccountArchitecture.Spec.cs
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Tests;

public sealed class SocialAccountArchitectureSpec {
	static SocialAccountArchitectureSpec() {
		PublyApp.Api.Lib.AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldDeclareStatusCheckConstraintWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=sa_arch_guard").Options;
		using var db = new AppDbContext(options);
		var entity = db.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(SocialAccount))!;
		entity.GetCheckConstraints().Single(c => c.Name == "CK_SocialAccount_Status")
			.Sql.Should().Be("status IN (10, 20, 30)");
	}

	[Fact]
	public void ItShouldRequireEveryServiceMethodWithTenantIdToUseIt() {
		// Mirror PostArchitectureSpec: every CredentialProtector / future SocialAccountService
		// method with a Guid tenantId must reference TenantId == in its body. Today the only
		// such surface is the protector shape; extend when SocialAccountService lands (C2).
		var path = FindSocialAccountServicePath();
		if (path is null) {
			return; // no service file yet; guard stays green until C2 adds one
		}
		var source = File.ReadAllText(path);
		var offenders = new List<string>();
		foreach (var slice in SplitMethods(source, "public")) {
			if (!slice.Signature.Contains("Guid tenantId", StringComparison.Ordinal)) {
				continue;
			}
			if (!slice.Body.Contains("TenantId ==") && !slice.Body.Contains("tenantId")) {
				offenders.Add(slice.Signature.Trim());
			}
		}
		offenders.Should().BeEmpty(
			"every tenant-scoped method must use its tenantId. Offenders:\n" + string.Join("\n", offenders)
		);
	}

	private static string? FindSocialAccountServicePath() {
		var dir = new DirectoryInfo(AppContext.BaseDirectory);
		while (dir is not null) {
			var target = Path.Combine(dir.FullName, "apps", "api", "Modules", "SocialAccounts", "Services", "SocialAccountService.cs");
			if (File.Exists(target)) { return target; }
			dir = dir.Parent;
		}
		return null;
	}

	private sealed record MethodSlice(string Signature, string Body);
	private static List<MethodSlice> SplitMethods(string source, string marker) {
		var slices = new List<MethodSlice>();
		var from = 0;
		while (true) {
			var idx = source.IndexOf(marker, from, StringComparison.Ordinal);
			if (idx < 0) { break; }
			var next = source.IndexOf(marker, idx + marker.Length, StringComparison.Ordinal);
			var slice = next < 0 ? source[idx..] : source[idx..next];
			var brace = slice.IndexOf('{');
			slices.Add(new MethodSlice(brace >= 0 ? slice[..brace] : slice, slice));
			if (next < 0) { break; }
			from = next;
		}
		return slices;
	}
}
```

- [ ] **Step 2: Run architecture guard to verify it passes (no service file yet)**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountArchitectureSpec"`

Expected: PASS.

- [ ] **Step 3: Wire the witness into Program.cs**

In `Program.cs`, after `var app = builder.Build();` (line 78) and before `ConfigureHttpPipeline(app);` (line 82), insert:

```csharp
		// C1-bis: refuse to boot if SOCIAL_ACCOUNTS_MASTER_KEY is missing/wrong (Epic C §4).
		// The DataProtectionKeys table already exists here: migrations are applied by the
		// separate `migrate` service (or `just db-migrate`) BEFORE api/worker boot, so the
		// key ring is present when the witness round-trips the sentinel through it.
		PublyApp.Api.Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(app.Services);
```

Also call it in the worker host path after `workerHost.Build()` (line 71), before `workerHost.Run()`:

```csharp
			workerHost.LogDiManifestIfPresent();
			PublyApp.Api.Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness
				.EnsureMasterKeyUsable(workerHost.Services);
			workerHost.Run();
```

- [ ] **Step 4: Run the full build to verify boot wiring compiles and the wrong-key refusal is provable**

Run: `cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis && TRUSTED_PROXY_CIDRS="127.0.0.1/32" ~/ai-orchestration-playbook/tools/heavy.sh just build-api`

Expected: build exits 0. Then prove the refusal: boot the API locally with `SOCIAL_ACCOUNTS_MASTER_KEY` set to a **wrong** (but valid base64, exactly 32 bytes) value and confirm the process exits with the witness's `InvalidOperationException` ("SOCIAL_ACCOUNTS_MASTER_KEY is missing or wrong"). With the correct key it reaches `app.Run()`.

- [ ] **Step 5: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add apps/api/Program.cs \
  apps/api/Modules/SocialAccounts/Tests/SocialAccountArchitecture.Spec.cs
git commit -m "feat(api): boot witness for SOCIAL_ACCOUNTS_MASTER_KEY + architecture guard"
```

---

## Task 8: Docs, env, deploy + full gate

**Files:**
- Modify: `.env.example`
- Modify: `dokploy.yml`
- Create/Modify: `docs/deployment/production-deployment-design.md` (add a "Social Accounts Master Key" section) or a new `docs/deployment/social-accounts-master-key.md` linked from it.

**Interfaces:**
- Produces: operator-facing loss procedure; config that injects the key into api/worker/migrate and removes the PR #1159 file-system artifact.

- [ ] **Step 1: Write the failing check (grep must find the FS artifact today)**

Run: `grep -rn "PersistKeysToFileSystem\|.data-protection/keys" apps/api .env.example dokploy.yml`

Expected: matches exist from PR #1159 rework (files still present in this branch's starting point) — confirm before removing.

- [ ] **Step 2: Update `.env.example`**

Remove any `FILE_STORAGE_ROOT/.data-protection/keys` line. Add:

```bash
# Social accounts credential encryption master key (Epic C §4).
# Generate: openssl rand -base64 32  (32 bytes). Required in api, worker, migrate.
SOCIAL_ACCOUNTS_MASTER_KEY=
```

Keep `FILE_STORAGE_ROOT` only if used elsewhere.

- [ ] **Step 3: Update `dokploy.yml`**

Remove the data-protection file volume mount. Add `SOCIAL_ACCOUNTS_MASTER_KEY` to the `environment`/`secrets` block of `publyapp-api`, `publyapp-worker`, and `publyapp-migrate`.

- [ ] **Step 4: Write the loss-of-master-key procedure doc**

Add to `docs/deployment/production-deployment-design.md` a section:

```markdown
### Social Accounts Master Key (`SOCIAL_ACCOUNTS_MASTER_KEY`)

- **Generation:** `openssl rand -base64 32` (32 bytes). Injected as a Dokploy secret into
  `publyapp-api`, `publyapp-worker`, `publyapp-migrate`.
- **What it protects:** the ASP.NET Data Protection key ring (Postgres `DataProtectionKeys`),
  which in turn protects every `social_accounts.protected_credentials` blob.
- **Loss impact:** with no key (or a wrong one) the API/worker **refuse to start** — the
  startup witness fails fast with a clear message, so there is no silent token loss. Any
  stored social token encrypted under the old ring becomes unrecoverable.
- **Recovery (Epic C §4):** generate a new key, set it on all three services, restart. Every
  account transitions to `NeedsReconnect`; the Integrations banner (C3) drives reconnection,
  which re-opens a Bluesky session, resolves the DID, and re-encrypts the secret under the new
  ring. No post data is lost. No rotation tooling ships in C1-bis; re-protecting stored tokens
  is a later Epic C task (the `ICredentialProtector` exposes the surface for it).
```

- [ ] **Step 5: Run the full gate**

Run: `cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis && just ci`

Expected: green — builds, analyzers (`test-analyzers`), and the full API suite (incl. all `SocialAccount` specs and the `AppRoleCompositionSpec` which stays green because no hosted service was added). Then:

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccount"`

Expected: all green, including the tenant-isolation contract (deferred to C2 endpoints) and the witness/wrong-key refusal proven in Task 7 Step 4.

- [ ] **Step 6: Commit**

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-plan-c1bis
git add .env.example dokploy.yml docs/deployment/
git commit -m "docs(deploy): social accounts master key env + loss procedure; drop FS key store"
```

---

## Self-Review (against the brief + Epic C spec)

1. **Spec coverage** — every brief item is a task: entities+EF+migration (T4), credential protection with Postgres key ring + master key + witness (T2, T3, T7), `LastError` sanitiser (T5), `VisibleIn` (T6), docs/loss procedure (T8). The brief's explicit exclusions are honored: **no endpoints, no handlers, no permissions seeding, no screens** (C2/C3). The adversarial mutation (drop tenant filter → isolation spec red) and secret-never-in-JSON guard are deferred to C2 where endpoints exist; this plan's `T5`/`T6`/`T7` specs cover the foundations-level proofs the brief asks for here.
2. **Placeholder scan** — no "TBD"/"similar to Task N". Every code step shows the code. The only forward-reference is `SocialAccountService.cs` in the architecture guard (T7), which gracefully returns when the file is absent (C2 adds it) — not a placeholder, an explicit "not yet" with a reason.
3. **Type consistency** — `SocialAccount`, `SocialAccountProject`, `SocialProvider`, `SocialCredentialType`, `SocialAccountStatus`, `ICredentialProtector`/`CredentialProtector`, `LastErrorSanitiser.Sanitize`, `VisibleIn.Visible` are defined in earlier tasks and reused verbatim in later ones. `account.Projects`/`SafeId()` added to `SocialAccount` in T6 with the test adjusted accordingly.
4. **Decisions taken where the spec left room:**
   - Key ring on `AppDbContext` (not a dedicated context) — simpler composition, one migrate service; brief allowed either.
   - Kept `ITokenProtector` naming as `ICredentialProtector` (clearer; brief said "or the #1159 ITokenProtector renamed/kept — decide").
   - `VisibleIn` takes `account` + `projectId` exactly as the brief specifies ("ONE function `VisibleIn(account, projectId)`").
   - `LastError` scrub uses a quoted-token regex (no secret stored); capped at 2048 bytes per brief.
