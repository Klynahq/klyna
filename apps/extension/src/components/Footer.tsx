export function Footer() {
  return (
    <footer className="px-5 py-3 border-t border-[color:var(--color-border)]/60 mt-auto flex items-center justify-between text-[10px] text-[color:var(--color-text-dim)]">
      <a
        href="https://klyna.dev"
        target="_blank"
        rel="noreferrer"
        className="hover:text-[color:var(--color-accent)] transition-colors"
      >
        klyna.dev
      </a>
      <a
        href="https://github.com/klynahq"
        target="_blank"
        rel="noreferrer"
        className="hover:text-[color:var(--color-accent)] transition-colors"
      >
        Open source on GitHub
      </a>
    </footer>
  );
}
