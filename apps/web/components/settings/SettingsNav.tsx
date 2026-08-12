'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'sessions', label: 'Sessions' },
] as const;

/** In-page settings navigation with scroll-spy — vertical on desktop, horizontal pills on mobile. */
export function SettingsNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const linkClass = (id: string, mobile: boolean) =>
    cn(
      'rounded-md text-sm font-medium transition-colors',
      mobile ? 'shrink-0 whitespace-nowrap px-3 py-1.5' : 'block px-3 py-2',
      active === id
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    );

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-8 lg:self-start">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden" role="tablist">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            role="tab"
            aria-selected={active === section.id}
            className={linkClass(section.id, true)}
          >
            {section.label}
          </a>
        ))}
      </div>

      <ul className="hidden flex-col gap-0.5 lg:flex">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
              className={linkClass(section.id, false)}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
