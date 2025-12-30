# PublyApp UI Strategy Plan

## Overview

This document outlines the complete UI strategy for the front2 application, covering both customer-facing and staff/admin interfaces.

**Design Philosophy:** Define the theme once, use MUI components directly. No per-component styling needed after theme setup.

**Design Inspiration:** Attio's clean, modern, minimal interface with strategic use of borders over shadows.

---

## Part 1: MUI Theming Strategy

### Core Principle

> "Define once, use everywhere. After theme setup, just import MUI components and they look like Attio."

This requires investing heavily upfront in:
1. **Design Tokens** - Colors, typography, spacing, shadows
2. **Component Overrides** - Default props and style overrides for every MUI component
3. **Custom Variants** - Additional variants like "soft" buttons
4. **Mixins** - Reusable style utilities

### Theme Folder Structure

Following the minimal-template's excellent organization:

```
app/theme/
├── core/
│   ├── components/              # MUI component overrides
│   │   ├── button.ts
│   │   ├── card.ts
│   │   ├── text-field.ts
│   │   ├── table.ts
│   │   ├── dialog.ts
│   │   ├── toggle.ts
│   │   ├── checkbox.ts
│   │   ├── tabs.ts
│   │   ├── menu.ts
│   │   ├── avatar.ts
│   │   ├── badge.ts
│   │   ├── chip.ts
│   │   ├── tooltip.ts
│   │   ├── alert.ts
│   │   ├── pagination.ts
│   │   ├── breadcrumbs.ts
│   │   └── index.ts             # Exports all components
│   ├── palette.ts               # Color definitions
│   ├── typography.ts            # Font configuration
│   ├── shadows.ts               # Shadow system
│   └── index.ts
├── mixins/
│   ├── index.ts
│   ├── scrollbar.ts             # Hide scrollbar utilities
│   ├── truncate.ts              # Text truncation
│   └── hover.ts                 # Hover state utilities
├── utils/
│   ├── var-alpha.ts             # Color channel opacity helper
│   └── responsive-font.ts       # Responsive typography helper
├── extend-theme-types.d.ts      # TypeScript augmentation
├── theme-provider.tsx           # React context provider
└── index.ts                     # Main theme creation
```

---

## Part 2: Attio Design Tokens

### Color Palette

```typescript
// app/theme/core/palette.ts

export const palette = {
  // Primary - Attio's signature blue
  primary: {
    lighter: '#EBF0FF',
    light: '#8DA4EF',
    main: '#3B5BDB',
    dark: '#2E4AC0',
    darker: '#1E3A8A',
    contrastText: '#FFFFFF',
  },

  // Secondary - Subtle gray for secondary actions
  secondary: {
    lighter: '#F9FAFB',
    light: '#E5E7EB',
    main: '#6B7280',
    dark: '#4B5563',
    darker: '#374151',
    contrastText: '#FFFFFF',
  },

  // Semantic colors
  success: {
    lighter: '#D1FAE5',
    light: '#6EE7B7',
    main: '#10B981',
    dark: '#059669',
    darker: '#047857',
    contrastText: '#FFFFFF',
  },

  warning: {
    lighter: '#FEF3C7',
    light: '#FCD34D',
    main: '#F97316',
    dark: '#EA580C',
    darker: '#C2410C',
    contrastText: '#FFFFFF',
  },

  error: {
    lighter: '#FEE2E2',
    light: '#FCA5A5',
    main: '#EF4444',
    dark: '#DC2626',
    darker: '#B91C1C',
    contrastText: '#FFFFFF',
  },

  // Neutrals - Attio's gray scale
  grey: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Backgrounds
  background: {
    default: '#FFFFFF',
    paper: '#FFFFFF',
    neutral: '#F3F4F6',  // Sidebar, alternate rows
  },

  // Text colors
  text: {
    primary: '#374151',    // Dark gray - main text
    secondary: '#6B7280',  // Medium gray - secondary text
    disabled: '#9CA3AF',   // Light gray - disabled/placeholder
  },

  // Dividers and borders
  divider: '#E5E7EB',

  // Action states
  action: {
    hover: '#F9FAFB',
    selected: '#F3F4F6',
    focus: 'rgba(59, 91, 219, 0.12)',
    disabled: '#9CA3AF',
    disabledBackground: '#F3F4F6',
  },

  // Accent colors for categorization (badges, tags)
  accents: {
    yellow: '#FBBF24',
    teal: '#14B8A6',
    purple: '#A855F7',
    pink: '#EC4899',
    orange: '#F97316',
  },
};
```

### Typography

```typescript
// app/theme/core/typography.ts

export const typography = {
  fontFamily: '"Inter Variable", "Public Sans Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

  // Font weights
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,

  // Headings
  h1: {
    fontSize: '2rem',      // 32px
    fontWeight: 700,
    lineHeight: 1.2,
  },
  h2: {
    fontSize: '1.5rem',    // 24px
    fontWeight: 700,
    lineHeight: 1.2,
  },
  h3: {
    fontSize: '1.125rem',  // 18px
    fontWeight: 600,
    lineHeight: 1.3,
  },
  h4: {
    fontSize: '1rem',      // 16px
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h5: {
    fontSize: '0.875rem',  // 14px
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h6: {
    fontSize: '0.8125rem', // 13px
    fontWeight: 600,
    lineHeight: 1.4,
  },

  // Body text
  body1: {
    fontSize: '1rem',      // 16px
    fontWeight: 400,
    lineHeight: 1.5,
  },
  body2: {
    fontSize: '0.875rem',  // 14px - DEFAULT body text
    fontWeight: 400,
    lineHeight: 1.5,
  },

  // Small text
  subtitle1: {
    fontSize: '0.875rem',  // 14px
    fontWeight: 500,
    lineHeight: 1.5,
  },
  subtitle2: {
    fontSize: '0.8125rem', // 13px
    fontWeight: 500,
    lineHeight: 1.5,
  },
  caption: {
    fontSize: '0.75rem',   // 12px
    fontWeight: 400,
    lineHeight: 1.5,
  },
  overline: {
    fontSize: '0.75rem',   // 12px
    fontWeight: 600,
    lineHeight: 1.5,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Buttons
  button: {
    fontSize: '0.875rem',  // 14px
    fontWeight: 600,
    lineHeight: 1.5,
    textTransform: 'none', // Attio doesn't use uppercase buttons
  },
};
```

### Shadows

Attio uses minimal shadows - primarily borders for separation:

```typescript
// app/theme/core/shadows.ts

// MUI expects 25 shadow levels (0-24)
// Attio uses almost no shadows, so most are subtle or none

export const shadows = [
  'none',
  '0 1px 2px 0 rgba(0, 0, 0, 0.05)',                                    // z1
  '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',  // z2
  '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)', // z3
  '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)', // z4
  // ... rest are the same as z4 (Attio doesn't use deep shadows)
  ...Array(20).fill('0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'),
];

// Custom shadows for specific components
export const customShadows = {
  card: 'none',  // Cards use borders, not shadows
  dropdown: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  dialog: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  tooltip: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};
```

### Shape & Spacing

```typescript
// In main theme config

export const shape = {
  borderRadius: 6,  // Base border radius (6px for Attio)
};

// Spacing is MUI default: 8px base unit
// theme.spacing(1) = 8px
// theme.spacing(2) = 16px
// etc.
```

---

## Part 3: Component Overrides

### Button

```typescript
// app/theme/core/components/button.ts

export const MuiButton = {
  defaultProps: {
    variant: 'contained',
    disableElevation: true,  // No shadow on buttons (Attio style)
  },
  styleOverrides: {
    root: {
      borderRadius: 6,
      padding: '10px 24px',
      minHeight: 40,
      fontWeight: 600,
      fontSize: '0.875rem',
      textTransform: 'none',
    },
    // Contained (primary)
    contained: {
      boxShadow: 'none',
      '&:hover': {
        boxShadow: 'none',
      },
    },
    // Outlined (secondary)
    outlined: {
      borderColor: '#E5E7EB',
      color: '#374151',
      '&:hover': {
        backgroundColor: '#F9FAFB',
        borderColor: '#D1D5DB',
      },
    },
    // Text button
    text: {
      color: '#374151',
      '&:hover': {
        backgroundColor: '#F3F4F6',
      },
    },
    // Size variants
    sizeSmall: {
      padding: '6px 16px',
      minHeight: 32,
      fontSize: '0.8125rem',
    },
    sizeLarge: {
      padding: '12px 32px',
      minHeight: 48,
      fontSize: '1rem',
    },
  },
};
```

### TextField / Input

```typescript
// app/theme/core/components/text-field.ts

export const MuiTextField = {
  defaultProps: {
    variant: 'outlined',
    size: 'medium',
  },
};

export const MuiOutlinedInput = {
  styleOverrides: {
    root: {
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: '#E5E7EB',
      },
      '&:hover .MuiOutlinedInput-notchedOutline': {
        borderColor: '#D1D5DB',
      },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
        borderColor: '#3B5BDB',
        borderWidth: 1,  // Keep 1px even on focus (Attio style)
      },
      '&.Mui-disabled': {
        backgroundColor: '#F3F4F6',
      },
    },
    input: {
      padding: '10px 12px',
      height: 'auto',
      '&::placeholder': {
        color: '#9CA3AF',
        opacity: 1,
      },
    },
  },
};

export const MuiInputLabel = {
  styleOverrides: {
    root: {
      fontSize: '0.875rem',
      color: '#6B7280',
      '&.Mui-focused': {
        color: '#3B5BDB',
      },
    },
  },
};
```

### Card

```typescript
// app/theme/core/components/card.ts

export const MuiCard = {
  defaultProps: {
    elevation: 0,  // No shadow (Attio uses borders)
  },
  styleOverrides: {
    root: {
      borderRadius: 8,
      border: '1px solid #E5E7EB',
      backgroundColor: '#FFFFFF',
    },
  },
};

export const MuiCardContent = {
  styleOverrides: {
    root: {
      padding: 20,
      '&:last-child': {
        paddingBottom: 20,
      },
    },
  },
};

export const MuiCardHeader = {
  styleOverrides: {
    root: {
      padding: 20,
    },
    title: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    subheader: {
      fontSize: '0.875rem',
      color: '#6B7280',
    },
  },
};
```

### Table

```typescript
// app/theme/core/components/table.ts

export const MuiTableContainer = {
  styleOverrides: {
    root: {
      borderRadius: 8,
      border: '1px solid #E5E7EB',
    },
  },
};

export const MuiTableHead = {
  styleOverrides: {
    root: {
      backgroundColor: '#F3F4F6',
    },
  },
};

export const MuiTableCell = {
  styleOverrides: {
    root: {
      padding: '12px 16px',
      borderBottom: '1px solid #E5E7EB',
      fontSize: '0.875rem',
    },
    head: {
      fontWeight: 600,
      color: '#374151',
      backgroundColor: '#F3F4F6',
    },
  },
};

export const MuiTableRow = {
  styleOverrides: {
    root: {
      '&:hover': {
        backgroundColor: '#F9FAFB',
      },
      '&:last-child td': {
        borderBottom: 0,
      },
    },
  },
};
```

### Dialog / Modal

```typescript
// app/theme/core/components/dialog.ts

export const MuiDialog = {
  styleOverrides: {
    paper: {
      borderRadius: 12,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    },
  },
};

export const MuiDialogTitle = {
  styleOverrides: {
    root: {
      padding: '24px 24px 16px',
      fontSize: '1.125rem',
      fontWeight: 600,
    },
  },
};

export const MuiDialogContent = {
  styleOverrides: {
    root: {
      padding: '0 24px 24px',
    },
  },
};

export const MuiDialogActions = {
  styleOverrides: {
    root: {
      padding: '16px 24px 24px',
      gap: 12,
    },
  },
};
```

### Switch / Toggle

```typescript
// app/theme/core/components/switch.ts

export const MuiSwitch = {
  styleOverrides: {
    root: {
      width: 48,
      height: 24,
      padding: 0,
    },
    switchBase: {
      padding: 2,
      '&.Mui-checked': {
        transform: 'translateX(24px)',
        '& + .MuiSwitch-track': {
          backgroundColor: '#3B5BDB',
          opacity: 1,
        },
      },
    },
    thumb: {
      width: 20,
      height: 20,
      backgroundColor: '#FFFFFF',
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.1)',
    },
    track: {
      borderRadius: 20,
      backgroundColor: '#D1D5DB',
      opacity: 1,
    },
  },
};
```

### Checkbox

```typescript
// app/theme/core/components/checkbox.ts

export const MuiCheckbox = {
  styleOverrides: {
    root: {
      color: '#D1D5DB',
      '&.Mui-checked': {
        color: '#3B5BDB',
      },
    },
  },
};
```

### Chip / Badge

```typescript
// app/theme/core/components/chip.ts

export const MuiChip = {
  styleOverrides: {
    root: {
      borderRadius: 6,
      fontWeight: 500,
      fontSize: '0.75rem',
    },
    filled: {
      backgroundColor: '#F3F4F6',
      color: '#374151',
    },
    outlined: {
      borderColor: '#E5E7EB',
    },
  },
};
```

### Tooltip

```typescript
// app/theme/core/components/tooltip.ts

export const MuiTooltip = {
  styleOverrides: {
    tooltip: {
      backgroundColor: '#374151',
      color: '#FFFFFF',
      fontSize: '0.75rem',
      padding: '6px 8px',
      borderRadius: 4,
    },
    arrow: {
      color: '#374151',
    },
  },
};
```

### Menu / Dropdown

```typescript
// app/theme/core/components/menu.ts

export const MuiMenu = {
  styleOverrides: {
    paper: {
      borderRadius: 8,
      border: '1px solid #E5E7EB',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    },
  },
};

export const MuiMenuItem = {
  styleOverrides: {
    root: {
      padding: '8px 12px',
      fontSize: '0.875rem',
      '&:hover': {
        backgroundColor: '#F3F4F6',
      },
      '&.Mui-selected': {
        backgroundColor: '#F3F4F6',
        '&:hover': {
          backgroundColor: '#E5E7EB',
        },
      },
    },
  },
};
```

### Tabs

```typescript
// app/theme/core/components/tabs.ts

export const MuiTabs = {
  styleOverrides: {
    root: {
      minHeight: 44,
    },
    indicator: {
      height: 2,
      backgroundColor: '#3B5BDB',
    },
  },
};

export const MuiTab = {
  styleOverrides: {
    root: {
      textTransform: 'none',
      fontWeight: 400,
      fontSize: '0.875rem',
      minHeight: 44,
      padding: '12px 16px',
      color: '#6B7280',
      '&.Mui-selected': {
        fontWeight: 600,
        color: '#374151',
      },
    },
  },
};
```

---

## Part 4: React Hook Form Integration

Following minimal-template's Field namespace pattern:

```
app/components/hook-form/
├── form-provider.tsx       # Form wrapper with RHF context
├── rhf-text-field.tsx      # Text input
├── rhf-select.tsx          # Select dropdown
├── rhf-checkbox.tsx        # Checkbox
├── rhf-switch.tsx          # Toggle switch
├── rhf-date-picker.tsx     # Date picker
├── rhf-autocomplete.tsx    # Autocomplete
└── fields.tsx              # Exports all as Field namespace
```

Usage pattern:
```tsx
import { Form, Field } from '@/front2/components/hook-form';

<Form methods={methods} onSubmit={onSubmit}>
  <Field.Text name="email" label="Email" />
  <Field.Select name="status" label="Status" options={statusOptions} />
  <Field.Switch name="active" label="Active" />
</Form>
```

---

## Part 5: Screen Inventory

### Customer Side

| Screen | Route | Purpose |
|--------|-------|---------|
| Schedule | `/schedule` | Calendar view with scheduled posts |
| Posts | `/posts` | Posts list view |
| Settings | `/settings` | User account settings |

### Staff Side

| Screen | Route | Purpose |
|--------|-------|---------|
| Dashboard | `/staff` | Overview, quick stats |
| Tenants List | `/staff/tenants` | Table of all customer tenants |
| New Tenant | `/staff/tenants/new` | Create tenant form |
| Tenant Details | `/staff/tenants/:id/*` | Edit tenant (tabbed: general, users, profiles) |
| Staff Members List | `/staff/members` | Table of staff users |
| New Staff Member | `/staff/members/new` | Create staff account |
| Staff Member Details | `/staff/members/:id` | Edit staff member |
| Profiles List | `/staff/profiles` | Table of staff roles |
| New Profile | `/staff/profiles/new` | Create new role |
| Profile Details | `/staff/profiles/:id/*` | Edit role (tabbed: basics, users) |
| Invitations List | `/staff/invitations` | Pending/sent invitations |
| New Invitation | `/staff/invitations/new` | Invite new staff member |
| Settings | `/staff/settings` | Platform-wide settings |

---

## Part 6: Build Order

### Phase 0: Theme Foundation (CRITICAL - Do This First)
1. Set up theme folder structure
2. Define palette.ts with all colors
3. Define typography.ts
4. Define shadows.ts
5. Create component overrides for core components:
   - Button, TextField, Card, Table, Dialog, Switch, Checkbox, Chip, Tooltip, Menu, Tabs
6. Create theme-provider.tsx
7. Test with sample components to verify all styles match Attio

### Phase 1: Layout Shell
1. Create dashboard-layout.tsx (customer)
2. Create staff-layout.tsx (staff admin)
3. Sidebar component with navigation
4. Page header component

### Phase 2: Reusable Components
1. Data table component (for staff lists)
2. Form components with React Hook Form (Field namespace)
3. Empty states
4. Loading skeletons

### Phase 3: Staff Screens
1. Staff dashboard
2. Tenants CRUD
3. Staff members CRUD
4. Profiles CRUD
5. Invitations CRUD
6. Settings

### Phase 4: Customer Screens
1. Calendar view
2. Post card component
3. Post create/edit modal
4. Schedule page

---

## Part 7: Key Principles

### 1. No Per-Component Styling
After Phase 0 is complete, developers should be able to write:
```tsx
<Card>
  <CardContent>
    <Typography variant="h4">Title</Typography>
    <Typography color="text.secondary">Description</Typography>
    <Button>Action</Button>
  </CardContent>
</Card>
```
And it automatically looks like Attio. No `sx` props needed for basic usage.

### 2. Borders Over Shadows
Attio uses 1px borders (`#E5E7EB`) as the primary visual separator. Shadows are minimal.

### 3. Consistent Spacing
- 8px base unit
- Card padding: 20px
- Form field gap: 16px
- Section gap: 24px

### 4. Typography Hierarchy
- Page titles: h1 (32px, bold)
- Section headings: h3 (18px, semibold)
- Card titles: h4 (16px, semibold)
- Body text: body2 (14px, regular)
- Secondary text: body2 + color="text.secondary"
- Captions: caption (12px)

### 5. Color Usage
- Primary blue (#3B5BDB): CTAs, links, active states
- Grays: Text hierarchy, borders, backgrounds
- Semantic colors: Only for status (success, warning, error)
- Accent colors: Badges, tags, categorization
