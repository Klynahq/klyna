/**
 * Content script — runs in the context of every page the user visits.
 * Its only job: when asked, grab the document HTML and send it back.
 * We use document.documentElement.outerHTML to capture the *post-JS-render*
 * DOM, which is what users actually see and what crawlers increasingly see too.
 */

import { isKlynaMessage, type KlynaMessage } from '../lib/messages.ts';

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isKlynaMessage(msg)) return;
  if (msg.type === 'GET_PAGE_HTML') {
    const html = document.documentElement.outerHTML;
    const response: KlynaMessage = {
      type: 'PAGE_HTML',
      payload: {
        html,
        url: window.location.href,
        title: document.title,
      },
    };
    sendResponse(response);
    return true;
  }
  return undefined;
});
