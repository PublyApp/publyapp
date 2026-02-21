# Frontend Coding Standards

> Extracted from `AGENTS.md` — complete frontend coding standards for the PublyApp React frontend.

## UI Component Library: Material-UI

**CRITICAL:** This project uses Material-UI (MUI) v6 as the primary UI library. Never use native HTML elements for structure, nor components from other UI libraries (shadcn/ui, Chakra, etc.).

**Component imports:**
```tsx
// ✅ CORRECT - Import MUI components
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import Dialog from '@mui/material/Dialog';

// ❌ WRONG - Never use native HTML or other libraries
<div className="container">  // Use <Box> instead
<h1>Title</h1>               // Use <Typography variant="h1">
<button>Click</button>       // Use <Button>
import { Card } from '~/components/ui/card';  // Wrong library!
```

**Common replacements:**
- `<div>` → `<Box>`
- `<h1>` through `<h6>` → `<Typography variant="h1">` through `<Typography variant="h6">`
- `<p>` → `<Typography>`
- `<button>` → `<Button>`
- `<input>` → `<TextField>`
- `<select>` → `<Select>` with `<MenuItem>`
- `<table>` → `<Table>` with `<TableHead>`, `<TableBody>`, `<TableRow>`, `<TableCell>`

**Reference:** See `.dump/main-template/src/sections/**/*.tsx` for real-world examples.

## Styling: sx Prop and Theme System

**CRITICAL:** This project uses MUI's `sx` prop for styling. Never use Tailwind CSS, CSS modules with className, or inline style strings.

**Styling pattern:**
```tsx
// ❌ WRONG - Using Tailwind classes
<div className="flex items-center justify-between p-4 bg-gray-100">
  <h1 className="text-3xl font-bold">Title</h1>
</div>

// ✅ CORRECT - Using sx prop
<Box sx={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  p: 4,                    // padding: theme.spacing(4)
  bgcolor: 'grey.100'      // theme.palette.grey[100]
}}>
  <Typography variant="h1" sx={{ fontSize: '3rem', fontWeight: 'bold' }}>
    Title
  </Typography>
</Box>
```

**Tailwind to sx prop quick reference:**
- `className="flex"` → `sx={{ display: 'flex' }}`
- `className="p-4"` → `sx={{ p: 4 }}`
- `className="mx-auto"` → `sx={{ mx: 'auto' }}`
- `className="text-center"` → `sx={{ textAlign: 'center' }}`
- `className="bg-blue-500"` → `sx={{ bgcolor: 'primary.main' }}`
- `className="hover:bg-blue-700"` → `sx={{ '&:hover': { bgcolor: 'primary.dark' } }}`

**Responsive styling:**
```tsx
<Box sx={{
  p: { xs: 2, md: 4, lg: 8 },  // Responsive padding
  fontSize: { xs: '1rem', md: '1.25rem' }
}}>
```

## Date Handling: Day.js + Format Utilities

**CRITICAL:** This project uses Day.js for all date operations. Never use date-fns, Moment.js, or native Date methods for formatting.

**CRITICAL:** Always use the centralized date formatting utilities from `apps/front/app/utils/format-time.ts` instead of importing dayjs directly in components. These utilities already configure dayjs plugins (relativeTime, duration) and provide consistent formatting across the app.

**Pattern:**
```tsx
// ❌ WRONG - Importing dayjs directly and extending plugins in components
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
const timeAgo = dayjs(date).fromNow();

// ❌ WRONG - Using date-fns
import { formatDistanceToNow } from 'date-fns';
const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });

// ✅ CORRECT - Using format-time utilities
import { fDateTime, fDate, fTime, fToNow, fTimestamp } from '@/front/utils/format-time';
const timeAgo = fToNow(date);              // "2 hours ago"
const formatted = fDate(date);             // "17 Apr 2022"
const dateTime = fDateTime(date);          // "17 Apr 2022 12:00 am"
```

**Available utilities from `apps/front/app/utils/format-time.ts`:**
```tsx
// Basic formatting
fDateTime(date)                    // "17 Apr 2022 12:00 am"
fDate(date)                        // "17 Apr 2022"
fTime(date)                        // "12:00 am"
fTimestamp(date)                   // 1713250100 (Unix timestamp)

// Relative time
fToNow(date)                       // "2 hours" (time from now)

// Comparisons
fIsBetween(date, start, end)       // Boolean
fIsAfter(start, end)               // Boolean
fIsSame(start, end, unit?)         // Boolean

// Date ranges
fDateRangeShortLabel(start, end)   // "25 - 26 Apr 2024" (smart range formatting)

// Helpers
today(template?)                   // Today's date formatted
fAdd({ days: 7 })                  // Add duration to today
fSub({ months: 1 })                // Subtract duration from today

// Custom formatting (when needed)
fDate(date, 'DD/MM/YYYY')          // "17/04/2022" (custom template)
fDateTime(date, 'YYYY-MM-DD')      // "2022-04-17" (custom template)
```

**Format patterns available:**
```tsx
import { formatPatterns } from '@/front/utils/format-time';

formatPatterns.dateTime            // 'DD MMM YYYY h:mm a'
formatPatterns.date                // 'DD MMM YYYY'
formatPatterns.time                // 'h:mm a'
formatPatterns.split.dateTime      // 'DD/MM/YYYY h:mm a'
formatPatterns.split.date          // 'DD/MM/YYYY'
formatPatterns.paramCase.dateTime  // 'DD-MM-YYYY h:mm a'
formatPatterns.paramCase.date      // 'DD-MM-YYYY'
```

**When direct dayjs is acceptable:**
- Complex date manipulation not covered by utilities (rare)
- MUI DatePicker/TimePicker integration (uses dayjs adapter)
- Custom hooks that need full dayjs API

**Never do this in components:**
```tsx
// ❌ WRONG - Extending dayjs plugins in component files
dayjs.extend(relativeTime);
dayjs.extend(duration);
```

**Reference:** The `format-time.ts` utilities already configure all necessary dayjs plugins. If you need additional plugins, add them to `format-time.ts`, not to individual components.

## Array Methods: Avoid reduce()

**CRITICAL:** Do not use `Array.prototype.reduce()` or `Array.prototype.reduceRight()`. These methods produce hard-to-read code and can almost always be replaced with clearer alternatives.

**Why avoid reduce:**
- Hard to read and understand at a glance
- Often misused for operations better suited to other methods
- Makes code reviews more difficult
- Usually indicates a need for a simpler approach

**Alternatives:**
```tsx
// ❌ WRONG - Using reduce to find an item
const result = items.reduce((acc, item) => {
  if (!acc && item.id === targetId) return item;
  return acc;
}, null);

// ✅ CORRECT - Use find
const result = items.find((item) => item.id === targetId);

// ❌ WRONG - Using reduce to filter and map
const result = items.reduce((acc, item) => {
  if (item.isActive) acc.push(item.name);
  return acc;
}, []);

// ✅ CORRECT - Use filter + map
const result = items.filter((item) => item.isActive).map((item) => item.name);

// ❌ WRONG - Using reduce to sum values
const total = items.reduce((sum, item) => sum + item.price, 0);

// ✅ CORRECT - Use a for...of loop for clarity
let total = 0;
for (const item of items) {
  total += item.price;
}

// ❌ WRONG - Using reduce to group items
const grouped = items.reduce((acc, item) => {
  const key = item.category;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

// ✅ CORRECT - Use Object.groupBy (ES2024) or a for...of loop
const grouped = Object.groupBy(items, (item) => item.category);
// OR
const grouped: Record<string, Item[]> = {};
for (const item of items) {
  (grouped[item.category] ??= []).push(item);
}
```

**Note:** Biome does not yet have a `noArrayReduce` rule (like ESLint's `unicorn/no-array-reduce`). This is a manual code review guideline until Biome adds support.

## Function Definitions: Arrow Functions

**CRITICAL:** Always prefer arrow function expressions over traditional function declarations/expressions in TypeScript and JavaScript. Only use `function` keyword when absolutely necessary (e.g., when you need to access `this` as the first parameter, or for generator functions).

**Pattern:**
```tsx
// ❌ WRONG - Using function expression/declaration
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function processData(data: Data) {
  // ...
}

// ✅ CORRECT - Using arrow functions
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

const processData = (data: Data) => {
  // ...
};
```

**Why arrow functions:**
- Consistent with modern JavaScript/TypeScript conventions
- Lexical `this` binding prevents common bugs
- More concise syntax
- Easier to read in code reviews

**Exceptions (use `function` keyword):**
- Generator functions: `function* generateSequence() { ... }`
- When you explicitly need dynamic `this` binding (rare in modern React)
- React component lifecycle methods in class components (though we prefer functional components)

**Examples:**
```tsx
// ✅ Helper functions
const clearSessionAndGetLoginUrl = (): string => {
  clearSessionCookie();
  return redirectUrl;
};

// ✅ Event handlers
const handleSubmit = async (data: FormData) => {
  await mutation.mutateAsync(data);
};

// ✅ React components
const UserProfile = ({ userId }: Props) => {
  return <div>{/* ... */}</div>;
};

// ❌ EXCEPTION - Generator function (must use function keyword)
function* idGenerator() {
  let id = 0;
  while (true) yield id++;
}
```

## React Components: Arrow Function Components Only

**CRITICAL:** All React components in this codebase MUST be defined as arrow function components. Never use function declarations or class components.

**Pattern:**
```tsx
// ❌ WRONG - Function declaration component
function UserProfile({ userId }: UserProfileProps) {
  return <div>User: {userId}</div>;
}

// ❌ WRONG - Class component
class UserProfile extends React.Component<UserProfileProps> {
  render() {
    return <div>User: {this.props.userId}</div>;
  }
}

// ✅ CORRECT - Arrow function component
const UserProfile = ({ userId }: UserProfileProps) => {
  return <div>User: {userId}</div>;
};

// ✅ CORRECT - Arrow function component with explicit return type
const UserProfile: React.FC<UserProfileProps> = ({ userId }) => {
  return <div>User: {userId}</div>;
};
```

**Why arrow function components:**
- Consistent with modern React best practices and hooks-based development
- Lexical `this` binding (no need for `.bind()` or arrow functions in class methods)
- More concise and readable
- Easier to refactor and test
- Works seamlessly with React Hooks
- Consistent with the rest of the codebase's function style

**Component structure:**
```tsx
// ✅ CORRECT - Full component example
type UserCardProps = {
  userId: string;
  onEdit: (id: string) => void;
};

const UserCard = ({ userId, onEdit }: UserCardProps) => {
  const { data, isLoading } = useGetUser({ userId });

  const handleEdit = () => {
    onEdit(userId);
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Card>
      <CardContent>
        <Typography>{data?.name}</Typography>
        <Button onClick={handleEdit}>Edit</Button>
      </CardContent>
    </Card>
  );
};

export default UserCard;
```

**Never use:**
- `function ComponentName() { ... }` syntax for components
- Class components (`extends React.Component`)
- `React.createClass()` (legacy API)

## Form Handling

**CRITICAL:** Always use the custom hook-form component library from `@/front/components/hook-form` for all form fields. Never use raw MUI `TextField` with `register()` or manual `error`/`helperText` wiring. The custom components (`Field.Text`, `Field.NumberInput`, `Field.Select`, etc.) use `Controller` internally and handle error display automatically.

**Use React Hook Form with Zod validation and the `Form`/`Field` wrappers:**
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, Form } from '@/front/components/hook-form';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

const methods = useForm<FormData>({
  resolver: zodResolver(schema),
});

// ❌ WRONG - Raw MUI TextField with register()
<Box component="form" onSubmit={handleSubmit}>
  <TextField
    {...form.register('email')}
    error={!!form.formState.errors.email}
    helperText={form.formState.errors.email?.message}
  />
</Box>

// ✅ CORRECT - Custom Form + Field wrappers
<Form methods={methods} onSubmit={handleSubmit}>
  <Field.Text name="email" label="Email" />
  <Field.Text name="password" type="password" label="Password" />
</Form>
```

**Convention:** Name the `useForm` return value `methods` (not `form`) for consistency across the codebase.

**Available `Field` components** (see `@/front/components/hook-form/fields.tsx`):
- `Field.Text` — text input (supports `type="number"`, `type="password"`, etc.)
- `Field.NumberInput` — dedicated number input with increment/decrement
- `Field.Select` — dropdown select
- `Field.Checkbox` — checkbox
- `Field.Switch` — toggle switch
- `Field.Autocomplete` — autocomplete/combobox
- `Field.DatePicker` — date picker
- `Field.Editor` — rich text editor

**Note:** Read-only display fields (not managed by the form) may still use raw `TextField` with `slotProps={{ input: { readOnly: true } }}` since they are not form-controlled.

## Query State Display: QueryDisplay Component

**CRITICAL:** Always prefer the `QueryDisplay` component over manual conditional rendering for TanStack Query states.

**Why use QueryDisplay:**
- Consistent loading/error/empty state handling across the app
- Reduces boilerplate code
- Prevents common mistakes (forgetting to check `isError`, etc.)
- Centralized UX patterns for query states

**Pattern:**
```tsx
// ❌ WRONG - Manual conditional rendering
import { useFindStaffUsers } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const { data, isLoading, isError, error } = useFindStaffUsers();

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return <div>{/* render data */}</div>;
}

// ✅ CORRECT - Using QueryDisplay component
import QueryDisplay from '@/front/components/query-display';
import { useFindStaffUsers } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const query = useFindStaffUsers();

  return (
    <QueryDisplay
      query={query}
      LoadingSlot={() => (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      ErrorSlot={({ error }) => (
        <Typography color="error">
          Failed to load members: {error.message}
        </Typography>
      )}
      EmptySlot={() => (
        <Typography>No members found</Typography>
      )}
    >
      {({ data }) => (
        <div>{/* render data */}</div>
      )}
    </QueryDisplay>
  );
}
```

**QueryDisplay Props:**
- `query`: The TanStack Query result object (required)
- `loadingStrategy`: `'loading' | 'pending' | 'fetching'` (defaults to `'pending'`)
- `LoadingSlot`: Custom loading component (ReactNode or FC)
- `ErrorSlot`: Custom error component (ReactNode or FC<{ error: unknown }>)
- `EmptySlot`: Custom empty state component (ReactNode or FC)
- `children`: Render function with data or ReactNode

**Loading Strategies:**
- `'pending'` (default): Shows loading on initial fetch only
- `'loading'`: Shows loading when no cached data exists
- `'fetching'`: Shows loading on every fetch (including refetches)

**Example with all slots:**
```tsx
<QueryDisplay
  query={permissionsQuery}
  loadingStrategy="pending"
  LoadingSlot={() => (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  )}
  ErrorSlot={({ error }) => (
    <Alert severity="error">
      Failed to load permissions: {error.message}
    </Alert>
  )}
  EmptySlot={() => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Typography variant="body2" color="text.secondary">
        No permissions available
      </Typography>
    </Box>
  )}
>
  {({ data }) => (
    <List>
      {data.map(item => (
        <ListItem key={item.id}>{item.name}</ListItem>
      ))}
    </List>
  )}
</QueryDisplay>
```

**When to use QueryDisplay:**
- Any component that displays TanStack Query data
- List pages with loading/error/empty states
- Detail pages that fetch single resources
- Forms that load initial data from API

**When NOT to use QueryDisplay:**
- Mutations (use mutation states directly)
- When you need very custom loading logic
- Background refetches where you want to show stale data

## Component Structure Best Practices

1. **Import order:**
   - React imports
   - Third-party libraries
   - MUI components
   - Project imports (utils, hooks, types)
   - Local components

2. **Component file structure:**
   - Type definitions
   - Component function
   - Styled components (if using `styled()`)
   - Helper functions

3. **Never create wrapper components for MUI:**
   - Use MUI components directly
   - Use `sx` prop for styling variations
   - Check `.dump/main-template` for patterns

4. **Look at the premium template first:**
   - Before implementing UI, check `.dump/main-template/src/sections/` for similar patterns
   - Follow the same MUI component usage patterns
   - Reuse styling approaches
