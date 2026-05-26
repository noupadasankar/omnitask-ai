# OmniTask Advanced Dashboards - Implementation Guide

## 🚀 Quick Start

### Installation

1. **Install Dependencies**
   ```bash
   cd apps/frontend
   pnpm install
   ```

2. **Verify Recharts is installed**
   ```bash
   pnpm list recharts
   ```

### Running the Dashboard

```bash
# Development mode
pnpm dev

# Production build
pnpm build
pnpm start
```

The dashboard is available at: `http://localhost:3000/dashboard`

## 📋 File Structure

```
apps/frontend/src/
├── app/
│   └── (dashboard)/
│       └── dashboard/
│           └── page.tsx          # Main dashboard page
├── components/
│   └── dashboards/
│       ├── index.ts              # Component exports
│       ├── MetricsOverview.tsx    # KPI cards
│       ├── AnalyticsCharts.tsx    # Historical analytics
│       ├── RealtimeMonitoring.tsx # Live monitoring
│       ├── MemoryDashboard.tsx    # Memory & knowledge
│       ├── AgentAnalytics.tsx     # Agent performance
│       └── README.md              # Component documentation
├── hooks/
│   └── useDashboard.ts            # Custom hooks
├── lib/
│   ├── dashboardUtils.ts          # Utility functions
│   └── dashboardConfig.ts         # Configuration & constants
```

## 🎯 Dashboard Tabs

### 1. **📊 Analytics**
Historical data analysis and trends
- Task completion rates
- Agent performance
- Execution status distribution
- Hourly trends

**Data Sources:**
- `/api/analytics/tasks`
- `/api/analytics/execution`

### 2. **🔴 Live Monitor**
Real-time system monitoring
- Execution flow visualization
- System metrics (CPU, memory, network)
- Performance distribution
- Live KPIs

**Update Frequency:** Every 5-10 seconds

### 3. **🤖 Agents**
Individual agent performance
- Agent status cards
- Activity timeline
- Task distribution
- Success rate comparison

**Data Sources:**
- `/api/agents/status`
- `/api/agents/metrics`

### 4. **🧠 Memory**
Semantic memory and knowledge management
- Memory statistics
- Access patterns
- Semantic search
- Skill proficiency
- Knowledge graph

**Data Sources:**
- `/api/memory/stats`
- `/api/memory/search`

### 5. **✨ Insights**
AI-generated insights and recommendations
- Peak performance detection
- Agent rankings
- Optimization opportunities
- Memory efficiency metrics
- System health status

## 🔌 API Integration

### Expected API Endpoints

```
GET /api/analytics/tasks
  Query: ?range=week|month
  Response: { date, completed, failed, pending }

GET /api/agents/status
  Response: { id, name, status, successRate, taskCount, uptime }

GET /api/memory/stats
  Response: { episodic, semantic, skills, archived }

GET /api/memory/search
  Query: ?q=search_term
  Response: { results, similarity, relevance }

GET /api/system/health
  Response: { availability, errorRate, responseTime, throughput }

GET /api/execution/flow?taskId=xxx
  Response: { steps, status, graph }
```

### Implementing Backend APIs

**Example API Handler (NestJS):**

```typescript
@Controller('api/analytics')
export class AnalyticsController {
  @Get('tasks')
  async getTasks(@Query('range') range: string) {
    // Query database for task analytics
    return await this.analyticsService.getTaskMetrics(range);
  }
}
```

## 📊 Customizing Charts

### Add a New Chart

1. **Create component in `/components/dashboards/`**
   ```typescript
   // MyCustomChart.tsx
   export const MyCustomChart = () => (
     <Card>
       <CardHeader>
         <CardTitle>My Chart</CardTitle>
       </CardHeader>
       <CardContent>
         <ResponsiveContainer width="100%" height={300}>
           <BarChart data={data}>
             {/* Chart configuration */}
           </BarChart>
         </ResponsiveContainer>
       </CardContent>
     </Card>
   );
   ```

2. **Export from index.ts**
   ```typescript
   export { MyCustomChart } from './MyCustomChart';
   ```

3. **Import and use in dashboard page**
   ```typescript
   import { MyCustomChart } from '@/components/dashboards';
   ```

## 🎨 Theming

### Colors
All colors are defined in `/lib/dashboardConfig.ts`:

```typescript
export const COLORS = {
  SUCCESS: '#10b981',
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
  // ...
};
```

### Dark Mode
The dashboard uses a dark theme by default. To customize:

1. **Modify base colors** in `dashboardConfig.ts`
2. **Update Tailwind classes** in components (slate-900, slate-800, etc.)
3. **Update Recharts theme** in chart components

### Adding Light Mode

```typescript
// In your theme provider
export const useTheme = () => {
  const [isDark, setIsDark] = useState(true);
  
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  return { colors, isDark, setIsDark };
};
```

## 🔄 Real-time Updates

### Using WebSocket

```typescript
// Connect to real-time updates
useEffect(() => {
  const socket = io('/', {
    query: { userId: currentUser.id }
  });

  socket.on('metrics:update', (data) => {
    setMetrics(data);
  });

  return () => socket.disconnect();
}, []);
```

### Using React Query Polling

```typescript
const { data } = useQuery({
  queryKey: ['metrics'],
  queryFn: fetchMetrics,
  refetchInterval: 5000, // Poll every 5 seconds
});
```

## 📱 Responsive Design

Dashboard automatically adjusts layout based on screen size:

- **Mobile (< 768px)**: Single column
- **Tablet (768-1024px)**: Two columns
- **Desktop (> 1024px)**: Three columns
- **Ultra-wide (> 1536px)**: Four columns

To customize breakpoints, edit `/lib/dashboardConfig.ts`:

```typescript
export const BREAKPOINTS = {
  MD: 768,
  LG: 1024,
  XL: 1280,
};
```

## 🧪 Testing

### Test Components

```typescript
import { render, screen } from '@testing-library/react';
import { MetricsOverview } from '@/components/dashboards';

describe('MetricsOverview', () => {
  it('displays four metric cards', () => {
    render(<MetricsOverview />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });
});
```

### Mock Data

Mock data is provided in component demonstrations. For testing, use `/lib/dashboardUtils.ts` utilities:

```typescript
import { generateMockData, calculatePercentile } from '@/lib/dashboardUtils';

const mockMetrics = generateMockData();
```

## 🔐 Security

1. **Sanitize API Responses**
   ```typescript
   const sanitized = sanitizeData(apiResponse);
   ```

2. **Validate Data Types**
   ```typescript
   const { success, data } = await metricsSchema.safeParseAsync(response);
   ```

3. **Rate Limit WebSocket**
   ```typescript
   const { rateLimiter } = useRateLimit({ maxEvents: 100, window: 60000 });
   ```

## 🐛 Troubleshooting

### Charts Not Rendering

**Issue:** Charts appear blank
**Solution:** Verify data structure matches Recharts expected format

```typescript
// Correct format
const data = [
  { name: 'Item', value: 100 },
  { name: 'Item2', value: 200 },
];
```

### Animations Stuttering

**Issue:** Animations are jerky
**Solution:** Reduce animation duration or disable for low-end devices

```typescript
const isLowEnd = useMediaQuery('(prefers-reduced-motion)');
const duration = isLowEnd ? 0 : 500;
```

### Performance Issues

**Issue:** Dashboard is slow
**Solution:**
1. Implement React.memo for chart components
2. Use useMemo for data calculations
3. Enable chart caching in Recharts

```typescript
const MemoizedChart = React.memo(MyChart);
```

## 📚 Documentation

- [Recharts Documentation](https://recharts.org)
- [Framer Motion Docs](https://www.framer.com/motion)
- [React Query Docs](https://tanstack.com/query/latest)
- [Tailwind CSS Docs](https://tailwindcss.com)

## 🚀 Performance Optimization

1. **Code Splitting:** Dashboard tabs are automatically lazy-loaded
2. **Memoization:** Components use React.memo to prevent unnecessary renders
3. **Query Caching:** React Query caches API responses
4. **Chart Optimization:** Use recharts responsiveness for smooth rendering

## 🤝 Contributing

To add new dashboard features:

1. Create component in `/components/dashboards/`
2. Add to `index.ts` exports
3. Integrate into dashboard page
4. Add documentation to README.md
5. Test responsiveness

## 📝 Example: Adding a New Metric

```typescript
// 1. Create component
export const MyMetric = () => (
  <Card>
    <CardContent>
      <div>My Metric Value</div>
    </CardContent>
  </Card>
);

// 2. Export from index
export { MyMetric } from './MyMetric';

// 3. Import in dashboard
import { MyMetric } from '@/components/dashboards';

// 4. Use in page
<TabsContent value="analytics">
  <MyMetric />
</TabsContent>
```

## 🎓 Learning Resources

- Study existing dashboard components
- Examine data flow in hooks
- Review utility functions for data processing
- Test API integrations locally
- Experiment with Recharts documentation

---

**Version:** 1.0.0  
**Last Updated:** May 2026  
**Status:** Production Ready  
**Maintainer:** Advanced Senior Developer
