'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className={cn('flex gap-1 rounded-lg border bg-muted/50 p-1', className)}>
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  const active = theme ?? 'light';

  return (
    <div
      className={cn('flex gap-1 rounded-lg border bg-muted/50 p-1', className)}
      role="group"
      aria-label="Theme"
    >
      {THEMES.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 flex-1 gap-1.5 px-2 text-xs',
            active === value && 'bg-background shadow-sm text-foreground',
          )}
          onClick={() => setTheme(value)}
          aria-pressed={active === value}
          title={`${label} theme${value === 'system' && resolvedTheme ? ` (${resolvedTheme})` : ''}`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}
