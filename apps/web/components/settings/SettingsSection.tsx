import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Consistent settings section shell: heading + description sit above a single
 * tightly-padded card, matching the anchor ids used by SettingsNav for scroll-spy.
 */
export function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-8', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="rounded-xl border bg-card p-6">{children}</div>
    </section>
  );
}
