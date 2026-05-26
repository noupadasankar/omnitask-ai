'use client';

import { useTasks } from '@/hooks/useTasks';
import { TaskList } from '@/components/tasks/TaskList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HistoryPage() {
  const { data: tasks } = useTasks();
  const finished = tasks?.filter((t) =>
    ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status),
  );

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">Execution History</h1>
      <p className="text-slate-400">{finished?.length ?? 0} completed or terminal tasks</p>
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Past Executions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TaskList />
        </CardContent>
      </Card>
    </div>
  );
}
