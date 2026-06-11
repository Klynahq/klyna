/**
 * Klyna editor sidebar — registered as a Gutenberg PluginSidebar.
 *
 * Bundled IIFE with `React` external. PHP injects
 *   window.React = window.wp.element
 * before this script loads, keeping one React in the editor.
 */
import '../styles/global.css';
import './editor.css';
import { Fragment, useEffect, useState } from 'react';
import { api, type Finding } from '../api/client.ts';
import { FindingRow } from '../components/FindingRow.tsx';
import { ScoreRing } from '../components/ScoreRing.tsx';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';

declare global {
  interface Window {
    wp?: {
      plugins?: { registerPlugin: (name: string, config: { render: () => unknown; icon?: unknown }) => void };
      editPost?: {
        PluginSidebar?: React.ComponentType<{ name: string; title: string; icon?: unknown; children: React.ReactNode }>;
        PluginSidebarMoreMenuItem?: React.ComponentType<{ target: string; children: React.ReactNode }>;
      };
      editor?: {
        PluginSidebar?: React.ComponentType<{ name: string; title: string; icon?: unknown; children: React.ReactNode }>;
        PluginSidebarMoreMenuItem?: React.ComponentType<{ target: string; children: React.ReactNode }>;
      };
      data?: {
        select: (s: string) => any;
        subscribe: (cb: () => void) => () => void;
      };
      element?: typeof import('react');
    };
  }
}

interface AuditResult {
  id: number;
  title: string;
  url: string;
  edit_url: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  findings: Finding[];
  stats: Record<string, number | boolean>;
}

function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...a: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as F;
}

function KlynaSidebarBody() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [postId, setPostId] = useState<number | null>(null);

  useEffect(() => {
    const wp = window.wp;
    if (!wp?.data) return;
    const refresh = debounce(async () => {
      const editor = wp.data!.select('core/editor');
      if (!editor) return;
      const id: number | null = editor.getCurrentPostId?.() ?? null;
      const content: string = editor.getEditedPostAttribute?.('content') ?? '';
      if (!id) return;
      setPostId(id);
      try {
        setBusy(true);
        const data = await api.auditOne(id, content);
        if (data) setAudit(data as AuditResult);
      } catch {
        // Silent on transient editor states
      } finally {
        setBusy(false);
      }
    }, 600);
    refresh();
    const unsubscribe = wp.data.subscribe(refresh);
    return () => unsubscribe();
  }, []);

  if (!audit) {
    return (
      <div className="klyna-editor-sidebar">
        <div className="klyna-empty">
          {busy ? 'Analyzing this post…' : 'Save the post once and Klyna will start scoring it live.'}
        </div>
      </div>
    );
  }

  const fixableCount = audit.findings.filter((f) => f.fixable).length;

  return (
    <div className="klyna-editor-sidebar">
      <div className="klyna-hero">
        <ScoreRing score={audit.score} size={92} thickness={6} />
        <div className="klyna-hero-meta">
          <div className="klyna-hero-grade">Grade {audit.grade}</div>
          <div className="klyna-hero-summary">
            {audit.findings.length === 0
              ? 'Looking good — no issues found.'
              : `${audit.findings.length} issue${audit.findings.length === 1 ? '' : 's'} found · ${fixableCount} auto-fixable`}
          </div>
        </div>
      </div>

      {fixableCount > 0 && postId !== null && (
        <Button
          variant="primary"
          size="md"
          icon={<Icon name="zap" size={12} />}
          loading={busy}
          className="klyna-fix-cta"
          onClick={async () => {
            setBusy(true);
            try {
              await api.fixPost(postId);
              const fresh = await api.auditOne(postId);
              if (fresh) setAudit(fresh as AuditResult);
            } finally {
              setBusy(false);
            }
          }}
        >
          Fix all {fixableCount} auto-fixable
        </Button>
      )}

      <div className="klyna-findings">
        {audit.findings.length === 0 ? (
          <div className="klyna-empty klyna-empty-success">
            <Icon name="check" size={20} />
            <div>Clean. Ship it.</div>
          </div>
        ) : (
          audit.findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              editUrl={audit.edit_url}
              onFixed={async () => {
                if (postId !== null) {
                  const fresh = await api.auditOne(postId);
                  if (fresh) setAudit(fresh as AuditResult);
                }
              }}
            />
          ))
        )}
      </div>

      <div className="klyna-stats">
        <Stat label="Words" value={audit.stats.word_count as number} />
        <Stat label="Links in" value={audit.stats.internal_links_in as number} />
        <Stat label="Links out" value={audit.stats.internal_links_out as number} />
        <Stat label="Schema" value={audit.stats.has_schema ? 'on' : 'off'} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | boolean }) {
  return (
    <div className="klyna-stat">
      <div className="klyna-stat-label">{label}</div>
      <div className="klyna-stat-value">{String(value)}</div>
    </div>
  );
}

const klynaIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
    <rect x={2} y={2} width={20} height={20} rx={5} fill="#7c5cff" />
    <path
      d="M9 7v10M9 12l6-5M9 12l6 5"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

function bootSidebar() {
  const wp = window.wp;
  if (!wp?.plugins || (!wp.editPost && !wp.editor)) {
    // wp loads in stages — try again until both are present
    if (!(window as any).__klynaSidebarRetries) (window as any).__klynaSidebarRetries = 0;
    if ((window as any).__klynaSidebarRetries++ < 60) {
      setTimeout(bootSidebar, 200);
    } else {
      console.warn('[Klyna] Gave up waiting for wp.plugins + wp.editPost/wp.editor.');
    }
    return;
  }
  // wp.editor.PluginSidebar is the post-6.6 canonical home; wp.editPost.PluginSidebar
  // is the deprecated-but-still-shipping alias. Prefer the new one.
  const PluginSidebar =
    wp.editor?.PluginSidebar ?? wp.editPost?.PluginSidebar;
  const PluginSidebarMoreMenuItem =
    wp.editor?.PluginSidebarMoreMenuItem ?? wp.editPost?.PluginSidebarMoreMenuItem;
  if (!PluginSidebar || !PluginSidebarMoreMenuItem) {
    console.warn('[Klyna] PluginSidebar not found in wp.editor or wp.editPost.');
    return;
  }

  // eslint-disable-next-line no-console
  console.info('[Klyna] Registering editor sidebar plugin.');
  wp.plugins.registerPlugin('klyna-seo-sidebar', {
    icon: klynaIcon,
    render: () => (
      <Fragment>
        <PluginSidebarMoreMenuItem target="klyna-seo-sidebar">
          Klyna SEO
        </PluginSidebarMoreMenuItem>
        <PluginSidebar
          name="klyna-seo-sidebar"
          title="Klyna SEO"
          icon={klynaIcon}
        >
          <KlynaSidebarBody />
        </PluginSidebar>
      </Fragment>
    ),
  });
}

// Wait until DOM is ready and wp.* globals have time to register.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSidebar);
} else {
  bootSidebar();
}
