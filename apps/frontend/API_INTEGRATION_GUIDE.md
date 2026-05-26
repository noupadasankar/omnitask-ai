# Dashboard API Integration Guide

## Overview

This guide explains how to integrate the OmniTask Advanced Dashboards with the backend API endpoints. The dashboards are currently using mock data and are ready to be connected to real data sources.

## Current State

- ✅ Dashboard components created
- ✅ Mock data visualization working
- ✅ Custom hooks prepared
- ✅ Utility functions implemented
- ⏳ **API integration pending**

## Backend API Requirements

### 1. Task Analytics Endpoint

**Endpoint:** `GET /api/analytics/tasks`

**Query Parameters:**
- `range`: `hour` | `day` | `week` | `month`
- `groupBy`: `hour` | `day` (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-05-15T10:00:00Z",
      "completed": 142,
      "failed": 8,
      "pending": 25,
      "running": 12
    }
  ]
}
```

**Implementation (NestJS):**
```typescript
@Controller('api/analytics')
export class AnalyticsController {
  @Get('tasks')
  async getTaskMetrics(
    @Query('range') range: 'hour' | 'day' | 'week' | 'month'
  ) {
    return this.analyticsService.getTaskMetrics(range);
  }
}
```

### 2. Execution Analytics

**Endpoint:** `GET /api/analytics/execution`

**Query Parameters:**
- `range`: `hour` | `day` | `week` | `month`
- `taskId`: string (optional - specific task)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "status": "completed",
      "count": 2847,
      "percentage": 89.2,
      "timestamp": "2026-05-15T10:00:00Z"
    },
    {
      "status": "running",
      "count": 124,
      "percentage": 3.9
    },
    {
      "status": "failed",
      "count": 178,
      "percentage": 5.6
    },
    {
      "status": "pending",
      "count": 110,
      "percentage": 3.4
    }
  ]
}
```

### 3. Agent Status Endpoint

**Endpoint:** `GET /api/agents/status`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "browser-1",
      "name": "Browser Agent",
      "status": "active",
      "successRate": 96.2,
      "taskCount": 1247,
      "avgExecutionTime": 2.8,
      "uptime": 99.8,
      "lastActive": "2026-05-15T10:15:23Z"
    },
    {
      "id": "api-1",
      "name": "API Agent",
      "status": "active",
      "successRate": 98.5,
      "taskCount": 892,
      "avgExecutionTime": 1.2,
      "uptime": 99.9,
      "lastActive": "2026-05-15T10:15:25Z"
    }
  ]
}
```

### 4. Agent Performance Timeline

**Endpoint:** `GET /api/agents/timeline`

**Query Parameters:**
- `range`: `hour` | `day` | `week` | `month`
- `groupBy`: `hour` | `day` (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-05-15T10:00:00Z",
      "browser": 45,
      "api": 67,
      "file": 23,
      "research": 12,
      "data": 34
    }
  ]
}
```

### 5. Memory Statistics

**Endpoint:** `GET /api/memory/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "episodic": {
      "total": 2847,
      "trend": 12,
      "lastUpdated": "2026-05-15T10:15:23Z"
    },
    "semantic": {
      "total": 1234,
      "trend": 8,
      "lastUpdated": "2026-05-15T10:15:23Z"
    },
    "skills": {
      "total": 342,
      "trend": 15,
      "lastUpdated": "2026-05-15T10:15:23Z"
    },
    "archived": {
      "total": 5678,
      "trend": -2,
      "lastUpdated": "2026-05-15T10:15:23Z"
    }
  }
}
```

### 6. Memory Access Patterns

**Endpoint:** `GET /api/memory/access-patterns`

**Query Parameters:**
- `range`: `hour` | `day` | `week` | `month`
- `type`: `episodic` | `semantic` | `skills` | `archived`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-05-15T00:00:00Z",
      "accesses": 234
    },
    {
      "timestamp": "2026-05-15T01:00:00Z",
      "accesses": 189
    }
  ]
}
```

### 7. Semantic Search

**Endpoint:** `GET /api/memory/search`

**Query Parameters:**
- `q`: string (search query)
- `limit`: number (optional, default: 10)
- `threshold`: number (optional, similarity threshold 0-1)

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "mem-123",
        "title": "Browser automation",
        "similarity": 0.95,
        "relevance": 0.92,
        "timestamp": "2026-05-15T08:30:00Z"
      },
      {
        "id": "mem-124",
        "title": "Form filling",
        "similarity": 0.87,
        "relevance": 0.85,
        "timestamp": "2026-05-15T09:00:00Z"
      }
    ],
    "totalResults": 15
  }
}
```

### 8. Skill Proficiency

**Endpoint:** `GET /api/memory/skills`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "skill": "WebScraping",
      "proficiency": 92,
      "usageCount": 847,
      "successRate": 96.2
    },
    {
      "skill": "FormFilling",
      "proficiency": 85,
      "usageCount": 612,
      "successRate": 94.1
    },
    {
      "skill": "DataExtraction",
      "proficiency": 88,
      "usageCount": 723,
      "successRate": 95.8
    }
  ]
}
```

### 9. System Health

**Endpoint:** `GET /api/system/health`

**Response:**
```json
{
  "success": true,
  "data": {
    "availability": 99.8,
    "errorRate": 2.2,
    "avgResponseTime": 2.3,
    "throughput": 94.5,
    "activeConnections": 24,
    "queueDepth": 156,
    "lastChecked": "2026-05-15T10:15:23Z"
  }
}
```

### 10. Execution Flow (WebSocket)

**WebSocket Endpoint:** `/events`

**Namespace:** `/execution`

**Event:** `task:update`

**Payload:**
```json
{
  "taskId": "task-123",
  "steps": [
    {
      "id": "step-1",
      "name": "Parse",
      "status": "completed",
      "duration": 1.2
    },
    {
      "id": "step-2",
      "name": "Plan",
      "status": "running",
      "duration": 0.8
    }
  ],
  "overallProgress": 45
}
```

## Integration Steps

### Step 1: Update Hook Configuration

Modify `/src/hooks/useDashboard.ts` to connect to actual APIs:

```typescript
export const useTaskAnalytics = (range: 'hour' | 'day' | 'week' | 'month') => {
  return useQuery({
    queryKey: ['taskAnalytics', range],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/tasks?range=${range}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // 30 seconds
  });
};
```

### Step 2: Add Error Handling

```typescript
export const useTaskAnalytics = (range: string) => {
  return useQuery({
    queryKey: ['taskAnalytics', range],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/analytics/tasks?range=${range}`);
        if (response.status === 401) throw new Error('Unauthorized');
        if (!response.ok) throw new Error('Failed to fetch');
        return response.json();
      } catch (error) {
        console.error('Analytics fetch error:', error);
        throw error;
      }
    },
  });
};
```

### Step 3: Implement Real-time Updates

```typescript
export const useRealTimeMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io('/', {
      query: { userId: getCurrentUserId() }
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('metrics:update', (data) => {
      setMetrics(data);
    });

    return () => socket.disconnect();
  }, []);

  return { metrics, isConnected };
};
```

### Step 4: Add Data Caching

```typescript
// In your React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Step 5: Create API Client Layer

```typescript
// /src/lib/apiClient.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = {
  analytics: {
    getTasks: (range: string) => 
      fetch(`${API_BASE}/api/analytics/tasks?range=${range}`),
    getExecution: (range: string) => 
      fetch(`${API_BASE}/api/analytics/execution?range=${range}`),
  },
  agents: {
    getStatus: () => 
      fetch(`${API_BASE}/api/agents/status`),
    getTimeline: (range: string) => 
      fetch(`${API_BASE}/api/agents/timeline?range=${range}`),
  },
  memory: {
    getStats: () => 
      fetch(`${API_BASE}/api/memory/stats`),
    search: (query: string) => 
      fetch(`${API_BASE}/api/memory/search?q=${query}`),
  },
};
```

## Testing API Integration

### 1. Test Single Endpoint

```bash
curl -X GET "http://localhost:3000/api/analytics/tasks?range=day" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Mock API Response

```typescript
// In your test file
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    analytics: {
      getTasks: vi.fn(() => Promise.resolve({
        data: mockTaskData
      }))
    }
  }
}));
```

### 3. Integration Test

```typescript
describe('Dashboard API Integration', () => {
  it('fetches and displays task analytics', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('2,847')).toBeInTheDocument();
    });
  });
});
```

## Environment Configuration

### Development (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

### Production (.env.production)

```env
NEXT_PUBLIC_API_URL=https://api.omnitask.ai
NEXT_PUBLIC_WS_URL=wss://api.omnitask.ai
```

## Error Handling

```typescript
export const AnalyticsTab = () => {
  const { data, error, isLoading } = useTaskAnalytics('day');

  if (isLoading) return <LoadingSpinner />;
  
  if (error) return (
    <ErrorBoundary 
      message="Failed to load analytics"
      retry={() => queryClient.invalidateQueries()}
    />
  );

  return <AnalyticsCharts data={data} />;
};
```

## Performance Optimization

1. **Implement Request Debouncing**
   ```typescript
   const debouncedSearch = useMemo(
     () => debounce((query: string) => {
       queryClient.prefetchQuery(['search', query]);
     }, 500),
     []
   );
   ```

2. **Cache Strategy**
   ```typescript
   staleTime: 5 * 60 * 1000,      // Data fresh for 5 minutes
   cacheTime: 30 * 60 * 1000,     // Keep in cache for 30 minutes
   refetchOnWindowFocus: false,    // Don't refetch on focus
   ```

3. **Pagination for Large Datasets**
   ```typescript
   const { data } = useInfiniteQuery({
     queryKey: ['memories'],
     queryFn: ({ pageParam = 0 }) => 
       fetch(`/api/memory?offset=${pageParam * 50}`),
     getNextPageParam: (lastPage) => lastPage.nextOffset,
   });
   ```

## Troubleshooting

### CORS Issues

Add to backend:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

### WebSocket Connection Failed

Check:
1. WebSocket port is open
2. CORS headers are correct
3. Socket.io client version matches server

### Slow API Responses

1. Add query parameters for filtering
2. Implement pagination
3. Cache responses with React Query

## Next Steps

1. ✅ Create backend API endpoints (see above)
2. ✅ Test endpoints with Postman/curl
3. ✅ Update hook queryFn functions
4. ✅ Configure React Query client
5. ✅ Test dashboard with real data
6. ✅ Implement WebSocket for real-time updates
7. ✅ Add error boundaries and loading states
8. ✅ Performance optimization and caching

---

**Status:** Ready for Backend Integration
**Priority:** High - Blocking production deployment
**Estimated Effort:** 4-6 hours for complete integration
