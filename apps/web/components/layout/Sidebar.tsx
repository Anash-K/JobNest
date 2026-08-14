'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Mail,
  FileText,
  Send,
  Hammer,
  Inbox,
  ScrollText,
  FileUser,
  Settings,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { APP_NAME, APP_TAGLINE, APP_LOGO_LETTERS } from '@/lib/constants/app';

/** Navigation items — order matches implementation doc sidebar. */
const NAV_ITEMS = [
  { href: '/pipeline', label: 'Pipeline', icon: FolderKanban, primary: true },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Mail },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/build', label: 'Build Emails', icon: Hammer },
  { href: '/generated-emails', label: 'Generated Emails', icon: Inbox },
  { href: '/send', label: 'Send', icon: Send },
  { href: '/applications', label: 'Applications', icon: Briefcase },
  { href: '/email-logs', label: 'Email Logs', icon: ScrollText },
  { href: '/resumes', label: 'Resumes', icon: FileUser },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-[hsl(var(--sidebar))]">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          {APP_LOGO_LETTERS}
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">{APP_NAME}</p>
          <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {'primary' in item && item.primary && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Home
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t p-4">
        <UserMenu />
        <ThemeToggle />
        <p className="text-xs text-muted-foreground">{APP_NAME} — Production MVP</p>
      </div>
    </aside>
  );
}
