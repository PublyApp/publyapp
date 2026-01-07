# Flow Diagrams

## Cursor Mode Pagination Flow

```mermaid
graph TD
    A[User Action] --> B{Action Type?}
    
    B -->|Next Page| C[handlePaginationChange called]
    B -->|Sort Change| D[handleSortingChange called]
    B -->|Page Size Change| E[handlePaginationChange with new size]
    
    C --> F{Sequential Forward?}
    F -->|Yes pageIndex = prev + 1| G[Keep current cursor]
    F -->|No backward/jump| H[resetCursor]
    
    D --> I[resetCursor]
    E --> J[resetCursor]
    
    H --> K[Set cursor = null]
    I --> K
    J --> K
    
    K --> L[Set hasMorePages = true]
    K --> M[Reset pageIndex = 0]
    
    G --> N[API Call with cursor]
    L --> O[API Call without cursor]
    
    N --> P[API Response]
    O --> P
    
    P --> Q{Has nextCursor?}
    Q -->|Yes| R[setNextCursor with value]
    Q -->|No| S[setNextCursor with null]
    
    R --> T[Update cursor in state]
    R --> U[Set hasMorePages = true]
    
    S --> V[Clear cursor in state]
    S --> W[Set hasMorePages = false]
    
    T --> X[Update UI]
    U --> X
    V --> X
    W --> X
```

## Page Mode vs Cursor Mode State Management

```mermaid
graph LR
    subgraph "Page Mode"
        A1[User Action] --> B1[Update page number]
        B1 --> C1[Update URL: ?page=X]
        C1 --> D1[API Call with page]
        D1 --> E1[Render data]
    end
    
    subgraph "Cursor Mode"
        A2[User Action] --> B2{Reset needed?}
        B2 -->|Yes| C2[Clear cursor]
        B2 -->|No| D2[Keep cursor]
        C2 --> E2[API Call without cursor]
        D2 --> F2[API Call with cursor]
        E2 --> G2[API returns nextCursor]
        F2 --> G2
        G2 --> H2[Update cursor in state]
        H2 --> I2[Update hasMorePages]
        I2 --> J2[Render data]
    end
```

## Hook Return Type Decision Tree

```mermaid
graph TD
    A[useTableState called] --> B{paginationMode?}
    
    B -->|'page' or undefined| C[UseTableStateReturnPage]
    B -->|'cursor'| D[UseTableStateReturnCursor]
    
    C --> E[Return Object with:]
    E --> E1[apiVariables: page, limit, sort]
    E --> E2[tableState]
    E --> E3[handlers]
    E --> E4[NO cursor methods]
    
    D --> F[Return Object with:]
    F --> F1[apiVariables: cursor, limit, sort]
    F --> F2[tableState]
    F --> F3[handlers]
    F --> F4[setNextCursor method]
    F --> F5[resetCursor method]
    F --> F6[hasMorePages boolean]
```

## Cleanup Effect Logic

```mermaid
graph TD
    A[Effect Triggered] --> B[Get current pagination state]
    
    B --> C{paginationMode?}
    
    C -->|cursor| D{Has 'page' param?}
    C -->|page| E{Has 'cursor' param?}
    
    D -->|Yes| F[Delete 'page' param]
    D -->|No| G[Return prev state unchanged]
    
    E -->|Yes| H[Delete 'cursor' param]
    E -->|No| G
    
    F --> I[Update state]
    H --> I
    
    I --> J[URL updated]
    G --> K[No re-render]
```

## API Response Handling

```mermaid
sequenceDiagram
    participant Component
    participant Hook
    participant API
    participant State
    
    Note over Component,State: Cursor Mode Flow
    
    Component->>Hook: Load page 2
    Hook->>API: GET /items?cursor=abc&limit=20
    API->>Hook: { items: [...], nextCursor: "def" }
    
    Component->>Hook: useEffect with data.nextCursor
    Hook->>State: setNextCursor("def")
    State->>State: cursor = "def"
    State->>State: hasMorePages = true
    Hook->>Component: Updated state
    
    Component->>Hook: Load page 3
    Hook->>API: GET /items?cursor=def&limit=20
    API->>Hook: { items: [...], nextCursor: null }
    
    Component->>Hook: useEffect with data.nextCursor
    Hook->>State: setNextCursor(null)
    State->>State: cursor = null
    State->>State: hasMorePages = false
    Hook->>Component: Updated state (last page)
```

## Cursor Reset Scenarios

```mermaid
graph TD
    A[Cursor Reset Triggered By] --> B[Sorting Change]
    A --> C[Page Size Change]
    A --> D[Backward Navigation]
    A --> E[Page Jump]
    A --> F[Manual Reset]
    
    B --> G[resetCursor called]
    C --> G
    D --> G
    E --> G
    F --> G
    
    G --> H[cursor = null]
    G --> I[pageIndex = 0]
    G --> J[hasMorePages = true]
    
    H --> K[URL updated: ?size=20]
    I --> L[Table shows page 1]
    J --> M[Next button enabled]
```

## Type Safety Flow

```mermaid
graph TD
    A[Developer writes code] --> B{Specifies paginationMode?}
    
    B -->|'cursor'| C[TypeScript infers UseTableStateReturnCursor]
    B -->|'page' or omitted| D[TypeScript infers UseTableStateReturnPage]
    
    C --> E[Provides:]
    E --> E1[setNextCursor - REQUIRED]
    E --> E2[resetCursor - REQUIRED]
    E --> E3[hasMorePages - REQUIRED]
    E --> E4[apiVariables.cursor - REQUIRED]
    E --> E5[NO apiVariables.page]
    
    D --> F[Provides:]
    F --> F1[apiVariables.page - REQUIRED]
    F --> F2[NO cursor methods]
    F --> F3[NO hasMorePages]
    
    E1 --> G[IntelliSense shows cursor methods]
    E2 --> G
    E3 --> G
    
    F1 --> H[IntelliSense hides cursor methods]
    F2 --> H
```

## Component Integration Pattern

```mermaid
sequenceDiagram
    participant User
    participant MRT as MaterialReactTable
    participant Hook as useTableState
    participant Query as React Query
    participant API
    
    Note over User,API: Initial Load (Cursor Mode)
    
    User->>MRT: Page loads
    MRT->>Hook: Get initial state
    Hook->>Query: Trigger query with cursor=null
    Query->>API: GET /items?cursor=null&limit=20
    API->>Query: { items: [...], nextCursor: "abc" }
    Query->>Hook: useEffect(data.nextCursor)
    Hook->>Hook: setNextCursor("abc")
    Hook->>MRT: Updated state
    MRT->>User: Show data + pagination
    
    Note over User,API: User clicks Next
    
    User->>MRT: Click next page
    MRT->>Hook: handlePaginationChange(pageIndex: 1)
    Hook->>Hook: Keep cursor "abc" (sequential forward)
    Hook->>Query: Trigger query with cursor="abc"
    Query->>API: GET /items?cursor=abc&limit=20
    API->>Query: { items: [...], nextCursor: "def" }
    Query->>Hook: useEffect(data.nextCursor)
    Hook->>Hook: setNextCursor("def")
    Hook->>MRT: Updated state
    MRT->>User: Show page 2 data
```

## URL State Management

```mermaid
graph LR
    subgraph "Page Mode URL"
        A1[?page=1] --> B1[?page=2]
        B1 --> C1[?page=3]
        A1 -.size change.-> D1[?page=1&size=50]
        B1 -.sort change.-> E1[?page=1&sort_id=name]
    end
    
    subgraph "Cursor Mode URL"
        A2[?size=20] --> B2[?size=20&cursor=abc]
        B2 --> C2[?size=20&cursor=def]
        A2 -.size change.-> D2[?size=50]
        B2 -.sort change.-> E2[?size=20&sort_id=name]
    end
    
    style A1 fill:#e1f5ff
    style A2 fill:#fff3e0
    style B1 fill:#e1f5ff
    style B2 fill:#fff3e0
```

## Testing Coverage Map

```mermaid
graph TD
    A[Test Suite] --> B[Page Mode Tests]
    A --> C[Cursor Mode Tests]
    A --> D[Common Tests]
    
    B --> B1[Initialization]
    B --> B2[Pagination Changes]
    B --> B3[Sorting Changes]
    B --> B4[Query Params]
    
    C --> C1[Initialization]
    C --> C2[Cursor Management]
    C --> C3[Reset Triggers]
    C --> C4[hasMorePages]
    C --> C5[Sequential Navigation]
    C --> C6[Query Params]
    
    D --> D1[Mode Switching]
    D --> D2[Custom Keys]
    D --> D3[Edge Cases]
    D --> D4[Type Safety]
    D --> D5[Dev Warnings]
```
