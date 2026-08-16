# Configuration Documentation Organization Guide

## Core Principles

### 1. Hierarchical Organization
Organize configuration items by importance and functionality:
- **Required Configuration Items**: Configuration needed for the system to run
- **Recommended Configuration Items**: Configuration affecting core functionality
- **Optional Configuration Items**: Configuration for enhanced features

### 2. Clear Labeling
Provide for each configuration item:
- Configuration item name
- Purpose description
- Example value
- How to obtain it (if external service is needed)
- Default value (if applicable)

### 3. Multi-Option Comparison
When multiple configuration options exist, provide comparison tables to help users choose.

---

## Configuration File Structure

### Recommended .env.example Structure

```bash
# ========================================
# Category Title (using separator line)
# ========================================
CONFIG_ITEM=example_value

# ----------------------------------------
# Subcategory Title (using short separator line)
# ----------------------------------------
CONFIG_ITEM=example_value
```

### Complete Example

```bash
# ========================================
# Server Configuration
# ========================================
PORT=3000
NODE_ENV=development

# ========================================
# Database Configuration
# ========================================
DATABASE_PATH=./data/db.sqlite

# ========================================
# Telegram API Configuration
# ========================================
# Obtain from https://my.telegram.org
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# ========================================
# AI Provider Configuration
# ========================================
# Optional values: mock (testing), openai, deepseek, gemini, custom
AI_PROVIDER=mock

# ----------------------------------------
# OpenAI Compatible API Configuration (for openai/deepseek/custom)
# ----------------------------------------
# Must configure API Key, Base URL, and Model together
AI_API_KEY=your_api_key
AI_API_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# ----------------------------------------
# Google Gemini Specific Configuration
# ----------------------------------------
# Get API Key: https://aistudio.google.com/app/apikey
# If GEMINI_API_KEY is not configured, will fall back to AI_API_KEY
# AI_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_api_key
# AI_MODEL=gemini-2.5-flash

# ========================================
# Web Push Browser Notification Configuration (Optional)
# ========================================
# Generate VAPID keys: cd apps/backend && pnpm exec web-push generate-vapid-keys --json
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com
```

---

## Configuration Documentation in README

### Template 1: Required Configuration Items

```markdown
#### Required Configuration Items

The following configuration items must be filled in, otherwise the system cannot start:

```bash
# ========================================
# Telegram API Configuration (obtained in Step 2)
# ========================================
TELEGRAM_API_ID=12345678              # Replace with your api_id
TELEGRAM_API_HASH=abcdef1234567890    # Replace with your api_hash

# ========================================
# AI Provider Configuration (obtained in Step 3)
# ========================================
AI_PROVIDER=deepseek                  # Options: mock | openai | deepseek | gemini
AI_API_KEY=sk-xxxxxxxxxxxxx           # Replace with your API Key
AI_API_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

> ⚠️ **Note**: All `your_*` placeholders must be replaced with actual values
```

### Template 2: Multi-Option Configuration Comparison

```markdown
### Step 3: Get AI API Key

Choose any one of the following AI service providers:

| Provider | Cost-Effectiveness | Speed | Quality | Recommended Use Case |
|----------|--------|------|------|----------|
| Deepseek | ⭐⭐⭐⭐⭐ | Fast | High | Daily use (recommended) |
| OpenAI | ⭐⭐⭐ | Medium | Highest | High quality requirements |
| Gemini | ⭐⭐⭐⭐ | Fast | High | Large free quota |

#### Option A: Deepseek (Recommended, Best Value)

1. Visit [https://platform.deepseek.com](https://platform.deepseek.com)
2. Register and log in
3. Create an API Key
4. Record the API Key (format: `sk-xxxxx`)

**Configuration Example**:
```bash
AI_PROVIDER=deepseek
AI_API_KEY=sk-xxxxxxxxxxxxx
AI_API_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

#### Option B: OpenAI

1. Visit [https://platform.openai.com](https://platform.openai.com)
2. Create an API Key
3. Record the API Key

**Configuration Example**:
```bash
AI_PROVIDER=openai
AI_API_KEY=sk-xxxxxxxxxxxxx
AI_API_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

#### Option C: Google Gemini

1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create an API Key
3. Record the API Key

**Configuration Example**:
```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxx
AI_MODEL=gemini-2.5-flash
```
```

### Template 3: Optional Configuration Items

```markdown
#### Optional Configuration Items (Web Push Browser Notifications)

If you need browser push notification functionality, configure the following:

```bash
# 1. Generate VAPID key pair
cd apps/backend
pnpm exec web-push generate-vapid-keys --json

# 2. Add the output keys to .env
VAPID_PUBLIC_KEY=BNxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxx
VAPID_SUBJECT=mailto:your-email@example.com
```

**Feature Description**:
- Automatically push notifications when tasks complete
- Receive notifications even when browser is in background
- No additional push service needed

> 💡 **Tip**: If not configured, the system still works normally, just without push notification functionality
```

---

## Configuration Item Description Table

### Template: Detailed Configuration Item Description

```markdown
## Configuration Items

| Configuration Item | Required | Default Value | Description | How to Obtain |
|--------|------|--------|------|----------|
| `PORT` | No | `3000` | Backend service port | - |
| `NODE_ENV` | No | `development` | Runtime environment | - |
| `DATABASE_PATH` | No | `./data/db.sqlite` | Database file path | - |
| `TELEGRAM_API_ID` | Yes | - | Telegram API ID | [my.telegram.org](https://my.telegram.org) |
| `TELEGRAM_API_HASH` | Yes | - | Telegram API Hash | [my.telegram.org](https://my.telegram.org) |
| `AI_PROVIDER` | Yes | `mock` | AI service provider | - |
| `AI_API_KEY` | Yes* | - | AI API key | Official website of corresponding provider |
| `AI_API_BASE_URL` | Yes* | - | AI API endpoint | Documentation of corresponding provider |
| `AI_MODEL` | Yes | `deepseek-chat` | AI model name | Documentation of corresponding provider |
| `GEMINI_API_KEY` | No | - | Gemini-specific key | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `VAPID_PUBLIC_KEY` | No | - | Web Push public key | Generate using `web-push` |
| `VAPID_PRIVATE_KEY` | No | - | Web Push private key | Generate using `web-push` |
| `VAPID_SUBJECT` | No | `mailto:admin@example.com` | Web Push contact email | - |

> *Note: Required when `AI_PROVIDER` is not `mock`
```

---

## Configuration Verification Checklist

### User Perspective Checks
- [ ] Clear which configurations are required
- [ ] Know how to obtain values for each configuration item
- [ ] Understand the purpose of each configuration item
- [ ] Can find configuration examples
- [ ] Know how to troubleshoot configuration errors

### Technical Perspective Checks
- [ ] All required configuration items are documented
- [ ] Multiple configuration options provided (if applicable)
- [ ] Example value formats are correct
- [ ] External service links are accessible
- [ ] Configuration file structure is clear

### Documentation Quality Checks
- [ ] Clear separator lines used
- [ ] Configuration items grouped by functionality
- [ ] Comments are concise and clear
- [ ] Links provided for obtaining values
- [ ] Troubleshooting tips included

---

## Common Mistakes

### ❌ Mistake Example 1: Missing Grouping

```bash
PORT=3000
DATABASE_PATH=./data/db.sqlite
TELEGRAM_API_ID=your_api_id
AI_API_KEY=your_api_key
```

**Problem**: All configuration items mixed together, difficult to understand and maintain.

### ✅ Correct Example 1

```bash
# ========================================
# Server Configuration
# ========================================
PORT=3000

# ========================================
# Database Configuration
# ========================================
DATABASE_PATH=./data/db.sqlite

# ========================================
# Telegram API Configuration
# ========================================
TELEGRAM_API_ID=your_api_id

# ========================================
# AI Provider Configuration
# ========================================
AI_API_KEY=your_api_key
```

---

### ❌ Mistake Example 2: Missing Documentation

```bash
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
```

**Problem**: Users don't know how to obtain these values.

### ✅ Correct Example 2

```bash
# ========================================
# Telegram API Configuration
# ========================================
# Obtain from https://my.telegram.org
# 1. Log in to your Telegram account
# 2. Click "API development tools"
# 3. Create an application to get api_id and api_hash
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
```

---

### ❌ Mistake Example 3: Confusing Multiple Options

```bash
AI_PROVIDER=deepseek
AI_API_KEY=your_api_key
AI_API_BASE_URL=https://api.deepseek.com/v1
GEMINI_API_KEY=your_gemini_key
```

**Problem**: Unclear which configuration to use when.

### ✅ Correct Example 3

```bash
# ========================================
# AI Provider Configuration
# ========================================
AI_PROVIDER=deepseek  # Options: mock | openai | deepseek | gemini

# ----------------------------------------
# OpenAI Compatible API Configuration (for openai/deepseek/custom)
# ----------------------------------------
AI_API_KEY=your_api_key
AI_API_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# ----------------------------------------
# Google Gemini Specific Configuration
# ----------------------------------------
# If using Gemini, uncomment the following and configure
# AI_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_api_key
# AI_MODEL=gemini-2.5-flash
```

---

## Configuration File Best Practices

### 1. Use Separator Lines
- Main categories use `# ========================================`
- Subcategories use `# ----------------------------------------`

### 2. Comment Standards
- Each group has a title comment
- Complex configuration items provide how to obtain them
- Optional configuration items clearly marked as "optional"

### 3. Example Value Standards
- Use `your_*` as placeholders
- Provide examples in real format (e.g., `sk-xxxxx`)
- Use placeholders for sensitive information, never use real values

### 4. Multi-Option Handling
- Use comments to explain different options
- Comment out non-default options with `#`
- Provide instructions for switching options

### 5. Dependency Relationships
- Explain dependencies between configuration items
- Mark conditionally required configuration items
- Provide configuration combination examples
