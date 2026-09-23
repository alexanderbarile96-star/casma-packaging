// =============================================
// CASMA PACKAGING — Storefront (SupplyWise Retail API)
// =============================================
(function () {
  'use strict';

  const SLUG = 'casmapackaging';
  const PROXY = '/api/sw';
  const DIRECT = 'https://actions.supplywise.com.au/api/retail/v1/' + SLUG;
  const CART_KEY = 'casma_cart_v1';

  // ---------- API ----------
  class ApiError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code; }
  }

  async function parse(r) {
    let body = null;
    try { body = await r.json(); } catch (_) { /* non-JSON */ }
    if (!r.ok) {
      const e = body && body.error;
      throw new ApiError((e && e.message) || ('Request failed (' + r.status + ')'), r.status, e && e.code);
    }
    return body;
  }

  // Same-origin proxy first (avoids ad/privacy blockers); fall back to the
  // public API directly only if the proxy itself isn't there (e.g. local preview).
  async function request(path, opts) {
    opts = opts || {};
    let r;
    try {
      r = await fetch(PROXY + path, opts);
    } catch (err) {
      r = null;
    }
    if (!r || r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) {
      try {
        r = await fetch(DIRECT + path, opts);
      } catch (err) {
        console.error('Store request failed', path, err);
        throw new ApiError('We couldn\u2019t reach the store. A browser extension, ad blocker or network filter may be blocking it \u2014 try disabling blockers or another browser.', 0, 'network');
      }
    }
    return parse(r);
  }

  const api = {
    store: () => request('/store'),
    product: (slug) => request('/products/' + encodeURIComponent(slug)),
    parent: (slug) => request('/products/parent/' + encodeURIComponent(slug)),
    promo: (payload) => request('/promo-code', post(payload)),
    checkout: (payload) => request('/checkout', post(payload)),
  };
  function post(payload) {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  }

  let storePromise = null;
  function loadStore() {
    if (!storePromise) storePromise = api.store().catch((e) => { storePromise = null; throw e; });
    return storePromise;
  }

  // ---------- Helpers ----------
  const money = (cents) => '$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'h1']);
  function sanitize(input) {
    if (!input) return '';
    let out = String(input).replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
    out = out.replace(/<\/?(script|style)\b[^>]*>/gi, '');
    const hasTags = /<[a-z]/i.test(out);
    out = out.replace(/<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/)?>/g, (_m, close, name, self) => {
      const tag = name.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (close) return '</' + tag + '>';
      if (tag === 'br' || self) return '<' + tag + '/>';
      return '<' + tag + '>';
    });
    // Plain-text descriptions: escape and keep paragraph breaks.
    if (!hasTags) return '<p>' + esc(out).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>') + '</p>';
    return out;
  }

  // "Carton of 240" / "Pack of 20" / "Single" from a member display name or product name.
  function packLabel(displayName, productName) {
    const src = displayName || productName || '';
    const m = src.match(/\((Single|Carton of \d+|Pack of \d+)\)\s*$/i) || src.match(/^(Single|Carton of \d+|Pack of \d+)$/i);
    return m ? m[1] : (displayName || '');
  }
  function packQty(label) {
    const m = String(label).match(/(\d+)/);
    return /single/i.test(label) ? 1 : (m ? parseInt(m[1], 10) : null);
  }
  function unitNote(priceCents, label) {
    const q = packQty(label);
    if (!q || q <= 1) return '';
    return money(Math.round(priceCents / q)) + ' each';
  }

  // Build the list of shop "items": one per variant group (only visible members)
  // plus any product that isn't part of a group.
  function buildItems(store) {
    const byId = new Map(store.products.map((p) => [p.id, p]));
    const inGroup = new Set();
    const items = [];
    for (const g of store.parents || []) {
      const members = (g.products || [])
        .map((m) => ({ product: byId.get(m.productId), label: packLabel(m.displayName, (byId.get(m.productId) || {}).name) }))
        .filter((m) => m.product);
      (g.products || []).forEach((m) => inGroup.add(m.productId));
      if (!members.length) continue;
      const sel = members.find((m) => m.product.inStock) || members[0];
      items.push({
        type: 'parent', key: 'g:' + g.id, name: g.name, slug: g.slug, group: g, members,
        product: sel.product, label: sel.label,
        priceCents: Math.min(...members.map((m) => m.product.priceCents)),
        from: members.length > 1,
        categoryIds: [...new Set(members.flatMap((m) => m.product.categoryIds || []))],
        inStock: members.some((m) => m.product.inStock),
        sortIndex: Math.min(...members.map((m) => m.product.sortIndex || 0)),
        createdAt: Math.max(...members.map((m) => m.product.createdAt || 0)),
        images: (sel.product.images && sel.product.images.length) ? sel.product.images : (g.images || []),
        href: '/shop/parent/' + encodeURIComponent(g.slug || ''),
      });
    }
    for (const p of store.products) {
      if (inGroup.has(p.id)) continue;
      items.push({
        type: 'product', key: 'p:' + p.id, name: p.name, slug: p.slug, members: [{ product: p, label: packLabel('', p.name) }],
        product: p, label: packLabel('', p.name), priceCents: p.priceCents, from: false,
        categoryIds: p.categoryIds || [], inStock: p.inStock, sortIndex: p.sortIndex || 0, createdAt: p.createdAt || 0,
        images: p.images || [], href: '/shop/product/' + encodeURIComponent(p.slug || ''),
      });
    }
    return items;
  }

  function imageFor(images, store) {
    if (images && images.length) return { src: images[0], logo: false };
    const logo = store && store.supplier && store.supplier.image;
    return { src: logo || '', logo: true };
  }

  // ---------- Cart (localStorage) ----------
  function readCart() {
    try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(c) ? c : []; }
    catch (_) { return []; }
  }
  function writeCart(lines) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (_) { /* storage blocked */ }
    updateBadge();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }
  const cart = {
    lines: readCart,
    count: () => readCart().reduce((n, l) => n + l.quantity, 0),
    add(productId, quantity) {
      const lines = readCart();
      const q = Math.max(1, parseInt(quantity, 10) || 1);
      const line = lines.find((l) => l.productId === productId);
      if (line) line.quantity += q; else lines.push({ productId, quantity: q, optionsSelected: [] });
      writeCart(lines);
    },
    set(productId, quantity) {
      let lines = readCart();
      const q = parseInt(quantity, 10) || 0;
      if (q <= 0) lines = lines.filter((l) => l.productId !== productId);
      else lines.forEach((l) => { if (l.productId === productId) l.quantity = q; });
      writeCart(lines);
    },
    remove(productId) { writeCart(readCart().filter((l) => l.productId !== productId)); },
    clear() { writeCart([]); },
  };

  // ---------- Header cart badge ----------
  const CART_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  function injectCartLinks() {
    const cta = document.querySelector('.nav-cta');
    if (cta && !cta.querySelector('.cart-link')) {
      const a = document.createElement('a');
      a.href = '/cart'; a.className = 'cart-link'; a.setAttribute('aria-label', 'Cart');
      a.innerHTML = CART_SVG + '<span class="cart-count" hidden>0</span>';
      cta.insertBefore(a, cta.firstChild);
    }
    const hamburger = document.getElementById('hamburger');
    if (hamburger && !document.querySelector('.cart-link-mobile')) {
      const a = document.createElement('a');
      a.href = '/cart'; a.className = 'cart-link cart-link-mobile'; a.setAttribute('aria-label', 'Cart');
      a.innerHTML = CART_SVG + '<span class="cart-count" hidden>0</span>';
      hamburger.parentNode.insertBefore(a, hamburger);
    }
    updateBadge();
  }
  function updateBadge() {
    const n = cart.count();
    document.querySelectorAll('.cart-count').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
  }
  window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateBadge(); });

  function toast(message, href) {
    const t = document.createElement('div');
    t.className = 'store-toast';
    t.innerHTML = esc(message) + (href ? ' <a href="' + href + '">View cart \u2192</a>' : '');
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // Product card markup (shared by grid + recommendations)
  function cardHTML(item, store) {
    const img = imageFor(item.images, store);
    const single = item.members.length === 1;
    const unit = single ? unitNote(item.priceCents, item.label) : '';
    const sub = single && item.label && !/single/i.test(item.label) ? item.label : (single ? 'Sold individually' : item.members.length + ' pack sizes');
    const btn = !item.inStock
      ? '<span class="btn btn-sm btn-disabled">Sold out</span>'
      : single
        ? '<button class="btn btn-primary btn-sm js-quick-add" data-id="' + esc(item.product.id) + '" data-name="' + esc(item.name) + '">Add to cart</button>'
        : '<a class="btn btn-outline-dark btn-sm" href="' + item.href + '">Choose size</a>';
    return '<article class="sw-card' + (item.inStock ? '' : ' is-soldout') + '">' +
      '<a class="sw-card-img' + (img.logo ? ' is-logo' : '') + '" href="' + item.href + '">' +
        (img.src ? '<img loading="lazy" src="' + esc(img.src) + '" alt="' + esc(item.name) + '">' : '') +
        (item.inStock ? '' : '<span class="badge">Sold out</span>') +
      '</a>' +
      '<div class="sw-card-body">' +
        '<h3 class="sw-card-title"><a href="' + item.href + '">' + esc(item.name) + '</a></h3>' +
        '<p class="sw-card-sub">' + esc(sub) + '</p>' +
        '<div class="sw-card-price"><strong>' + (item.from ? 'From ' : '') + money(item.priceCents) + '</strong>' +
          (unit ? '<span>' + unit + '</span>' : '') + '</div>' +
        btn +
      '</div></article>';
  }

  function bindQuickAdd(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.js-quick-add');
      if (!b) return;
      e.preventDefault();
      cart.add(b.dataset.id, 1);
      toast('Added ' + b.dataset.name + ' to your cart.', '/cart');
    });
  }

  document.addEventListener('DOMContentLoaded', injectCartLinks);

  window.CasmaStore = {
    api, loadStore, cart, money, esc, slugify, sanitize, packLabel, packQty, unitNote,
    buildItems, imageFor, cardHTML, bindQuickAdd, toast, ApiError,
    FREE_SHIPPING_NOTE: (store) => {
      const t = store && store.shipping && store.shipping.freeShippingThresholdCents;
      return t ? 'Free delivery on orders over ' + money(t) : '';
    },
  };
})();
