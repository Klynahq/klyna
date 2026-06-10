import { useEffect, useState } from 'react';
import { auditPage, type AuditResult } from '@klyna/core';
import { isKlynaMessage, type AuditSnapshot, type KlynaMessage } from '../lib/messages.ts';
import { Header } from '../components/Header.tsx';
import { ScoreCard } from '../components/ScoreCard.tsx';
import { Stats } from '../components/Stats.tsx';
import { FindingsList } from '../components/FindingsList.tsx';
import { Footer } from '../components/Footer.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'ready'; snapshot: AuditSnapshot; result: AuditResult }
  | { kind: 'error'; message: string };

const SUPPORTED = /^https?:\/\//i;

async function fetchActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchPageSnapshot(tabId: number): Promise<AuditSnapshot> {
  return new Promise<AuditSnapshot>((resolve, reject) => {
    const message: KlynaMessage = { type: 'GET_PAGE_HTML' };
    chrome.tabs.sendMessage(tabId, message, (response: unknown) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!isKlynaMessage(response) || response.type !== 'PAGE_HTML') {
        reject(new Error('Unexpected response from content script.'));
        return;
      }
      resolve(response.payload);
    });
  });
}

export function Popup() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tab = await fetchActiveTab();
        if (!tab?.id || !tab.url) {
          if (mounted) setState({ kind: 'unsupported', reason: 'No active tab.' });
          return;
        }
        if (!SUPPORTED.test(tab.url)) {
          if (mounted)
            setState({
              kind: 'unsupported',
              reason: 'Klyna only audits public web pages (http / https).',
            });
          return;
        }

        const snapshot = await fetchPageSnapshot(tab.id);
        const result = auditPage({
          url: snapshot.url,
          html: snapshot.html,
          title: snapshot.title,
          fetchedAt: new Date().toISOString(),
        });
        if (mounted) setState({ kind: 'ready', snapshot, result });
      } catch (err) {
        if (mounted)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Unknown error.',
          });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col">
      <Header />

      {state.kind === 'loading' && (
        <div className="px-5 py-10 text-center text-sm text-[color:var(--color-text-muted)]">
          <div className="inline-block w-5 h-5 rounded-full border-2 border-[color:var(--color-accent)] border-r-transparent animate-spin mb-3" />
          <div>Auditing this page…</div>
        </div>
      )}

      {state.kind === 'unsupported' && (
        <EmptyState
          title="Not auditable"
          body={state.reason}
          hint="Open any normal web page and try again."
        />
      )}

      {state.kind === 'error' && (
        <EmptyState
          title="Something went wrong"
          body={state.message}
          hint="Reload the page and try again. Some sites block content-script injection."
        />
      )}

      {state.kind === 'ready' && (
        <>
          <div className="px-5 pb-3">
            <ScoreCard score={state.result.score} grade={state.result.grade} url={state.snapshot.url} />
          </div>
          <Stats result={state.result} />
          <FindingsList findings={state.result.findings} />
        </>
      )}

      <Footer />
    </div>
  );
}
