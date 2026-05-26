'use client';

import { TaskCreateForm } from '@/components/tasks/TaskCreateForm';
import { TaskList } from '@/components/tasks/TaskList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TasksPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">Tasks</h1>
      <TaskCreateForm />
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">All Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TaskList />
        </CardContent>
      </Card>
    </div>
  );
}
