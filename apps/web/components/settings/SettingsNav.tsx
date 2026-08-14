'use client';

import { cn } from '@/lib/utils';

export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'sessions', label: 'Sessions' },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

interface SettingsNavProps {
  active: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
}

/** Settings tab list — vertical on desktop, horizontal pills on mobile. Only the active tab's content is rendered. */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  const tabClass = (id: string, mobile: boolean) =>
    cn(
      'rounded-md text-sm font-medium transition-colors',
      mobile ? 'shrink-0 whitespace-nowrap px-3 py-1.5' : 'block w-full px-3 py-2 text-left',
      active === id
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    );

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-8 lg:self-start">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden" role="tablist">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={active === section.id}
            onClick={() => onChange(section.id)}
            className={tabClass(section.id, true)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <ul className="hidden flex-col gap-0.5 lg:flex" role="tablist">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              role="tab"
              aria-selected={active === section.id}
              onClick={() => onChange(section.id)}
              className={tabClass(section.id, false)}
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
