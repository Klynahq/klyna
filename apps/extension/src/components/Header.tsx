export function Header() {
  return (
    <header className="px-5 py-4 border-b border-[color:var(--color-border)]/60 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md bg-[color:var(--color-bg)]/80">
      <div className="flex items-center gap-2">
        <span className="inline-block w-6 h-6 rounded-lg bg-gradient-to-br from-[color:var(--color-accent)] to-[#5b3df0] shadow-[0_0_18px_-4px_var(--color-accent)]" />
        <div className="leading-tight">
          <div className="font-semibold text-sm tracking-tight">Klyna Inspector</div>
          <div className="text-[10px] text-[color:var(--color-text-dim)] uppercase tracking-wider">
            On-page SEO + GEO
          </div>
        </div>
      </div>
    </header>
  );
}
