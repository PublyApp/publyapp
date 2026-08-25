Test run for /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-645b/apps/api/.artifacts/bin/PublyApp.Api.Tests/Test/net10.0/PublyApp.Api.Tests.dll (.NETCoreApp,Version=v10.0)
VSTest version 18.0.1 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.
  Failed PublyApp.Api.Lib.Architecture.PublicationArchitectureSpec.ItShouldKeepEveryPublishingEndpointPermissionedAndRateLimited [37 ms]
  Error Message:
   Expected offenders to be empty because every publishing endpoint must be individually rate-limited and permission-gated; found 2 offender(s):
Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs:13: mapping without an explicit RequireRateLimiting policy
Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs:13: mapping without WithTenantPermission metadata, but found at least one item {"Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs:13: mapping without an explicit RequireRateLimiting policy"}.
  Stack Trace:
     at FluentAssertions.Execution.XUnit2TestFramework.Throw(String message)
   at FluentAssertions.Execution.TestFrameworkProvider.Throw(String message)
   at FluentAssertions.Execution.DefaultAssertionStrategy.HandleFailure(String message)
   at FluentAssertions.Execution.AssertionScope.FailWith(Func`1 failReasonFunc)
   at FluentAssertions.Execution.AssertionScope.FailWith(Func`1 failReasonFunc)
   at FluentAssertions.Execution.AssertionScope.FailWith(String message, Object[] args)
   at FluentAssertions.Execution.GivenSelector`1.FailWith(String message, Object[] args)
   at FluentAssertions.Collections.GenericCollectionAssertions`3.BeEmpty(String because, Object[] becauseArgs)
   at PublyApp.Api.Lib.Architecture.PublicationArchitectureSpec.ItShouldKeepEveryPublishingEndpointPermissionedAndRateLimited() in /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-645b/apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs:line 843
   at System.Reflection.MethodBaseInvoker.InterpretedInvoke_Method(Object obj, IntPtr* args)
   at System.Reflection.MethodBaseInvoker.InvokeWithNoArgs(Object obj, BindingFlags invokeAttr)

Failed!  - Failed:     1, Passed:     0, Skipped:     0, Total:     1, Duration: 37 ms - PublyApp.Api.Tests.dll (net10.0)

<!--
D2 plan Task 5 Step 2 — RED proof transcript (.dump/mutation-unpermissioned-endpoint.md).

Mutation:  planted Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs
           (temp, uncommitted) mapping GET /publishing/rogue with NO
           RequireRateLimiting and NO WithTenantPermission on its own chain.
Expected:  ItShouldKeepEveryPublishingEndpointPermissionedAndRateLimited fails
           while NAMING the rogue file.
Observed:  Failed with exactly two offenders, both attributed to
           Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs:13:
             - "mapping without an explicit RequireRateLimiting policy"
             - "mapping without WithTenantPermission metadata"
Result:    RED CONFIRMED. Rogue file deleted immediately after capture;
           guard re-run green (see commit history of Task 5).
-->
