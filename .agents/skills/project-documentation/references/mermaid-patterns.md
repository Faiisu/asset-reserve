# Mermaid Flowchart Design Patterns

## Core Flow Diagram (User Operation Flow)

### Purpose
Show the complete flow from user starting the system to completing core tasks, including decision points and branch paths.

### Design Principles
1. **Top-Down**: From user startup to core function completion
2. **Decision Nodes**: Use diamonds for key decision points (e.g., "Is user authenticated?")
3. **State Nodes**: Use rounded rectangles for operation steps
4. **Color Coding**: Use different colors to distinguish different types of nodes

### Template

```mermaid
graph TB
    Start([User Starts System]) --> Init[Initialize Client]
    Init --> Auth{Authenticated?}
    Auth -->|No| Login[Login Flow]
    Auth -->|Yes| LoadSession[Load Session]
    Login --> SaveSession[Save Session]
    LoadSession --> Connect[Connect to Server]
    SaveSession --> Connect

    Connect --> Dashboard[Launch Dashboard]
    Dashboard --> UserAction{User Action}

    UserAction -->|Action A| ActionA[Execute Action A]
    UserAction -->|Action B| ActionB[Execute Action B]

    ActionA --> Process[Processing Flow]
    ActionB --> Process

    Process --> Result[Save Result]
    Result --> Notify[Notify User]

    Notify --> Dashboard

    style Start fill:#e1f5e1
    style Dashboard fill:#e3f2fd
    style Process fill:#fff3e0
    style Notify fill:#fce4ec
```

### Key Elements
- `([text])`: Circular start/end point
- `[text]`: Rectangular operation node
- `{text}`: Diamond decision node
- `-->|label|`: Labeled arrow
- `style nodeName fill:#color`: Node coloring

---

## Data Flow Diagram (System Interaction Sequence)

### Purpose
Show interaction sequence and data flow between system components, clearly presenting request-response patterns.

### Design Principles
1. **Participant Layering**: From user to frontend, backend, database, external services
2. **Sequence Numbering**: Add sequence numbers to each interaction step
3. **Sync/Async**: Use solid lines for synchronous, dashed lines for asynchronous
4. **Logical Grouping**: Group related interaction steps

### Template

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend API
    participant D as Database
    participant E as External Service

    U->>F: 1. Initiate Request
    F->>B: 2. API Call
    B->>D: 3. Query Data
    D-->>B: 4. Return Data
    B-->>F: 5. Return JSON
    F-->>U: 6. Display Result

    U->>F: 7. Trigger Action
    F->>B: 8. POST Request
    B->>D: 9. Create Task
    D-->>B: 10. Return Task ID
    B-->>F: 11. Return { taskId: 123 }
    F-->>U: 12. Show Progress

    B->>E: 13. Call External Service
    E-->>B: 14. Return Result
    B->>D: 15. Save Result
    B->>F: 16. Push Notification
    F-->>U: 17. Show Completion
```

### Key Elements
- `participant X as Name`: Define participant
- `->>`: Solid arrow (synchronous call)
- `-->>`: Dashed arrow (return/asynchronous)
- `Number. Description`: Add sequence number and description to each interaction

---

## Technical Architecture Diagram (System Layered Structure)

### Purpose
Show system tech stack and dependencies between layers, helping understand overall architecture.

### Design Principles
1. **Clear Layering**: Frontend layer, backend layer, data layer, external services layer
2. **Technology Labels**: Label specific tech stack in nodes
3. **Dependency Direction**: Arrows indicate dependency relationships
4. **Color Differentiation**: Different layers use different colors

### Template

```mermaid
graph LR
    subgraph "Frontend Layer"
        Web[React + Vite]
        UI[UI Component Library]
        State[State Management]
    end

    subgraph "Backend Layer"
        API[API Server<br/>Framework Name]
        Service1[Service 1<br/>Function Description]
        Service2[Service 2<br/>Function Description]
        Scheduler[Scheduled Tasks<br/>Tool Name]
    end

    subgraph "Data Layer"
        DB[(Database<br/>Type)]
        ORM[ORM Tool]
        Cache[(Cache<br/>Type)]
    end

    subgraph "External Services"
        External1[External Service 1]
        External2[External Service 2]
    end

    Web --> API
    UI --> Web
    State --> Web

    API --> Service1
    API --> Service2
    API --> Scheduler
    API --> ORM

    Service1 --> External1
    Service2 --> External2
    ORM --> DB
    API --> Cache

    style Web fill:#61dafb
    style API fill:#ff6b6b
    style DB fill:#4caf50
    style External1 fill:#0088cc
    style External2 fill:#ff9800
```

### Key Elements
- `subgraph "Name"`: Define grouping
- `[Text<br/>Newline]`: Line break within node
- `[(Text)]`: Cylinder shape (database)
- `-->`: Dependency arrow
- `style nodeName fill:#color`: Node coloring

---

## Best Practices

### 1. Node Naming
- Use concise descriptions
- Avoid overly long text (consider line breaks for text over 20 characters)
- Use `<br/>` for line breaks

### 2. Color Selection
- Start/Success: Green tones `#e1f5e1`
- User Interface: Blue tones `#e3f2fd`
- Processing/Computing: Orange tones `#fff3e0`
- Notification/Result: Pink tones `#fce4ec`
- Database: Dark green `#4caf50`
- External Services: Orange `#ff9800`

### 3. Complexity Control
- Single diagram should not exceed 20 nodes
- Consider splitting into multiple diagrams if exceeding 20 nodes
- Use subgraph to group related nodes

### 4. Readability Optimization
- Keep arrow direction consistent (top-down or left-right)
- Avoid crossing lines
- Use blank lines to separate logical blocks
