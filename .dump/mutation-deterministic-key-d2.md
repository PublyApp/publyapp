# D2 Task 10 — adversarial mutation: remove the deterministic key

Lane `lane/wt-645b` (#645, epic #631). Executed 2026-08-25 per plan
`docs/records/2026-08-25-plan-d2-publish-now.md` Task 10.

## Target

`apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` — `For(Guid)`.

## Step 1 — pre-mutation state

```
$ md5sum apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs   (pre-mutation)
6e63ea825bc5e8a8b6ead9bf049dd377  Modules/Publishing/Lib/PublicationIdempotencyKey.cs
```

Original body:

```csharp
public static string For(Guid publicationId) {
    var hash = SHA256.HashData(publicationId.ToByteArray());
    return Convert.ToHexString(hash, 0, 16).ToLowerInvariant();
}
```

Mutant applied (per plan; plus `_ = publicationId;` and removal of the now-unused
`System.Security.Cryptography` using ONLY because the repo's strict analyzers,
PUBLY*/IDE0005/IDE0060, fail the build otherwise — the mutation semantics are
unchanged: randomness replaces derivation):

```csharp
public static string For(Guid publicationId) {
    // MUTANT (Task 10): randomness replaces derivation; the id is ignored.
    _ = publicationId;
    return Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant()[..16];
}
```

## Step 2 — runs under the mutant

Real detector (MUST go RED — it did):

```
$ dotnet test ... --filter "FullyQualifiedName~BlueskyPublishProviderSpec.ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout"
[xUnit.net 00:00:00.46] PublyApp.Api.Modules.Publishing.Providers.BlueskyPublishProviderSpec.
    ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout [FAIL]
Failed!  - Failed:     1, Passed:     0, Skipped:     0, Total:     1
Error Message:
Expected fakePds.StoredRkeys to contain a single item because the deterministic key
means the replay collides with the SAME record, but found
{"pub-8d495899c2cb764c", "pub-1dedf83686dd9c4e"}.
```

Exactly the plan's predicted failure shape: each simulated retry derives a DIFFERENT
random rkey, so the replay stores a SECOND record (`StoredRkeys` has 2 items) instead
of colliding with one. The subsequent assertion
(`second.Should().BeOfType<PublishResult.AlreadyExistsTreatedAsPublished>`) is never
reached because the first failure aborts the fact.

Sanity check — old headline target under the SAME mutant (stays GREEN, proving the
round-2 F3 finding that it is mutation-vacuous):

```
$ dotnet test ... --filter "FullyQualifiedName~PublishPublicationJobHandlerSpec.ItShouldTreatAlreadyExistsAsSuccessWithTheExistingRecordAndNoDuplicate"
Passed!  - Failed:     0, Passed:     1, Skipped:     0, Total:     1
```

## Step 3 — restore proof

```
$ git checkout -- apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs
$ md5sum apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs
6e63ea825bc5e8a8b6ead9bf049dd377  Modules/Publishing/Lib/PublicationIdempotencyKey.cs
(pre-mutation md5 matches — tree unchanged)

Build after restore: 0 Error(s).
Both filters re-run GREEN:
  BlueskyPublishProviderSpec.ItShouldNotCreateADuplicate...      -> Passed!
  PublishPublicationJobHandlerSpec.ItShouldTreatAlreadyExists... -> Passed!
```

No commit was made for the mutant itself; this transcript is the only artifact.

## Conclusion

- The D2 mutation claim holds: removing the deterministic derivation is detected by
  exactly the plan's named spec, and by no other observed fact.
- The old handler-side fact stays green under the mutant, confirming the plan's
  "vacuous old target" analysis (it observes only the stored constant).
