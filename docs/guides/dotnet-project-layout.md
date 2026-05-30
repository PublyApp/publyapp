# .NET Project Layout

> Extracted from `AGENTS.md` — the repo-wide convention for where .NET
> projects live, how tests are wired, how projects are named, and how build
> config is centralized.

This guide is the single source of truth for **.NET project layout** across the
monorepo: deployable apps, shared C# libraries, and C# tooling (analyzers,
scripts, generators). It applies to every .NET area equally — there is **one
layout**, whether the area is an app or a package.

## Placement: apps vs packages

- **Deployable apps** live in `apps/<app>/` (e.g. `apps/api`, future
  `apps/jobs`). An app is something you ship/run as a unit.
- **Shared libraries and tooling** live in `packages/<name>-cs/` (e.g.
  `packages/scripts-cs`, `packages/lint-cs`, future `packages/shared-cs`).
  Tooling means analyzers, code generators, scripts — anything that supports the
  build/dev workflow rather than being deployed.
- **Never** place a tooling/analyzer/library project under an app. A Roslyn
  analyzer or a shared library that the API consumes is a `packages/*-cs`
  project, not an `apps/api/*` subfolder. (See the glob-collision rule below for
  the concrete failure this avoids.)

### `packages/` is polyglot

`packages/` holds both JavaScript/TypeScript and C# packages. The folder name
carries a language suffix so the two never collide and the language is obvious
at a glance:

| Suffix | Language | Examples |
| --- | --- | --- |
| `-ts` | JavaScript / TypeScript | `client-ts`, `shared-ts`, `lint-ts` |
| `-cs` | C# / .NET | `scripts-cs`, `lint-cs`, future `shared-cs` |

The general form is `<purpose>-<lang>`. A C# shared library is `shared-cs`; its
TypeScript counterpart is `shared-ts`. The auto-generated API client is
`client-ts`. The C# lint/analyzer package is `lint-cs`.

> Note: the JS lint plugin currently ships as `packages/oxlint-plugin-publy`
> (an Oxlint `jsPlugins` package). The `-ts` naming above is the target form
> packages converge on; the polyglot-suffix rule is what matters for **new** C#
> packages.

## One layout for every .NET area

Every .NET area — app or package — uses the same shape:

- The **main / library `.csproj` sits at the area root.**
- Tests are **co-located** as `*.Spec.cs` files next to the code they test.
- A **`Tests/` subfolder holds ONLY the test-runner shell `.csproj`** — no test
  cases. The shell links `..\**\*.Spec.cs` into itself and references the main
  project.
- The **main project EXCLUDES** `**/*.Spec.cs`, `Tests/**`, and any test-only
  helpers, so production builds never compile test code.
- **Single-project packages with no tests stay flat** — no `Tests/` shell. See
  `packages/scripts-cs`.

### Why co-located specs + a runner shell

Co-locating `*.Spec.cs` next to source keeps tests Vertical-Slice friendly: the
spec for a handler lives beside the handler, not in a far-away mirror tree. But
test code must not ship in the production assembly. The split resolves both: the
main project physically contains the spec files but **excludes them from
compilation**; the runner shell **links them in** and pulls the test packages
(`xunit`, `Testcontainers`, etc.). One physical tree, two compilation views.

### The exact `apps/api` mechanism

The main project (`apps/api/PublyApp.Api.csproj`) removes spec/test files and
test-only helper folders from every item type it would otherwise glob:

```xml
<ItemGroup>
  <Compile Remove="**/*.Spec.cs" />
  <Compile Remove="Lib/Testing/**/*.cs" />
  <Compile Remove="Tests/**/*.cs" />
  <None Remove="Lib/Testing/**" />
  <None Remove="Tests/**" />
  <Content Remove="Lib/Testing/**" />
  <Content Remove="Tests/**" />
  <EmbeddedResource Remove="Lib/Testing/**" />
  <EmbeddedResource Remove="Tests/**" />
</ItemGroup>
```

The runner shell (`apps/api/Tests/PublyApp.Api.Tests.csproj`) references the main
project and **links** the co-located specs (and shared test infra) into the test
compilation, preserving folder structure via the `Link` metadata:

```xml
<ItemGroup>
  <ProjectReference Include="..\PublyApp.Api.csproj" />
</ItemGroup>

<!-- Keep integration tests physically next to handlers (Vertical Slice
     friendly), but compile them into this dedicated test project. -->
<ItemGroup>
  <Compile Include="..\Lib\Testing\**\*.cs"
           Link="Lib\Testing\%(RecursiveDir)%(Filename)%(Extension)" />
  <Compile Include="..\Data\**\*.Spec.cs"
           Link="Data\%(RecursiveDir)%(Filename)%(Extension)" />
  <Compile Include="..\Infrastructure\**\*.Spec.cs"
           Link="Infrastructure\%(RecursiveDir)%(Filename)%(Extension)" />
  <Compile Include="..\Lib\**\*.Spec.cs"
           Link="Lib\%(RecursiveDir)%(Filename)%(Extension)" />
  <Compile Include="..\Modules\**\*.Spec.cs"
           Link="Modules\%(RecursiveDir)%(Filename)%(Extension)" />
</ItemGroup>
```

A new top-level source area that contains specs (e.g. a new sibling of
`Modules/`) needs its own `Compile Include="..\<Area>\**\*.Spec.cs"` line in the
shell — globs are listed per area, not a single repo-wide `..\**\*.Spec.cs`, to
keep the link tree explicit and avoid pulling unintended trees.

## Naming

- **Assembly / `.csproj` names** are `PublyApp.*` (e.g. `PublyApp.Scripts`).
  The project file name matches the assembly name (`PublyApp.Scripts.csproj`).
- The test-runner shell is `<Assembly>.Tests.csproj` (e.g.
  `PublyApp.Api.Tests.csproj`).
- **Package folder names** are `<purpose>-<lang>` (`scripts-cs`, `lint-cs`).
  The folder name and the assembly name are independent: folder
  `packages/scripts-cs` holds assembly `PublyApp.Scripts`.

## Build config (centralized)

Build configuration is centralized at the repo root and inherited by every area:

- **`Directory.Build.props`** sets the shared defaults: `net10.0`,
  `Nullable=enable`, `ImplicitUsings=enable`, `TreatWarningsAsErrors=true`,
  `IDE0130` as an error (`WarningsAsErrors`), `GenerateDocumentationFile=true`,
  and the `.artifacts` output convention (`DotNetArtifactsRoot`, `BaseOutputPath`,
  `BaseIntermediateOutputPath`, plus excluding `.artifacts/`, `bin/`, `obj/` from
  default globs).
- **`Directory.Build.targets`** enforces the `.artifacts` convention at build
  time: it fails the build if `BaseOutputPath` / `BaseIntermediateOutputPath`
  do not resolve under a `.artifacts/` directory.
- **`Directory.Packages.props`** turns on Central Package Management
  (`ManagePackageVersionsCentrally=true`) and pins every package version, so
  `.csproj` files use bare `<PackageReference Include="..." />` with no `Version`.

Each .NET area carries a **tiny `Directory.Build.props`** that points
`DotNetArtifactsRoot` at its own local `.artifacts/`, then imports the repo-root
props:

```xml
<Project>
  <PropertyGroup>
    <DotNetArtifactsRoot>$(MSBuildThisFileDirectory).artifacts\</DotNetArtifactsRoot>
  </PropertyGroup>

  <Import Project="..\..\Directory.Build.props" />
</Project>
```

This keeps build output local to each area (validated by the root targets) while
inheriting all shared settings.

### Analyzer projects override the target framework

Roslyn analyzers must load into the compiler, so an analyzer `.csproj`
**overrides `TargetFramework` to `netstandard2.0`** in its own project file
(the root default is `net10.0`). The rest of the layout — root-imported
`Directory.Build.props`, `.artifacts` output, `PublyApp.*` naming, co-located
specs + `Tests/` shell — stays identical. Analyzer projects live under
`packages/lint-cs/`, never under an app.

## Glob-collision rule

MSBuild SDK projects glob their source with `**/*.cs`. Therefore **no project's
folder may physically contain another project's source folder** — the outer
project's glob would swallow the inner project's `.cs` files and compile them
into the wrong assembly.

This is exactly why analyzer/tooling projects live in `packages/*-cs` and not
under an app: an analyzer parked at `apps/api/Analyzers/` was swallowed by
`PublyApp.Api`'s `**/*.cs` glob (its analyzer sources compiled into the API
assembly), which is what motivated moving it out to `packages/lint-cs`.

The **one deliberate exception** is the co-located `Tests/` runner shell. Its
source (`*.Spec.cs`, test helpers) physically lives inside the main project's
tree on purpose — and the collision is handled by the controlled
exclude/link wiring shown above: the main project `Compile Remove`s the test
files, and the shell `Compile Include`s them with `Link` metadata. No other
nested-project arrangement is allowed.

## Example trees

### App: `apps/api`

```text
apps/api/
├── Directory.Build.props        # sets DotNetArtifactsRoot, imports root props
├── PublyApp.Api.csproj               # main project; Compile Remove **/*.Spec.cs, Tests/**
├── Program.cs
├── Modules/
│   └── Users/
│       ├── Handlers/
│       │   └── Staff/
│       │       ├── CreateUserForStaff.cs
│       │       └── CreateUserForStaff.Spec.cs   # co-located spec
│       └── Services/
│           └── UserService.cs
├── Lib/
│   ├── Utils/
│   │   ├── DateUtils.cs
│   │   └── DateUtils.Spec.cs                    # co-located unit spec
│   └── Testing/                                 # shared test infra (excluded from main)
│       ├── Fixtures/
│       ├── Helpers/
│       └── Fakes/
└── Tests/
    └── PublyApp.Api.Tests.csproj     # runner shell ONLY: references PublyApp.Api, links ..\**\*.Spec.cs
```

### Package with tests: `packages/lint-cs`

```text
packages/lint-cs/
├── Directory.Build.props        # DotNetArtifactsRoot + import root props
├── PublyApp.Lint.csproj         # analyzer lib; TargetFramework override to netstandard2.0
├── DiagnosticCatalog.cs
├── Rules/
│   ├── NoNullForgivingAnalyzer.cs
│   └── NoNullForgivingAnalyzer.Spec.cs          # co-located spec
└── Tests/
    └── PublyApp.Lint.Tests.csproj  # runner shell ONLY: references the lib, links ..\**\*.Spec.cs
```

### Single-project package (no tests): `packages/scripts-cs`

```text
packages/scripts-cs/
├── Directory.Build.props        # DotNetArtifactsRoot + import root props
├── PublyApp.Scripts.csproj      # flat, no Compile Remove, no Tests/ shell
├── Program.cs
└── Commands/
```

`scripts-cs` stays flat because it has no specs. Add a `Tests/` runner shell and
the `Compile Remove` wiring only when you introduce the first `*.Spec.cs`.

### Future package: `packages/shared-cs`

A future shared C# library would follow the package-with-tests shape:

```text
packages/shared-cs/
├── Directory.Build.props
├── PublyApp.Shared.csproj       # main library; Compile Remove **/*.Spec.cs, Tests/**
├── <feature>.cs
├── <feature>.Spec.cs
└── Tests/
    └── PublyApp.Shared.Tests.csproj
```

### Future app: `apps/jobs`

A future background-jobs app would mirror `apps/api`:

```text
apps/jobs/
├── Directory.Build.props
├── PublyApp.Jobs.csproj         # main project; Compile Remove **/*.Spec.cs, Tests/**
├── Program.cs
├── Jobs/
│   ├── <Job>.cs
│   └── <Job>.Spec.cs
└── Tests/
    └── PublyApp.Jobs.Tests.csproj
```

## Checklist for a new .NET area

1. Decide placement: deployable → `apps/<app>/`; shared lib/tooling →
   `packages/<purpose>-cs/`. Tooling never goes under an app.
2. Put the main / library `.csproj` at the area root; name it `PublyApp.*`.
3. Add a tiny `Directory.Build.props` that sets `DotNetArtifactsRoot` to the
   local `.artifacts/`, then imports `..\..\Directory.Build.props`.
4. Reference packages with bare `<PackageReference>` (versions come from
   `Directory.Packages.props`).
5. Co-locate tests as `*.Spec.cs` next to source.
6. When the first spec appears, add a `Tests/<Assembly>.Tests.csproj` runner
   shell (references the main project, links `..\<area>\**\*.Spec.cs`) and add
   the matching `Compile Remove` lines to the main project. Single-project
   packages with no specs stay flat.
7. Analyzer project? Override `TargetFramework` to `netstandard2.0` in its
   `.csproj`; everything else is identical.
8. Never nest one project's source folder inside another's (glob-collision
   rule) — the co-located `Tests/` shell is the only sanctioned exception.
