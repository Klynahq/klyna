import { Icon } from './Icon.tsx';
import { cn } from '../lib/cn.ts';
import { boot } from '../api/client.ts';

interface Props {
  current: string;
  onNavigate: (slug: string) => void;
}

const NAV = [
  { slug: 'dashboard', label: 'Dashboard', icon: 'dashboard' as const },
  { slug: 'audit', label: 'Audit', icon: 'scan' as const },
  { slug: 'links', label: 'Internal Links', icon: 'links' as const },
  { slug: 'schema', label: 'Schema', icon: 'schema' as const },
  { slug: 'settings', label: 'Settings', icon: 'settings' as const },
];

export function Sidebar({ current, onNavigate }: Props) {
  const b = boot();
  return (
    <aside className="w-60 shrink-0 border-r border-[color:var(--color-klyna-border)]/60 bg-[color:var(--color-klyna-bg)]/40 backdrop-blur flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-[color:var(--color-klyna-border)]/40">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-8 h-8 rounded-lg bg-gradient-to-br from-[color:var(--color-klyna-accent)] to-[#5b3df0] shadow-[0_0_20px_-4px_var(--color-klyna-accent)]" />
          <div>
            <div className="font-semibold text-[15px] leading-none">Klyna</div>
            <div className="text-[11px] text-[color:var(--color-klyna-text-dim)] mt-1 leading-none">
              SEO Suite · v{b.version}
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 py-4 flex-1 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = current === item.slug;
          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => onNavigate(item.slug)}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all border border-transparent text-left',
                active
                  ? 'bg-[color:var(--color-klyna-accent-soft)] text-[color:var(--color-klyna-text)] border-[color:var(--color-klyna-accent)]/30 shadow-[0_0_0_1px_rgba(124,92,255,0.15)_inset]'
                  : 'text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] hover:bg-white/5',
              )}
            >
              <Icon
                name={item.icon}
                size={16}
                className={cn(
                  'transition-colors',
                  active
                    ? 'text-[color:var(--color-klyna-accent)]'
                    : 'text-[color:var(--color-klyna-text-dim)] group-hover:text-[color:var(--color-klyna-text-muted)]',
                )}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[color:var(--color-klyna-border)]/40">
        <a
          href="https://klyna.dev/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] hover:bg-white/5 transition-colors"
        >
          <Icon name="doc" size={14} />
          Documentation
          <Icon name="external" size={12} className="ml-auto opacity-60" />
        </a>
        <a
          href="https://github.com/klynahq"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] text-[color:var(--color-klyna-text-muted)] hover:text-[color:var(--color-klyna-text)] hover:bg-white/5 transition-colors"
        >
          <Icon name="external" size={14} />
          GitHub
        </a>
      </div>
    </aside>
  );
}
