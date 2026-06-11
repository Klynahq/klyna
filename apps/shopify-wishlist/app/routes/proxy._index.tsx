// Klyna Wishlist — storefront wishlist + shared-list page (App Proxy at
// /apps/wishlist). Returns an `application/liquid` document so Shopify wraps
// it in the merchant's theme layout. Two modes:
//   • default        → the current shopper's own wishlist
//   • ?list=<token>  → a read-only shared list (only if the owner enabled it)

import { type LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import {
  findOrCreateWishlist,
  recordEvent,
  type SavedProduct,
} from '../wishlist.server';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemCard(i: SavedProduct & { variantId?: string | null }, readOnly: boolean) {
  const href = i.handle ? `/products/${esc(i.handle)}` : '#';
  const price = i.price ? `${esc(i.price)} ${esc(i.currency ?? '')}`.trim() : '';
  const img = i.imageUrl
    ? `<img class="kw-card-img" src="${esc(i.imageUrl)}" alt="${esc(i.title)}" loading="lazy" />`
    : `<div class="kw-card-img kw-card-img--empty"></div>`;
  const variant = i.variantId ? String(i.variantId).split('/').pop() : '';
  return `
    <li class="kw-card" data-product="${esc(i.id)}" data-variant="${esc(String(i.variantId ?? ''))}">
      <a class="kw-card-link" href="${href}">${img}</a>
      <div class="kw-card-body">
        <a class="kw-card-title" href="${href}">${esc(i.title || i.id)}</a>
        ${price ? `<div class="kw-card-price">${price}</div>` : ''}
      </div>
      ${
        readOnly
          ? ''
          : `<div class="kw-card-actions">
              ${variant ? `<button class="kw-btn kw-btn--add" data-variant="${esc(variant)}">Add to cart</button>` : ''}
              <button class="kw-btn kw-btn--remove" data-product="${esc(i.id)}">Remove</button>
            </div>`
      }
    </li>`;
}

function page(opts: {
  shop: string;
  heading: string;
  subheading: string;
  items: (SavedProduct & { variantId?: string | null })[];
  readOnly: boolean;
  shareToken: string | null;
  giftBlurb?: string | null;
}): string {
  const { shop, heading, subheading, items, readOnly, shareToken, giftBlurb } = opts;
  const grid =
    items.length === 0
      ? `<p class="kw-empty">No saved products yet. Tap the ♥ on any product to start your wishlist.</p>`
      : `<ul class="kw-grid">${items.map((i) => itemCard(i, readOnly)).join('')}</ul>`;

  // The data-config block lets the inline script reach the proxy API and
  // (when not read-only) keep the server in sync as the shopper edits.
  return `<div id="klyna-wishlist" data-readonly="${readOnly ? '1' : '0'}" data-token="${esc(shareToken ?? '')}">
  <style>
    #klyna-wishlist{--kw-accent:#7c5cff;--kw-accent-hover:#9277ff;max-width:1100px;margin:0 auto;padding:32px 16px;font-family:inherit;}
    #klyna-wishlist .kw-head{margin-bottom:24px;}
    #klyna-wishlist h1{font-size:1.75rem;margin:0 0 4px;}
    #klyna-wishlist .kw-sub{color:#71717a;margin:0;}
    #klyna-wishlist .kw-grid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;padding:0;margin:0;}
    #klyna-wishlist .kw-card{border:1px solid #e5e5ea;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;background:#fff;}
    #klyna-wishlist .kw-card-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#f4f4f5;}
    #klyna-wishlist .kw-card-img--empty{background:#f4f4f5;}
    #klyna-wishlist .kw-card-body{padding:12px;flex:1;}
    #klyna-wishlist .kw-card-title{display:block;font-weight:600;color:inherit;text-decoration:none;line-height:1.3;}
    #klyna-wishlist .kw-card-price{color:#71717a;margin-top:4px;font-size:.9rem;}
    #klyna-wishlist .kw-card-actions{display:flex;gap:8px;padding:0 12px 12px;}
    #klyna-wishlist .kw-btn{flex:1;border:1px solid #e5e5ea;background:#fff;border-radius:8px;padding:8px;cursor:pointer;font-size:.85rem;}
    #klyna-wishlist .kw-btn--add{background:var(--kw-accent);border-color:var(--kw-accent);color:#fff;}
    #klyna-wishlist .kw-btn--add:hover{background:var(--kw-accent-hover);border-color:var(--kw-accent-hover);}
    #klyna-wishlist .kw-btn--remove:hover{border-color:#f87171;color:#f87171;}
    #klyna-wishlist .kw-empty{color:#71717a;padding:48px 0;text-align:center;}
    #klyna-wishlist .kw-share{margin-top:24px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
    #klyna-wishlist .kw-share input{flex:1;min-width:240px;padding:8px 10px;border:1px solid #e5e5ea;border-radius:8px;}
    #klyna-wishlist .kw-share button{padding:8px 14px;border-radius:8px;border:1px solid var(--kw-accent);background:var(--kw-accent);color:#fff;cursor:pointer;}
    #klyna-wishlist .kw-blurb{margin:0 0 20px;padding:16px 18px;border:1px solid rgba(124,92,255,0.25);background:rgba(124,92,255,0.08);border-radius:12px;color:#1f1f24;}
    #klyna-wishlist .kw-blurb-label{display:block;text-transform:uppercase;letter-spacing:.04em;font-size:.72rem;color:var(--kw-accent);margin-bottom:6px;font-weight:600;}
    #klyna-wishlist .kw-blurb p{margin:0;line-height:1.5;}
  </style>
  <div class="kw-head">
    <h1>${esc(heading)}</h1>
    <p class="kw-sub">${esc(subheading)}</p>
  </div>
  ${
    giftBlurb
      ? `<aside class="kw-blurb" aria-label="Gift suggestion">
          <span class="kw-blurb-label">Gift idea</span>
          <p>${esc(giftBlurb)}</p>
        </aside>`
      : ''
  }
  ${grid}
  ${
    !readOnly && shareToken
      ? `<div class="kw-share">
          <input type="text" readonly value="${esc(`https://${shop}/apps/wishlist?list=${shareToken}`)}" id="kw-share-url" />
          <button type="button" id="kw-copy">Copy share link</button>
        </div>`
      : ''
  }
  <script>
  (function(){
    var root = document.getElementById('klyna-wishlist');
    if(!root) return;
    var readOnly = root.getAttribute('data-readonly') === '1';
    var api = '/apps/wishlist/api';
    function guestId(){
      try{
        var k='klyna_wishlist_guest';
        var v=localStorage.getItem(k);
        if(!v){v='g'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(k,v);}
        return v;
      }catch(e){return '';}
    }
    if(!readOnly){
      root.addEventListener('click', function(e){
        var rm = e.target.closest('.kw-btn--remove');
        if(rm){
          e.preventDefault();
          var pid = rm.getAttribute('data-product');
          fetch(api, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'remove', productId:pid, guest:guestId()})})
            .then(function(){ var card=rm.closest('.kw-card'); if(card) card.remove(); });
        }
        var add = e.target.closest('.kw-btn--add');
        if(add){
          e.preventDefault();
          var vid = add.getAttribute('data-variant');
          fetch('/cart/add.js', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({items:[{id:Number(vid), quantity:1}]})})
            .then(function(){ window.location.href='/cart'; });
        }
      });
    }
    var copy = document.getElementById('kw-copy');
    if(copy){
      copy.addEventListener('click', function(){
        var input = document.getElementById('kw-share-url');
        input.select();
        try{ navigator.clipboard.writeText(input.value); }catch(e){ document.execCommand('copy'); }
        copy.textContent='Copied!';
        setTimeout(function(){copy.textContent='Copy share link';},1500);
        fetch(api, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'share', guest:guestId()})}).catch(function(){});
      });
    }
  })();
  </script>
</div>`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response('Wishlist unavailable.', {
      status: 401,
      headers: { 'Content-Type': 'application/liquid' },
    });
  }
  const shop = session.shop;
  const url = new URL(request.url);
  const listToken = url.searchParams.get('list');

  // Shared, read-only view.
  if (listToken) {
    const wishlist = await prisma.wishlist.findFirst({
      where: { shop, token: listToken },
      include: { items: { orderBy: { createdAt: 'desc' } } },
    });
    if (!wishlist || !wishlist.isPublic) {
      return new Response(
        page({
          shop,
          heading: 'List not found',
          subheading: 'This shared wishlist is private or no longer exists.',
          items: [],
          readOnly: true,
          shareToken: null,
        }),
        { headers: { 'Content-Type': 'application/liquid', 'Cache-Control': 'no-store' } },
      );
    }
    await recordEvent({ shop, type: 'view', wishlistId: wishlist.id });
    return new Response(
      page({
        shop,
        heading: wishlist.name,
        subheading: `A shared wishlist · ${wishlist.items.length} item${wishlist.items.length === 1 ? '' : 's'}`,
        items: wishlist.items.map((i) => ({
          id: i.productId,
          title: i.productTitle,
          handle: i.productHandle,
          imageUrl: i.imageUrl,
          price: i.price,
          currency: i.currency,
          variantId: i.variantId,
        })),
        readOnly: true,
        shareToken: null,
        giftBlurb: wishlist.giftBlurb,
      }),
      { headers: { 'Content-Type': 'application/liquid', 'Cache-Control': 'no-store' } },
    );
  }

  // The shopper's own wishlist.
  const customerId = url.searchParams.get('logged_in_customer_id')
    ? `gid://shopify/Customer/${url.searchParams.get('logged_in_customer_id')}`
    : undefined;
  const guestId = url.searchParams.get('guest') || undefined;
  const wishlist = await findOrCreateWishlist({ shop, customerId, guestId });
  await recordEvent({ shop, type: 'view', wishlistId: wishlist.id });

  return new Response(
    page({
      shop,
      heading: 'Your wishlist',
      subheading: `${wishlist.items.length} saved item${wishlist.items.length === 1 ? '' : 's'}`,
      items: wishlist.items.map((i) => ({
        id: i.productId,
        title: i.productTitle,
        handle: i.productHandle,
        imageUrl: i.imageUrl,
        price: i.price,
        currency: i.currency,
        variantId: i.variantId,
      })),
      readOnly: false,
      shareToken: wishlist.token,
    }),
    { headers: { 'Content-Type': 'application/liquid', 'Cache-Control': 'no-store' } },
  );
};
