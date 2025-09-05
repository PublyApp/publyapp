# 📋 .NET Solution & Central Package Management Guide

## 🏗️ **Creating a Solution**

### Create a new solution

```bash
# Create solution in current directory
dotnet new sln -n MySolutionName

# Create solution in specific directory
dotnet new sln -n MySolutionName -o path/to/solution
```

### Initialize Central Package Management

Create these files in your solution root:

**`Directory.Packages.props`** (manages package versions):

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <ItemGroup>
    <PackageVersion Include="Serilog.AspNetCore" Version="9.0.0" />
    <PackageVersion Include="Microsoft.AspNetCore.OpenApi" Version="9.0.8" />
  </ItemGroup>
</Project>
```

**`Directory.Build.props`** (common project properties):

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

---

## 📦 **Adding/Removing Projects**

### Add projects to solution

```bash
# Add single project
dotnet sln add path/to/Project.csproj

# Add multiple projects
dotnet sln add Project1/Project1.csproj Project2/Project2.csproj

# Add all projects in directory
dotnet sln add **/*.csproj
```

### Remove projects from solution

```bash
# Remove single project
dotnet sln remove path/to/Project.csproj

# Remove multiple projects
dotnet sln remove Project1/Project1.csproj Project2/Project2.csproj
```

### List projects in solution

```bash
dotnet sln list
```

---

## 📚 **Managing Dependencies**

### 🌐 **Adding Dependencies to Solution (Central Management)**

**Step 1:** Add package version to `Directory.Packages.props`:

```xml
<ItemGroup>
  <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  <PackageVersion Include="AutoMapper" Version="12.0.1" />
</ItemGroup>
```

**Step 2:** Reference in any project without version:

```xml
<!-- In MyProject.csproj -->
<ItemGroup>
  <PackageReference Include="Newtonsoft.Json" />
  <PackageReference Include="AutoMapper" />
</ItemGroup>
```

### 🎯 **Adding Dependencies to Specific Project**

```bash
# Add package to specific project (will use central version)
dotnet add Project1/Project1.csproj package Newtonsoft.Json

# This will:
# 1. Add the PackageReference to Project1.csproj (without version)
# 2. Require the version to be defined in Directory.Packages.props
```

### ❌ **Removing Dependencies**

**From solution (central management):**

1. Remove from `Directory.Packages.props`:

   ```xml
   <!-- Remove this line -->
   <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
   ```

2. Remove from all project files:

   ```xml
   <!-- Remove this line from all .csproj files -->
   <PackageReference Include="Newtonsoft.Json" />
   ```

**From specific project:**

```bash
# Remove package from specific project
dotnet remove Project1/Project1.csproj package Newtonsoft.Json

# This removes the PackageReference but keeps the central version definition
```

---

## 🔄 **Different Package Versions**

### **Scenario 1: Override Central Version for Specific Project**

Sometimes you need a different version in one project:

**`Directory.Packages.props`:**

```xml
<ItemGroup>
  <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
</ItemGroup>
```

**`SpecialProject.csproj`:**

```xml
<ItemGroup>
  <!-- Override central version for this project only -->
  <PackageReference Include="Newtonsoft.Json" Version="12.0.1" />
</ItemGroup>
```

### **Scenario 2: Conditional Versions**

Different versions based on conditions:

**`Directory.Packages.props`:**

```xml
<ItemGroup>
  <!-- Default version -->
  <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />

  <!-- Different version for specific projects -->
  <PackageVersion Include="Microsoft.EntityFrameworkCore"
                  Version="7.0.0"
                  Condition="'$(MSBuildProjectName)' == 'LegacyProject'" />
</ItemGroup>
```

### **Scenario 3: Multiple Versions of Same Package**

If you absolutely need different versions:

**`Directory.Packages.props`:**

```xml
<ItemGroup>
  <!-- Version aliases -->
  <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  <PackageVersion Include="Newtonsoft.Json.Legacy" Version="12.0.1" />
</ItemGroup>
```

**Project files:**

```xml
<!-- Project1.csproj (uses latest) -->
<PackageReference Include="Newtonsoft.Json" />

<!-- Project2.csproj (uses legacy) -->
<PackageReference Include="Newtonsoft.Json.Legacy" />
```

---

## 🛠️ **Common Commands**

### Build Commands

```bash
# Build entire solution
dotnet build

# Build specific project
dotnet build path/to/Project.csproj

# Restore packages for entire solution
dotnet restore

# Clean solution
dotnet clean
```

### Package Management

```bash
# List packages in solution
dotnet list package

# List outdated packages
dotnet list package --outdated

# Update packages (after editing Directory.Packages.props)
dotnet restore
```

---

## ⚠️ **Best Practices**

### ✅ **Do:**

- Keep all package versions in `Directory.Packages.props`
- Use semantic versioning
- Test after updating packages
- Document version overrides with comments

### ❌ **Don't:**

- Mix central and individual project versioning
- Use wildcard versions in production
- Override versions without good reason
- Forget to update `Directory.Packages.props` when adding packages

---

## 🔧 **Example Workflow**

Let's say you want to add Entity Framework to your solution:

```bash
# 1. Add version to central management
# Edit Directory.Packages.props:
```

```xml
<PackageVersion Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />
<PackageVersion Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />
```

```bash
# 2. Add to specific projects that need it
dotnet add api/MainApi.csproj package Microsoft.EntityFrameworkCore
dotnet add api/MainApi.csproj package Microsoft.EntityFrameworkCore.SqlServer

# 3. Restore and build
dotnet restore
dotnet build
```

This approach ensures version consistency while keeping project files clean! 🚀

---

## 📝 **Our Project Structure**

This is how our PDFVite solution is organized:

```text
PDFViteApp.sln                          # Solution file
Directory.Packages.props                # Central package versions
Directory.Build.props                   # Common build properties
├── api/
│   ├── MainApi.csproj                 # Main API project
│   ├── Generated/Keys.g.cs            # Auto-generated translation keys
│   └── Src/...                        # Source code
└── tools/
    └── TranslationKeyGenerator/        # Code generator tool
        ├── TranslationKeyGenerator.csproj
        └── Program.cs
```

### Key Features

- **Central Package Management**: All package versions managed in one place
- **Auto-generated Translation Keys**: Type-safe keys from JSON files
- **Pre-build Code Generation**: Keys regenerated on every build
- **Clean Project Files**: No version numbers in individual projects
