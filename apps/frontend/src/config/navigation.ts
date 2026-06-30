import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  LayoutDashboard,
  Settings,
  Workflow,
  Mail,
  Music,
  Mic,
  Lock,
  Shield,
  Users,
  ScrollText,
  Server,
  FileSliders,
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
    title: 'Email',
    href: '/email',
    icon: Mail,
    description: 'Email Client',
  },

  {
    title: 'Media',
    href: '/media',
    icon: Music,
    description: 'Music & Video',
  },

  {
    title: 'Vault',
    href: '/settings/vault',
    icon: Lock,
    description: 'Credential Vault',
  },

  {
    title: 'Voice',
    href: '/settings/voice',
    icon: Mic,
    description: 'Voice Settings',
  },

  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Configuration',
  },
];

export const adminNavigation = [
  {
    title: 'Admin Panel',
    href: '/admin',
    icon: Shield,
    description: 'System Overview',
  },
  {
    title: 'User Management',
    href: '/admin/users',
    icon: Users,
    description: 'Manage Accounts',
  },
  {
    title: 'Audit Logs',
    href: '/admin/logs',
    icon: ScrollText,
    description: 'System Activity',
  },
  {
    title: 'System Health',
    href: '/admin/system',
    icon: Server,
    description: 'Infrastructure',
  },
  {
    title: 'Policies',
    href: '/admin/policies',
    icon: FileSliders,
    description: 'Quota & Limits',
  },
];