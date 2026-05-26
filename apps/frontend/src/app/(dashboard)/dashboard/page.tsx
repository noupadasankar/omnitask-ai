'use client';

import { TaskCreateForm } from '@/components/tasks/TaskCreateForm';
import { TaskList } from '@/components/tasks/TaskList';
import { AgentStatusPanel } from '@/components/tasks/AgentStatusPanel';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useTasks } from '@/hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const { user } = useAuth();
  const { connected, events } = useSocket(user?.id);
  const { data: tasks } = useTasks();

  const running = tasks?.filter((t) => t.status === 'RUNNING').length ?? 0;
  const completed = tasks?.filter((t) => t.status === 'COMPLETED').length ?? 0;
  const failed = tasks?.filter((t) => t.status === 'FAILED').length ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">AI Task Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Planner → Executor → Critic pipeline with real-time agent feedback
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Running" value={running} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="Failed" value={failed} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TaskCreateForm />
          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="text-white">Recent Tasks</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TaskList limit={8} />
            </CardContent>
          </Card>
        </div>
        <AgentStatusPanel connected={connected} events={events} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-slate-700 bg-slate-900/60">
      <CardContent className="pt-6">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-3xl font-bold text-white mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
