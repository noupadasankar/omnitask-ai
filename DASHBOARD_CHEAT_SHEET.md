# Dashboard Development Cheat Sheet

## 🚀 Quick Reference

### Imports You'll Need

```typescript
// Components
import {
  MetricsOverview,
  AnalyticsCharts,
  RealtimeMonitoring,
  MemoryDashboard,
  AgentAnalytics
} from '@/components/dashboards';

// Hooks
import {
  useTaskAnalytics,
  useAgentMetrics,
  useMemoryStats,
  useRealTimeMetrics,
  useSystemHealth
} from '@/hooks/useDashboard';

// Utilities
import {
  formatNumber,
  formatDuration,
  calculateSuccessRate,
  formatBytes,
  getTrendDirection
} from '@/lib/dashboardUtils';

// Config
import {
  COLORS,
  THRESHOLDS,
  DASHBOARD_CONFIG
} from '@/lib/dashboardConfig';

// Mock Data
import {
  generateMockTaskMetrics,
  generateMockAgentMetrics,
  getAllMockData
} from '@/lib/mockData';
```

## 📊 Utility Functions Quick Reference

### Number Formatting

```typescript
formatNumber(1234567)           // "1.2M"
formatNumber(1234, 2)           // "1.23K"
formatBytes(1048576)            // "1 MB"
formatBytes(2147483648, 3)      // "2.000 GB"
```

### Calculations

```typescript
calculateSuccessRate(95, 5)     // 95 (percentage)
calculatePercentageChange(120, 100)  // 20
calculatePercentile([1,2,3,4,5], 75) // 4
calculateAverageTime([1.2, 2.1, 1.8]) // 1.7
calculateRollingAverage([1,2,3,4,5], 3) // [1, 1.5, 2, 3, 4]
```

### Formatting

```typescript
formatDuration(90)              // "1m 30s"
formatDuration(3661)            // "1h 1m"
formatTimestamp(new Date())     // "10:30:45 AM"
getTimeRangeLabel('week')       // "Last 7 Days"
```

### Data Processing

```typescript
// Sort array by property
sortBy(agents, 'successRate', 'desc')

// Filter with conditions
filterBy(tasks, { status: 'completed', agent: 'browser' })

// Group and aggregate
aggregateBy(tasks, 'agent', 'duration', 'sum')
groupByTimePeriod(data, 'day')
```

### Color & Status

```typescript
getStatusColor('completed')     // "#10b981"
getTrendDirection(12.5)         // "up"
getTrendDirection(-5)           // "down"
getTrendDirection(0.5)          // "neutral"
```

## 🎨 Color Constants

```typescript
COLORS.SUCCESS      // "#10b981" - Green
COLORS.ERROR        // "#ef4444" - Red
COLORS.WARNING      // "#f59e0b" - Amber
COLORS.INFO         // "#3b82f6" - Blue
COLORS.SECONDARY    // "#8b5cf6" - Purple

COLORS.GRADIENT.SUCCESS  // Gradient for success
COLORS.GRADIENT.ERROR    // Gradient for error
```

## 📱 Responsive Breakpoints

```typescript
BREAKPOINTS.XS      // 320px
BREAKPOINTS.SM      // 640px
BREAKPOINTS.MD      // 768px (tablet)
BREAKPOINTS.LG      // 1024px (desktop)
BREAKPOINTS.XL      // 1280px
BREAKPOINTS['2XL']  // 1536px
```

## 🎯 Animation Durations

```typescript
DASHBOARD_CONFIG.ANIMATION.FAST        // 200ms
DASHBOARD_CONFIG.ANIMATION.NORMAL      // 300ms
DASHBOARD_CONFIG.ANIMATION.SLOW        // 500ms
DASHBOARD_CONFIG.ANIMATION.SLOW_CHART  // 1000ms
```

## 🔄 Refresh Intervals

```typescript
DASHBOARD_CONFIG.REFRESH.METRICS   // 5000ms
DASHBOARD_CONFIG.REFRESH.ANALYTICS // 30000ms
DASHBOARD_CONFIG.REFRESH.HEALTH    // 10000ms
DASHBOARD_CONFIG.REFRESH.MEMORY    // 60000ms
```

## 📊 Chart Configuration

```typescript
// Access chart heights
DASHBOARD_CONFIG.CHART.HEIGHT.SMALL    // 200px
DASHBOARD_CONFIG.CHART.HEIGHT.MEDIUM   // 300px
DASHBOARD_CONFIG.CHART.HEIGHT.LARGE    // 400px

// Chart margins
DASHBOARD_CONFIG.CHART.MARGIN
// { top: 20, right: 30, bottom: 20, left: 60 }
```

## 🧪 Testing with Mock Data

```typescript
// Single data generator
const mockTasks = generateMockTaskMetrics(7);
const mockAgents = generateMockAgentMetrics();

// All mock data at once
const allData = getAllMockData();
allData.taskMetrics
allData.agentMetrics
allData.systemHealth
// ... etc
```

## 🔌 Hook Usage Examples

### Task Analytics Hook

```typescript
const { data, isLoading, error } = useTaskAnalytics('day');

if (isLoading) return <Spinner />;
if (error) return <Error />;

return <AnalyticsCharts data={data} />;
```

### Real-time Metrics Hook

```typescript
const { metrics, isConnected } = useRealTimeMetrics();

useEffect(() => {
  if (metrics) {
    updateChart(metrics);
  }
}, [metrics]);
```

### Agent Metrics Hook

```typescript
const { data: agents } = useAgentMetrics();

return agents.map(agent => (
  <AgentCard key={agent.id} agent={agent} />
));
```

## 🎨 Theming Pattern

```typescript
// In component
import { COLORS, DASHBOARD_CONFIG } from '@/lib/dashboardConfig';

export const MyChart = () => (
  <ResponsiveContainer>
    <BarChart
      data={data}
      margin={DASHBOARD_CONFIG.CHART.MARGIN}
    >
      <Bar dataKey="value" fill={COLORS.CHART.PRIMARY} />
    </BarChart>
  </ResponsiveContainer>
);
```

## 📋 Component Usage

### Metrics Overview
```typescript
import { MetricsOverview } from '@/components/dashboards';

<MetricsOverview />
```

### Analytics Charts
```typescript
import { AnalyticsCharts } from '@/components/dashboards';

const { data } = useTaskAnalytics('week');
<AnalyticsCharts data={data} />
```

### Real-time Monitoring
```typescript
import { RealtimeMonitoring } from '@/components/dashboards';

const { metrics } = useRealTimeMetrics();
<RealtimeMonitoring metrics={metrics} />
```

### Memory Dashboard
```typescript
import { MemoryDashboard } from '@/components/dashboards';

const { data } = useMemoryStats();
<MemoryDashboard data={data} />
```

### Agent Analytics
```typescript
import { AgentAnalytics } from '@/components/dashboards';

const { data: agents } = useAgentMetrics();
<AgentAnalytics agents={agents} />
```

## 🐛 Common Patterns

### Conditional Rendering
```typescript
{isLoading && <LoadingSpinner />}
{error && <ErrorMessage error={error} />}
{data && <DataVisualization data={data} />}
```

### Data Transformation
```typescript
const processedData = data.map(item => ({
  ...item,
  formatted: formatNumber(item.value),
  trend: getTrendDirection(item.change)
}));
```

### Error Handling
```typescript
try {
  const result = await fetchData();
  setData(result);
} catch (error) {
  setError(error.message);
}
```

## 📈 Performance Tips

1. **Memoize expensive calculations**
   ```typescript
   const result = useMemo(() => 
     calculatePercentile(largeArray, 95),
     [largeArray]
   );
   ```

2. **Use React.memo for charts**
   ```typescript
   const MemoChart = React.memo(MyChart);
   ```

3. **Debounce search input**
   ```typescript
   const [search, setSearch] = useState('');
   const debouncedSearch = useMemo(
     () => debounce(setSearch, 300),
     []
   );
   ```

4. **Enable query caching**
   ```typescript
   useQuery({
     queryKey: ['data'],
     queryFn: fetchData,
     staleTime: 5 * 60 * 1000
   });
   ```

## 🔍 Debugging

### Check if component rendered
```typescript
console.log('Rendering:', props);
```

### Inspect data shape
```typescript
console.log('Data structure:', JSON.stringify(data, null, 2));
```

### Monitor hook updates
```typescript
useEffect(() => {
  console.log('Data updated:', data);
}, [data]);
```

### Check animation performance
```typescript
// In browser DevTools
console.time('animation');
// ... animation code
console.timeEnd('animation');
```

## 📚 File Organization

```
apps/frontend/
├── src/
│   ├── components/dashboards/     # UI components
│   ├── hooks/useDashboard.ts       # Data hooks
│   ├── lib/
│   │   ├── dashboardUtils.ts       # Utilities
│   │   ├── dashboardConfig.ts      # Config
│   │   └── mockData.ts             # Mock data
│   └── app/(dashboard)/dashboard/  # Dashboard page

Documentation/
├── ADVANCED_DASHBOARDS.md          # Full guide
├── DASHBOARD_VISUAL_GUIDE.md       # Visual reference
└── API_INTEGRATION_GUIDE.md        # API docs
```

## 🎓 Learning Path

1. **Day 1:** Understand component structure
   - Read ADVANCED_DASHBOARDS.md
   - Study MetricsOverview.tsx
   - Review dashboardConfig.ts

2. **Day 2:** Learn data management
   - Study useDashboard.ts
   - Review dashboardUtils.ts
   - Test with mock data

3. **Day 3:** API Integration
   - Follow API_INTEGRATION_GUIDE.md
   - Connect hooks to API
   - Test with real data

4. **Day 4:** Customization
   - Modify colors in config
   - Add new charts
   - Optimize performance

## 🚀 Deployment Checklist

- [ ] All API endpoints connected
- [ ] Environment variables configured
- [ ] Error boundaries added
- [ ] Loading states implemented
- [ ] Cache strategy configured
- [ ] WebSocket connection working
- [ ] Performance tested
- [ ] Responsive design verified
- [ ] Dark mode working
- [ ] Animations smooth
- [ ] Documentation updated

---

**Print this page for quick reference while developing!**
