# Complete Documentation Example

This example demonstrates how to create comprehensive project documentation using the three core Mermaid diagram types.

## Example Project: Task Management API

A RESTful API service for managing tasks with user authentication, real-time notifications, and external calendar integration.

---

## 1. Core Flow Diagram - User Operation Flow

Shows how users interact with the system from login to task completion.

```mermaid
graph TB
    Start([User Opens App]) --> CheckAuth{Authenticated?}
    CheckAuth -->|No| Login[Login with Credentials]
    CheckAuth -->|Yes| LoadDashboard[Load Dashboard]

    Login --> ValidateAuth{Valid?}
    ValidateAuth -->|No| ShowError[Show Error Message]
    ValidateAuth -->|Yes| SaveToken[Save Auth Token]
    ShowError --> Login
    SaveToken --> LoadDashboard

    LoadDashboard --> ShowTasks[Display Task List]
    ShowTasks --> UserChoice{User Action}

    UserChoice -->|Create Task| CreateForm[Fill Task Form]
    UserChoice -->|Edit Task| EditForm[Modify Task Details]
    UserChoice -->|Delete Task| ConfirmDelete{Confirm?}
    UserChoice -->|View Details| ShowDetails[Display Task Details]

    CreateForm --> SubmitCreate[Submit to API]
    EditForm --> SubmitUpdate[Update via API]
    ConfirmDelete -->|Yes| DeleteTask[Delete via API]
    ConfirmDelete -->|No| ShowTasks

    SubmitCreate --> ProcessTask[Process Request]
    SubmitUpdate --> ProcessTask
    DeleteTask --> ProcessTask

    ProcessTask --> SyncCalendar[Sync with Calendar]
    SyncCalendar --> NotifyUser[Send Notification]
    NotifyUser --> RefreshList[Refresh Task List]
    RefreshList --> ShowTasks

    ShowDetails --> UserChoice

    style Start fill:#e1f5e1
    style LoadDashboard fill:#e3f2fd
    style ProcessTask fill:#fff3e0
    style NotifyUser fill:#fce4ec
```

**Key Features Shown:**
- Authentication flow with error handling
- Multiple user actions (CRUD operations)
- External service integration (calendar sync)
- Notification system
- Circular flow back to dashboard

---

## 2. Data Flow Diagram - System Interaction Sequence

Shows the complete request-response cycle between system components.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend App
    participant A as API Gateway
    participant S as Task Service
    participant D as PostgreSQL
    participant C as Calendar API
    participant N as Notification Service

    U->>F: 1. Click "Create Task"
    F->>F: 2. Validate Form Input
    F->>A: 3. POST /api/tasks
    A->>A: 4. Verify JWT Token
    A->>S: 5. Forward Request

    S->>D: 6. INSERT INTO tasks
    D-->>S: 7. Return task_id

    S->>C: 8. Create Calendar Event
    C-->>S: 9. Return event_id

    S->>D: 10. UPDATE tasks SET calendar_id
    D-->>S: 11. Confirm Update

    S->>N: 12. Queue Notification
    N-->>U: 13. Push Notification

    S-->>A: 14. Return { taskId, status }
    A-->>F: 15. Return 201 Created
    F-->>U: 16. Show Success Message

    F->>A: 17. GET /api/tasks
    A->>S: 18. Fetch Tasks
    S->>D: 19. SELECT * FROM tasks
    D-->>S: 20. Return Task List
    S-->>A: 21. Return JSON Array
    A-->>F: 22. Return 200 OK
    F-->>U: 23. Display Updated List
```

**Key Interactions Shown:**
- Frontend validation before API call
- Authentication middleware (JWT verification)
- Database transactions
- External service integration (Calendar API)
- Asynchronous notification system
- Data refresh after mutation

---

## 3. Technical Architecture Diagram - System Layered Structure

Shows the complete tech stack and dependencies between layers.

```mermaid
graph LR
    subgraph "Frontend Layer"
        WebApp[React + TypeScript<br/>Vite Build Tool]
        StateLib[Zustand State<br/>React Query Cache]
        UIKit[Ant Design<br/>Component Library]
    end

    subgraph "Backend Layer"
        Gateway[API Gateway<br/>Express.js + JWT]
        TaskSvc[Task Service<br/>Business Logic]
        AuthSvc[Auth Service<br/>User Management]
        NotifySvc[Notification Service<br/>WebSocket Server]
    end

    subgraph "Data Layer"
        MainDB[(PostgreSQL<br/>Primary Database)]
        Prisma[Prisma ORM<br/>Type-safe Queries]
        RedisCache[(Redis<br/>Session Cache)]
    end

    subgraph "External Services"
        GoogleCal[Google Calendar API<br/>Event Sync]
        SendGrid[SendGrid<br/>Email Notifications]
        Sentry[Sentry<br/>Error Tracking]
    end

    WebApp --> Gateway
    UIKit --> WebApp
    StateLib --> WebApp

    Gateway --> TaskSvc
    Gateway --> AuthSvc
    Gateway --> NotifySvc
    Gateway --> Prisma
    Gateway --> RedisCache

    TaskSvc --> GoogleCal
    NotifySvc --> SendGrid
    Gateway --> Sentry

    Prisma --> MainDB

    style WebApp fill:#61dafb
    style Gateway fill:#ff6b6b
    style MainDB fill:#4caf50
    style GoogleCal fill:#0088cc
    style SendGrid fill:#ff9800
```

**Architecture Highlights:**
- Clear separation of concerns (Frontend, Backend, Data, External)
- Specific technology choices labeled
- Dependency flow from top to bottom
- Color coding for different layer types

---

## Usage in README

### Recommended Structure

```markdown
# Task Management API

A RESTful API for managing tasks with real-time sync and notifications.

## Features
- User authentication with JWT
- CRUD operations for tasks
- Google Calendar integration
- Real-time notifications
- PostgreSQL database with Redis caching

## System Architecture

### User Operation Flow
[Insert Core Flow Diagram]

### API Request Flow
[Insert Data Flow Diagram]

### Technical Stack
[Insert Architecture Diagram]

## Quick Start
[Installation and setup instructions]

## API Documentation
[Endpoint details]
```

---

## Customization Guide

### Adapting for Your Project

1. **Core Flow Diagram**
   - Replace "Task" with your domain entity
   - Adjust decision points for your business logic
   - Add/remove user actions as needed

2. **Data Flow Diagram**
   - Update participant names to match your services
   - Adjust sequence numbers for your flow
   - Add/remove external services

3. **Architecture Diagram**
   - Replace tech stack labels with your choices
   - Adjust layer groupings for your architecture
   - Update colors to match your preferences

### Color Palette Reference

```
Start/Success:     #e1f5e1 (light green)
User Interface:    #e3f2fd (light blue)
Processing:        #fff3e0 (light orange)
Notifications:     #fce4ec (light pink)
Frontend Tech:     #61dafb (React blue)
Backend Tech:      #ff6b6b (red)
Database:          #4caf50 (green)
External Services: #0088cc (blue), #ff9800 (orange)
```
