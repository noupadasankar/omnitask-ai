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
  },

  {
    title: 'Tasks',
    href: '/tasks',
    icon: CheckCircle2,
  },

  {
    title: 'Agents',
    href: '/agents',
    icon: Bot,
  },

  {
    title: 'Workflows',
    href: '/workflows',
    icon: Workflow,
  },

  {
    title: 'Analytics',
    href: '/analytics',
    icon: Activity,
  },

  {
    title: 'Memory',
    href: '/memory',
    icon: BrainCircuit,
  },

  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];