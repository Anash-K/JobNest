import { ApiStatusBadge } from '@/components/layout/ApiStatusBadge';

interface PageHeaderProps {
  title: string;
  description?: string;
}

/** Consistent page header used across all app routes. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b bg-card px-8 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <ApiStatusBadge />
    </div>
  );
}
