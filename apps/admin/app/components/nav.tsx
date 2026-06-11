import { Link, NavLink, Form } from '@remix-run/react';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/downloads', label: 'Downloads' },
  { to: '/admin/installs', label: 'Installs' },
  { to: '/admin/tickets', label: 'Tickets' },
  { to: '/admin/articles', label: 'Articles' },
  { to: '/admin/security', label: 'Security' },
  { to: '/admin/settings', label: 'Settings' },
];

export function TopNav({ email, csrf }: { email: string; csrf: string }) {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/admin" className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-6 w-6 rounded-md"
              style={{
                background:
                  'linear-gradient(135deg, #7c5cff 0%, #9277ff 100%)',
              }}
            />
            <span className="font-semibold tracking-tight text-[var(--color-text)]">Klyna</span>
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              Admin
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-[rgba(124,92,255,0.12)] text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[var(--color-muted)]">{email}</span>
          <Form method="post" action="/admin/logout">
            <input type="hidden" name="csrf" value={csrf} />
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              Sign out
            </button>
          </Form>
        </div>
      </div>
    </header>
  );
}
