# Step by Step Usage Guide Writing Guidelines

## Core Principles

### 1. User Perspective
Start from the perspective of a completely new user unfamiliar with the project, assuming the user:
- Has no background knowledge
- Needs clear operational instructions
- Wants to understand the purpose of each step
- Needs to verify if each step is successful

### 2. Progressive Guidance
Organize steps according to the actual operational sequence:
1. Prerequisites check
2. Obtain external dependencies
3. Configure environment
4. Initialize system
5. Start services
6. Verify operation
7. Use features

### 3. Completeness
Each step should include:
- Clear title (starting with a verb)
- Purpose explanation
- Specific commands or operations
- Expected output or results
- Common issue tips

---

## Step Template

### Prerequisites

```markdown
### Prerequisites

- ✅ Software dependency 1 (version requirement)
- ✅ Software dependency 2
- ✅ Account requirement (if needed)
- ✅ Other requirements

> 💡 **Tip**: Optional additional explanation
> ⚠️ **Warning**: Important notes
```

### Standard Step Format

```markdown
### Step N: Title Starting with Verb

Brief explanation of the purpose of this step (1-2 sentences).

#### Sub-step 1: Specific Operation

1. Visit [link text](URL)
2. Perform an operation
3. Obtain some information

\`\`\`bash
# If there are commands, provide complete copyable commands
command --option value
\`\`\`

**Expected Output**:
\`\`\`
Expected output content
\`\`\`

> 💡 **Tip**: Additional explanation or tips for this step
> ⚠️ **Note**: Common errors or precautions
```

---

## Practical Examples

### Example 1: Obtaining External Service Credentials

```markdown
### Step 2: Obtain Telegram API Credentials

Telegram API credentials are used to connect to the Telegram server and fetch group messages.

1. Visit [https://my.telegram.org](https://my.telegram.org)
2. Log in with your Telegram account (enter phone number and verification code)
3. Click "API development tools"
4. Fill in application information:
   - App title: Fill in anything (e.g., "My Bot")
   - Short name: Fill in anything (e.g., "mybot")
   - Platform: Select "Other"
5. Click "Create application"
6. Record the following information:
   - `api_id`: A string of numbers (e.g., 12345678)
   - `api_hash`: A string of alphanumeric characters (e.g., abcdef1234567890)

> ⚠️ **Important Note**: It is recommended to use a test account to avoid the risk of your main account being banned
> 💡 **Tip**: These credentials will be used in step 4
```

### Example 2: Configure Environment Variables

```markdown
### Step 4: Configure Environment Variables

Environment variables are used to store sensitive information and configuration parameters, avoiding hardcoding them into the code.

```bash
# Copy environment variable template
cp apps/backend/.env.example apps/backend/.env

# Edit configuration file
nano apps/backend/.env  # or use your preferred editor
```

#### Required Configuration Items

The following configuration items must be filled in, otherwise the system cannot start:

```bash
# ========================================
# Telegram API Configuration (obtained in step 2)
# ========================================
TELEGRAM_API_ID=12345678              # Replace with your api_id
TELEGRAM_API_HASH=abcdef1234567890    # Replace with your api_hash

# ========================================
# AI Provider Configuration (obtained in step 3)
# ========================================
AI_PROVIDER=deepseek                  # Optional: mock | openai | deepseek | gemini
AI_API_KEY=sk-xxxxxxxxxxxxx           # Replace with your API Key
AI_API_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

#### Optional Configuration Items

The following configuration items can be skipped and use default values:

```bash
# ========================================
# Server Configuration (optional)
# ========================================
PORT=3000                             # Default 3000
NODE_ENV=development                  # Default development
```

> 💡 **Tip**: Comments in the configuration file start with `#`
> ⚠️ **Note**: Do not commit the `.env` file to the Git repository
```

### Example 3: Start Services

```markdown
### Step 6: Start Services

#### Method A: Start Frontend and Backend Simultaneously (Recommended)

Suitable for daily development use, start all services with one command.

```bash
# Execute in the project root directory
pnpm dev
```

**Expected Output**:
```
> @omniknight/backend dev
> Backend server running on http://localhost:3000

> @omniknight/web dev
> Frontend server running on http://localhost:5173
```

Service addresses:
- Backend API: [http://localhost:3000](http://localhost:3000)
- Frontend Dashboard: [http://localhost:5173](http://localhost:5173)

#### Method B: Start Separately (for debugging)

Suitable for scenarios where you need to debug the frontend or backend separately.

**Terminal 1 - Start Backend**:
```bash
pnpm --filter @omniknight/backend dev
# Backend running on http://localhost:3000
```

**Terminal 2 - Start Frontend**:
```bash
pnpm --filter @omniknight/web dev
# Frontend running on http://localhost:5173
```

> 💡 **Tip**: Use `Ctrl+C` to stop services
> ⚠️ **Note**: Make sure ports 3000 and 5173 are not in use
```

### Example 4: Verify System Operation

```markdown
### Step 8: Verify System Operation

Confirm the system is running normally through the following tests.

#### Test API Connection

```bash
# Test 1: View group list
curl http://localhost:3000/api/groups

# Expected output: JSON format group list
# {"success":true,"data":[{"id":1,"name":"Test Group",...}]}

# Test 2: Manually generate summary
curl -X POST http://localhost:3000/api/summaries/generate \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": 1,
    "periodStart": "2025-01-29T00:00:00Z",
    "periodEnd": "2025-01-30T23:59:59Z"
  }'

# Expected output: Return job ID
# {"success":true,"data":{"jobId":123}}
```

#### View Logs

Backend logs will output to the terminal in real-time. Key logs include:

- ✅ `Telegram client connected successfully` - Telegram connection is normal
- 📡 `Starting to fetch messages` - Starting to fetch group messages
- 🤖 `Calling AI to generate summary` - AI service call successful
- ✅ `Summary generation completed` - Task execution completed

> 💡 **Tip**: If you see error logs, check the environment variable configuration
> ⚠️ **Common Issue**: If the API is unresponsive, check if the backend started normally
```

---

## Writing Checklist

After completing the step writing, use the following checklist to verify quality:

### Completeness Check
- [ ] Each step has a clear title
- [ ] Each step explains its purpose
- [ ] Complete commands or operational instructions are provided
- [ ] Expected output or results are explained
- [ ] Common issue tips are included

### Operability Check
- [ ] Commands can be directly copied and pasted for execution
- [ ] All placeholders are clearly explained (e.g., `your_api_key`)
- [ ] All external links are accessible
- [ ] Step order matches the actual operational flow

### User-Friendliness Check
- [ ] Clear icons are used (✅ ⚠️ 💡)
- [ ] Multiple solution options are provided (if applicable)
- [ ] Troubleshooting tips are included
- [ ] Language is concise and easy to understand, avoiding jargon

### Format Compliance Check
- [ ] Correct Markdown syntax is used
- [ ] Code blocks specify language type
- [ ] Link format is correct
- [ ] Hierarchy structure is clear (using ###, ####)

---

## Common Mistakes

### ❌ Wrong Example 1: Missing Context

```markdown
### Configure Environment Variables

Edit the .env file.
```

**Problem**: No explanation of why to configure, how to edit, or what to configure.

### ✅ Correct Example 1

```markdown
### Step 4: Configure Environment Variables

Environment variables are used to store sensitive information and configuration parameters.

```bash
cp apps/backend/.env.example apps/backend/.env
nano apps/backend/.env
```

Edit the following required configuration items:
- `TELEGRAM_API_ID`: The api_id obtained in step 2
- `AI_API_KEY`: The API Key obtained in step 3
```

---

### ❌ Wrong Example 2: Incomplete Commands

```markdown
Run npm install to install dependencies.
```

**Problem**: No complete code block provided, users cannot copy directly.

### ✅ Correct Example 2

```markdown
### Step 1: Install Dependencies

```bash
# Use pnpm to install project dependencies
pnpm install
```

**Expected Output**: Dependency installation progress bar, finally showing "Done in Xs"
```

---

### ❌ Wrong Example 3: Missing Verification Steps

```markdown
After starting the service, visit http://localhost:3000
```

**Problem**: No explanation of how to verify if the service is running normally.

### ✅ Correct Example 3

```markdown
### Step 6: Start Services

```bash
pnpm dev
```

**Verify Service Operation**:
1. Visit [http://localhost:3000/api/health](http://localhost:3000/api/health)
2. You should see `{"status":"ok"}`
3. If you see an error, check if the port is in use

> 💡 **Tip**: Use `lsof -i :3000` to check port usage
```
