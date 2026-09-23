// Casma — /cart
(function () {
  'use strict';
  const S = window.CasmaStore;
  const root = document.getElementById('cartRoot');
  const PROMO_KEY = 'casma_promo_v1';
  let store, byId, promo = null; // { code, status, error, discountCents }

  try { promo = JSON.parse(sessionStorage.getItem(PROMO_KEY) || 'null'); } catch (_) { promo = null; }

  function discountCents(cd) {
    if (!cd) return 0;
    if (typeof cd === 'number') return cd;
    for (const k of ['amountIncGstCents', 'discountIncGstCents', 'discountCents', 'amountCents', 'savingCents', 'totalCents']) {
      if (typeof cd[k] === 'number') return cd[k];
    }
    const n = Object.values(cd).find((v) => typeof v === 'number');
    return n || 0;
  }

  function resolved() {
    const lines = S.cart.lines();
    return lines.map((l) => ({ line: l, product: byId.get(l.productId) || null }));
  }

  function groupName(productId) {
    const g = (store.parents || []).find((gg) => (gg.products || []).some((m) => m.productId === productId));
    return g ? { name: g.name, href: '/shop/parent/' + encodeURIComponent(g.slug || ''), member: g.products.find((m) => m.productId === productId) } : null;
  }

  function render(message) {
    const rows = resolved();
    if (!rows.length) {
      root.innerHTML = (message || '') + '<div class="store-empty"><p>Your cart is empty.</p><a class="btn btn-primary" href="/shop">Browse products</a></div>';
      return;
    }
    const valid = rows.filter((r) => r.product);
    const subtotal = valid.reduce((n, r) => n + r.product.priceCents * r.line.quantity, 0);
    const disc = promo && promo.status === 'applied' ? Math.min(discountCents(promo.cartDiscount), subtotal) : 0;
    const total = subtotal - disc;
    const gst = Math.round(valid.filter((r) => r.product.chargeGst).reduce((n, r) => n + r.product.priceCents * r.line.quantity, 0) / 1.1 * 0.1 * (subtotal ? total / subtotal : 1));
    const ship = store.shipping || {};
    const free = ship.freeShippingThresholdCents;
    const minOrder = ship.minOrderAmountCents || ship.minOrderAmountDeliveryCents || 0;
    const belowMin = minOrder && total < minOrder;
    const unavailable = rows.length - valid.length;

    root.innerHTML = (message || '') +
      (unavailable ? '<div class="cart-alert">' + unavailable + ' item' + (unavailable > 1 ? 's are' : ' is') + ' no longer available and will be removed at checkout.</div>' : '') +
      '<div class="cart-layout">' +
        '<div class="cart-lines">' +
          rows.map((r) => {
            if (!r.product) {
              return '<div class="cart-line is-unavailable"><div class="cart-line-info"><strong>Item no longer available</strong></div>' +
                '<button type="button" class="link-btn js-remove" data-id="' + S.esc(r.line.productId) + '">Remove</button></div>';
            }
            const p = r.product;
            const g = groupName(p.id);
            const label = S.packLabel(g && g.member && g.member.displayName, p.name);
            const img = S.imageFor(p.images, store);
            const href = g ? g.href : '/shop/product/' + encodeURIComponent(p.slug || '');
            return '<div class="cart-line">' +
              '<a class="cart-line-img' + (img.logo ? ' is-logo' : '') + '" href="' + href + '">' + (img.src ? '<img src="' + S.esc(img.src) + '" alt="">' : '') + '</a>' +
              '<div class="cart-line-info"><a href="' + href + '"><strong>' + S.esc(g ? g.name : p.name) + '</strong></a>' +
                '<span>' + S.esc(label && !/single/i.test(label) ? label + ' \u00b7 ' : '') + S.money(p.priceCents) + (label && !/single/i.test(label) ? ' per ' + label.split(' ')[0].toLowerCase() : ' each') + '</span>' +
                (p.inStock ? '' : '<span class="cart-warn">Currently out of stock</span>') + '</div>' +
              '<div class="qty qty-sm"><button type="button" class="qty-btn js-q" data-id="' + S.esc(p.id) + '" data-d="-1" aria-label="Decrease">&minus;</button>' +
                '<input type="number" min="0" value="' + r.line.quantity + '" class="js-qin" data-id="' + S.esc(p.id) + '" aria-label="Quantity">' +
                '<button type="button" class="qty-btn js-q" data-id="' + S.esc(p.id) + '" data-d="1" aria-label="Increase">+</button></div>' +
              '<div class="cart-line-total">' + S.money(p.priceCents * r.line.quantity) + '</div>' +
              '<button type="button" class="cart-remove js-remove" data-id="' + S.esc(p.id) + '" aria-label="Remove">&times;</button>' +
            '</div>';
          }).join('') +
          '<a class="link-btn" href="/shop">&larr; Continue shopping</a>' +
        '</div>' +
        '<aside class="cart-summary">' +
          '<h2>Order summary</h2>' +
          '<div class="sum-row"><span>Subtotal</span><span>' + S.money(subtotal) + '</span></div>' +
          (disc ? '<div class="sum-row sum-discount"><span>Promo (' + S.esc(promo.code) + ')</span><span>&minus;' + S.money(disc) + '</span></div>' : '') +
          '<div class="sum-row"><span>Shipping</span><span class="muted">Calculated at checkout</span></div>' +
          '<div class="sum-row sum-total"><span>Total</span><span>' + S.money(total) + '</span></div>' +
          '<p class="sum-gst">Includes ' + S.money(gst) + ' GST</p>' +
          (free ? (total >= free
            ? '<p class="sum-free">You qualify for free delivery.</p>'
            : '<p class="sum-free">Add ' + S.money(free - total) + ' more for free delivery.</p>') : '') +
          '<form class="promo" id="promoForm"><input type="text" id="promoInput" placeholder="Promo code" value="' + S.esc(promo ? promo.code : '') + '" aria-label="Promo code">' +
            '<button type="submit" class="btn btn-outline-dark btn-sm">Apply</button></form>' +
          (promo && promo.status && promo.status !== 'applied' ? '<p class="promo-msg is-error">' + S.esc(promo.error || 'That code isn\u2019t valid for this cart.') + '</p>' : '') +
          (promo && promo.status === 'applied' ? '<p class="promo-msg">Code ' + S.esc(promo.code) + ' applied. <button type="button" class="link-btn" id="promoRemove">Remove</button></p>' : '') +
          (store.checkout && store.checkout.beforeOrderNotification ? '<p class="cart-notice">' + S.esc(store.checkout.beforeOrderNotification) + '</p>' : '') +
          (belowMin ? '<p class="cart-alert">Minimum order is ' + S.money(minOrder) + '.</p>' : '') +
          '<button type="button" class="btn btn-primary btn-block" id="checkoutBtn"' + (belowMin || !valid.length ? ' disabled' : '') + '>Checkout securely</button>' +
          '<p class="sum-secure">You\u2019ll enter delivery details and pay on our secure checkout, powered by SupplyWise.</p>' +
          '<div id="checkoutMsg" aria-live="assertive"></div>' +
        '</aside>' +
      '</div>';
  }

  function promoItems() {
    return resolved().filter((r) => r.product).map((r) => ({
      productId: r.product.id, customerPriceCents: r.product.priceCents, quantity: r.line.quantity,
      chargeGST: !!r.product.chargeGst, categoryIds: r.product.categoryIds || [],
    }));
  }

  async function applyPromo(code) {
    code = (code || '').trim();
    if (!code) { promo = null; sessionStorage.removeItem(PROMO_KEY); render(); return; }
    try {
      const res = await S.api.promo({ promoCode: code, items: promoItems() });
      promo = { code, status: res.status, error: res.error, cartDiscount: res.cartDiscount };
    } catch (err) {
      promo = { code, status: 'error', error: err.message };
    }
    sessionStorage.setItem(PROMO_KEY, JSON.stringify(promo));
    render();
  }

  async function checkout(btn) {
    const msg = document.getElementById('checkoutMsg');
    btn.disabled = true; btn.textContent = 'Preparing checkout\u2026'; msg.innerHTML = '';
    try {
      // Refresh prices/stock before handing off.
      const fresh = await S.api.store();
      store = fresh; byId = new Map(store.products.map((p) => [p.id, p]));
      const lines = S.cart.lines().filter((l) => byId.has(l.productId));
      const oos = lines.filter((l) => !byId.get(l.productId).inStock);
      if (oos.length) throw new S.ApiError('Some items in your cart are out of stock. Please remove them to continue.', 422);
      if (!lines.length) throw new S.ApiError('Your cart is empty.', 400);
      const payload = {
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionsSelected: l.optionsSelected || [] })),
        pickupOrDelivery: store.shipping && store.shipping.shippingType === 'pickup-only' ? 'pickup' : 'delivery',
      };
      if (promo && promo.status === 'applied') payload.promoCode = promo.code;
      const res = await S.api.checkout(payload);
      if (!res || !res.checkoutUrl) throw new S.ApiError('Checkout didn\u2019t return a link. Please try again.', 500);
      location.href = res.checkoutUrl;
    } catch (err) {
      console.error('Checkout failed', err);
      render();
      const m = document.getElementById('checkoutMsg');
      m.innerHTML = '<p class="cart-alert">' + S.esc(err.message || 'Checkout failed.') +
        (err.status === 0 ? '' : '') + ' If this keeps happening, call us on <a href="tel:0415481375">0415 481 375</a>.</p>';
    }
  }

  root.addEventListener('click', (e) => {
    const q = e.target.closest('.js-q');
    if (q) { const l = S.cart.lines().find((x) => x.productId === q.dataset.id); S.cart.set(q.dataset.id, (l ? l.quantity : 0) + +q.dataset.d); return; }
    const r = e.target.closest('.js-remove');
    if (r) { S.cart.remove(r.dataset.id); return; }
    if (e.target.id === 'promoRemove') { promo = null; sessionStorage.removeItem(PROMO_KEY); render(); return; }
    if (e.target.id === 'checkoutBtn') checkout(e.target);
  });
  root.addEventListener('change', (e) => {
    if (e.target.classList.contains('js-qin')) S.cart.set(e.target.dataset.id, e.target.value);
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id === 'promoForm') { e.preventDefault(); applyPromo(document.getElementById('promoInput').value); }
  });
  document.addEventListener('cart:change', () => {
    if (!store) return;
    if (promo && promo.status === 'applied') applyPromo(promo.code); else render();
  });

  S.loadStore().then((data) => {
    store = data;
    byId = new Map(store.products.map((p) => [p.id, p]));
    render();
  }).catch((err) => {
    console.error(err);
    root.innerHTML = '<div class="store-empty">Sorry, we couldn\u2019t load your cart. ' + S.esc(err.message) + '</div>';
  });
})();
