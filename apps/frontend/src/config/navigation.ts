import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  LayoutDashboard,
  Settings,
  Workflow,
} from 'lucide-react';

export const navigation = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Command Center',
  },

  {
    title: 'Tasks',
    href: '/tasks',
    icon: CheckCircle2,
    description: 'Execution Queue',
  },

  {
    title: 'Agents',
    href: '/agents',
    icon: Bot,
    description: 'Agent Runtime',
  },

  {
    title: 'Workflows',
    href: '/workflows',
    icon: Workflow,
    description: 'Automation Engine',
  },

  {
    title: 'Analytics',
    href: '/analytics',
    icon: Activity,
    description: 'Performance Intel',
  },

  {
    title: 'Memory',
    href: '/memory',
    icon: BrainCircuit,
    description: 'Knowledge Store',
  },

  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Configuration',
  },
];