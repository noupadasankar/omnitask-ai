# 🎯 AI Agent System - Quick Reference Guide

## 🚀 Starting the System

```bash
# Terminal 1: Backend with watch mode
cd apps/backend
npm run start:dev

# Terminal 2: (Optional) Watch queue
redis-server

# Terminal 3: (Optional) Frontend
cd apps/frontend
npm run dev
```

---

## 📋 Task Execution Flow

### 1. Create a Task

```typescript
// In your controller or service
const task = await tasksService.create(userId, {
  title: 'Search for AI articles',
  naturalLanguage: 'Find top AI articles from 2026',
  plan: {
    steps: [
      {
        id: 'step-1',
        type: 'tool',
        action: 'google_search',
        input: { query: 'AI articles 2026' },
        description: 'Search Google for AI articles'
      },
      {
        id: 'step-2',
        type: 'tool',
        action: 'open_url',
        input: { url: 'https://example.com/article' },
        description: 'Open first result'
      },
      {
        id: 'step-3',
        type: 'analysis',
        description: 'Analyze article content'
      }
    ]
  }
});
```

### 2. Execute Task

```typescript
// In ExecutionController
const executionId = await executionService.executeTask(taskId, userId);

// Returns: { executionId: 'xxx' }
// Task is now in queue and will be processed by worker
```

### 3. Monitor Execution (Real-time)

```typescript
// Frontend with WebSocket
const socket = io('http://localhost:4000');

socket.on('agent:started', (data) => {
  console.log('Agent started:', data);
  // { executionId, stepCount }
});

socket.on('agent:step:start', (data) => {
  console.log('Step starting:', data);
  // { executionId, stepIndex, step }
});

socket.on('agent:step:result', (data) => {
  console.log('Step result:', data);
  // { executionId, stepIndex, result }
});

socket.on('agent:step:error', (data) => {
  console.log('Step error:', data);
  // { executionId, stepIndex, error }
});

socket.on('agent:selfheal', (data) => {
  console.log('Recovery attempt:', data);
  // { executionId, error }
});
```

---

## 🧰 Available Tools

### 1. **google_search**
Search Google and get top results

```typescript
{
  type: 'tool',
  action: 'google_search',
  input: { query: 'your search query' }
}
// Returns: { results: ['result1', 'result2', ...] }
```

### 2. **open_url**
Navigate to a URL and extract content

```typescript
{
  type: 'tool',
  action: 'open_url',
  input: { 
    url: 'https://example.com',
    selector: '.article-body' // optional
  }
}
// Returns: { content: 'extracted text...' }
```

### 3. **extract_text**
Extract text from current page

```typescript
{
  type: 'tool',
  action: 'extract_text',
  input: { selector: '.main-content' }
}
// Returns: { text: 'page content...' }
```

---

## 🧠 Step Types

### Analysis Step
```typescript
{
  id: 'step-1',
  type: 'analysis',
  description: 'Analyze the data',
  params: { /* context */ }
}
```

### Execution Step
```typescript
{
  id: 'step-2',
  type: 'execution',
  description: 'Execute some action',
  params: { /* context */ }
}
```

### Tool Step
```typescript
{
  id: 'step-3',
  type: 'tool',
  action: 'tool_name',
  input: { /* tool params */ },
  description: 'Use a tool'
}
```

---

## 📊 Execution Status

### Execution Statuses
- `RUNNING` - Currently executing
- `COMPLETED` - Finished successfully  
- `FAILED` - Failed with error
- `CANCELLED` - Manually cancelled

### Step Statuses
- `PENDING` - Waiting to run
- `RUNNING` - Currently running
- `COMPLETED` - Finished successfully
- `FAILED` - Failed with error
- `SKIPPED` - Skipped
- `COMPENSATED` - Rolled back

---

## 🔄 Error Recovery

The system automatically attempts recovery:

```typescript
// Timeout error → Retry with exponential backoff
// Network error → Connection recovery attempt
// Tool failure → Log and mark for replanning
// Memory error → Continue without memory
```

---

## 💾 Memory System

### Storing Memories

```typescript
// Automatic during execution
await memoryService.store(
  userId,
  'Execution result content',
  'EPISODIC', // or 'SEMANTIC' or 'WORKING'
  {
    taskId: 'xxx',
    summary: 'What happened',
    metadata: { /* extra data */ }
  }
);
```

### Memory Types
- **EPISODIC**: Specific events and executions
- **SEMANTIC**: Learned knowledge and facts
- **WORKING**: Current context and temporary data

---

## 🔌 Adding New Tools

### 1. Create Tool File

```typescript
// src/agent/tools/new-tool.tool.ts
import { Injectable } from '@nestjs/common';
import { Tool } from './tool.interface';

@Injectable()
export class MyNewTool implements Tool {
  name = 'my_tool';
  description = 'Description of what tool does';

  async execute(input: any): Promise<any> {
    // Implement your logic
    return { result: 'data' };
  }
}
```

### 2. Register in ToolsModule

```typescript
// src/agent/tools/tools.module.ts
import { MyNewTool } from './new-tool.tool';

@Module({
  providers: [
    ...,
    MyNewTool,  // Add provider
  ],
})
export class ToolsModule {
  constructor(
    private registry: ToolRegistryService,
    private myTool: MyNewTool,
  ) {
    this.registry.register(this.myTool);  // Register
  }
}
```

### 3. Use in Steps

```typescript
{
  type: 'tool',
  action: 'my_tool',
  input: { /* your params */ }
}
```

---

## 🐛 Debugging

### Check Execution Status

```typescript
const execution = await executionService.getExecution(executionId);

// Returns:
{
  id: 'xxx',
  status: 'COMPLETED',
  startedAt: Date,
  completedAt: Date,
  durationMs: 1234,
  steps: [
    {
      stepIndex: 0,
      status: 'COMPLETED',
      action: 'google_search',
      output: { results: [...] },
      durationMs: 500
    },
    ...
  ]
}
```

### View Step Details

```typescript
const steps = await executionService.getExecutionSteps(executionId);

steps.forEach(step => {
  console.log(`Step ${step.stepIndex}:`);
  console.log(`  Status: ${step.status}`);
  console.log(`  Duration: ${step.durationMs}ms`);
  console.log(`  Output:`, step.output);
  console.log(`  Error:`, step.errorMessage);
});
```

### Monitor Logs

```bash
# Check agent logs in console
# Look for:
# 🚀 Execution started
# 🧠 Agent started: ...
# ⚙️  Executing step: ...
# ✅ Step 0 status: COMPLETED
# ✅ Execution completed: ...
```

---

## ⚡ Performance Tips

1. **Reuse Browser**: Browser instance is kept alive for multiple steps
2. **Parallel Execution**: Future enhancement for multiple tool execution
3. **Memory Optimization**: Only store important results
4. **Queue Tuning**: Adjust queue retry settings for your use case

---

## 🆘 Troubleshooting

### Worker Not Processing
- Check Redis is running: `redis-server`
- Check queue.service.ts configuration
- Look for worker logs

### WebSocket Not Connecting
- Check CORS settings in websocket.gateway
- Verify frontend socket.io-client version
- Check network tab in browser DevTools

### Tool Failures
- Check tool input parameters match interface
- Verify browser is not blocked (check for 'headless' issues)
- Check tool logs in console

### Memory Issues
- Ensure Prisma migration ran
- Check userId is valid
- Verify MemoryType enum value

---

## 📚 Useful Endpoints

```bash
# Execute task
POST /api/executions
{
  "taskId": "xxx",
  "userId": "xxx"
}

# Get execution status
GET /api/executions/:executionId

# Get execution steps
GET /api/executions/:executionId/steps

# Get task with plan
GET /api/tasks/:taskId
```

---

## 🎓 Example Workflow

```javascript
// 1. Create task
const task = await createTask('Find Python tutorials');

// 2. Generate plan (manual or via LLM)
const plan = generatePlan(task);

// 3. Update task with plan
await updateTask(task.id, { plan });

// 4. Execute
const executionId = await executeTask(task.id);

// 5. Monitor real-time
socket.on('agent:step:result', updateUI);

// 6. Get final results
const execution = await getExecution(executionId);
const results = execution.steps.map(s => s.output);
```

---

## 📞 Quick Help

- **Module not found**: Check import paths in module files
- **Circular dependency**: Use `forwardRef()` in constructor
- **Queue stuck**: Check Redis logs
- **Browser errors**: Add sandbox args to puppeteer config
- **Type errors**: Check Prisma schema matches models

---

**Happy automating! 🚀**
