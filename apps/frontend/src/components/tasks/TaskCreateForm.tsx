'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateTask } from '@/hooks/useTasks';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function TaskCreateForm() {
  const [prompt, setPrompt] = useState('');
  const createTask = useCreateTask();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    try {
      await createTask.mutateAsync({ naturalLanguage: prompt.trim() });
      toast.success('Task created and queued for execution');
      setPrompt('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to create task';
      toast.error(msg || 'Failed to create task');
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          New AI Task
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="Describe what you want the agent to do in natural language..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="bg-slate-950 border-slate-700 resize-none"
          />
          <Button type="submit" disabled={createTask.isPending || !prompt.trim()}>
            {createTask.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Planning...
              </>
            ) : (
              'Create & Run Task'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
