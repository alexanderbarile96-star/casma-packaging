// Casma — /shop/product/:slug and /shop/parent/:slug
(function () {
  'use strict';
  const S = window.CasmaStore;
  const root = document.getElementById('productRoot');
  const recsRoot = document.getElementById('recsRoot');
  const crumbs = document.getElementById('crumbs');

  const m = location.pathname.match(/^\/shop\/(product|parent)\/([^/]+)\/?$/);
  const qs = new URLSearchParams(location.search);
  const kind = m ? m[1] : (qs.get('parent') ? 'parent' : 'product');
  const slug = m ? decodeURIComponent(m[2]) : (qs.get('parent') || qs.get('slug') || '');

  function notFound(msg) {
    document.title = 'Product not found — Casma Beekeeping & Packaging';
    root.innerHTML = '<div class="store-empty"><h2>Product not found</h2><p>' + S.esc(msg || 'This product may no longer be available.') +
      '</p><a class="btn btn-primary" href="/shop">Back to shop</a></div>';
  }

  if (!slug) { notFound(); return; }

  Promise.all([S.loadStore(), kind === 'parent' ? S.api.parent(slug) : S.api.product(slug)])
    .then(([store, detail]) => {
      const visible = new Map(store.products.map((p) => [p.id, p]));
      let name, description, members, selectionLabel, groupImages = [], recIds = detail.recommendedProductIds || [], currentGroupId = null;

      if (kind === 'parent') {
        const g = detail.parent;
        currentGroupId = g.id;
        name = g.name; description = g.description; selectionLabel = g.selectionLabel || 'Pack size'; groupImages = g.images || [];
        const full = new Map((detail.products || []).map((p) => [p.id, p]));
        members = (g.products || [])
          .filter((mm) => visible.has(mm.productId))
          .map((mm) => {
            const p = { ...visible.get(mm.productId), ...(full.get(mm.productId) || {}) };
            return { product: p, label: S.packLabel(mm.displayName, p.name) };
          });
      } else {
        const p = detail.product;
        if (!visible.has(p.id)) { notFound(); return; }
        // If this product belongs to a group, send shoppers to the group page.
        if (detail.variantGroup && detail.variantGroup.slug) {
          location.replace('/shop/parent/' + encodeURIComponent(detail.variantGroup.slug));
          return;
        }
        name = p.name; description = p.description; selectionLabel = 'Pack size';
        members = [{ product: p, label: S.packLabel('', p.name) }];
      }
      if (!members.length) { notFound(); return; }

      let sel = members.find((x) => x.product.inStock) || members[0];
      const cat = (store.categories || []).find((c) => (sel.product.categoryIds || []).includes(c.id));
      crumbs.innerHTML = '<a href="/shop">Shop</a>' +
        (cat ? ' <span>/</span> <a href="/shop?category=' + S.slugify(cat.name) + '">' + S.esc(cat.name) + '</a>' : '') +
        ' <span>/</span> <span aria-current="page">' + S.esc(name) + '</span>';
      document.title = name + ' — Casma Beekeeping & Packaging';
      const md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute('content', (sel.product.description || name).replace(/<[^>]+>/g, ' ').slice(0, 155));

      const freeNote = S.FREE_SHIPPING_NOTE(store);
      root.innerHTML =
        '<div class="pdp">' +
          '<div class="pdp-gallery"><div class="pdp-main" id="pdpMain"></div><div class="pdp-thumbs" id="pdpThumbs"></div></div>' +
          '<div class="pdp-info">' +
            '<h1 class="pdp-title">' + S.esc(name) + '</h1>' +
            '<div class="pdp-price" id="pdpPrice"></div>' +
            (members.length > 1
              ? '<fieldset class="pdp-variants"><legend>' + S.esc(selectionLabel) + '</legend>' +
                  members.map((x, i) => '<label class="variant-pill' + (x.product.inStock ? '' : ' is-disabled') + '"><input type="radio" name="variant" value="' + i + '"' +
                    (x === sel ? ' checked' : '') + (x.product.inStock ? '' : ' disabled') + '><span>' + S.esc(x.label) + '</span></label>').join('') +
                '</fieldset>'
              : '') +
            '<div class="pdp-buy">' +
              '<div class="qty" aria-label="Quantity"><button type="button" class="qty-btn" data-d="-1" aria-label="Decrease">&minus;</button>' +
                '<input type="number" id="pdpQty" min="1" value="1" inputmode="numeric" aria-label="Quantity"><button type="button" class="qty-btn" data-d="1" aria-label="Increase">+</button></div>' +
              '<button type="button" class="btn btn-primary" id="pdpAdd">Add to cart</button>' +
            '</div>' +
            '<ul class="pdp-notes"><li>Shipping calculated at checkout' + (freeNote ? ' &middot; ' + S.esc(freeNote) : '') + '</li>' +
              '<li>Prices include GST</li><li>Need a pallet or trade pricing? <a href="/contact">Get a quote</a></li></ul>' +
            '<div class="pdp-desc prose" id="pdpDesc"></div>' +
            '<p class="pdp-sku" id="pdpSku"></p>' +
          '</div>' +
        '</div>';

      const mainEl = document.getElementById('pdpMain');
      const thumbsEl = document.getElementById('pdpThumbs');
      const addBtn = document.getElementById('pdpAdd');
      const qtyEl = document.getElementById('pdpQty');

      function gallery(images) {
        const imgs = (images && images.length) ? images : (groupImages.length ? groupImages : []);
        const logo = !imgs.length;
        const list = logo ? [store.supplier && store.supplier.image].filter(Boolean) : imgs;
        let idx = 0;
        const show = () => {
          mainEl.className = 'pdp-main' + (logo ? ' is-logo' : '');
          mainEl.innerHTML = list[idx] ? '<img src="' + S.esc(list[idx]) + '" alt="' + S.esc(name) + '">' : '';
          thumbsEl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === idx));
        };
        thumbsEl.innerHTML = list.length > 1 ? list.map((src, i) => '<button type="button" data-i="' + i + '"><img src="' + S.esc(src) + '" alt=""></button>').join('') : '';
        thumbsEl.onclick = (e) => { const b = e.target.closest('button'); if (b) { idx = +b.dataset.i; show(); } };
        show();
      }

      function renderSel() {
        const p = sel.product;
        const unit = S.unitNote(p.priceCents, sel.label);
        document.getElementById('pdpPrice').innerHTML =
          (p.onSale && p.basePriceCents ? '<s>' + S.money(p.basePriceCents) + '</s> ' : '') +
          '<strong>' + S.money(p.priceCents) + '</strong>' +
          '<span>' + S.esc(/single/i.test(sel.label) || !sel.label ? 'each' : sel.label) + (unit ? ' &middot; ' + unit : '') + '</span>';
        document.getElementById('pdpDesc').innerHTML = S.sanitize(p.description || description || '');
        document.getElementById('pdpSku').textContent = p.sku ? 'SKU: ' + p.sku : '';
        addBtn.disabled = !p.inStock;
        addBtn.textContent = p.inStock ? 'Add to cart' : 'Sold out';
        gallery(p.images);
      }

      root.addEventListener('change', (e) => {
        if (e.target.name === 'variant') { sel = members[+e.target.value]; renderSel(); }
      });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('.qty-btn');
        if (b) qtyEl.value = Math.max(1, (parseInt(qtyEl.value, 10) || 1) + +b.dataset.d);
      });
      addBtn.addEventListener('click', () => {
        const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
        S.cart.add(sel.product.id, q);
        S.toast('Added ' + q + ' \u00d7 ' + name + (sel.label && !/single/i.test(sel.label) ? ' (' + sel.label + ')' : '') + ' to your cart.', '/cart');
      });
      renderSel();

      // Recommendations: API suggestions, topped up with newest in-stock items.
      const items = S.buildItems(store);
      const excludeIds = new Set(members.map((x) => x.product.id));
      const recs = [];
      const push = (it) => { if (it && !recs.includes(it) && recs.length < 4 && it.inStock && !it.members.some((x) => excludeIds.has(x.product.id)) && (!currentGroupId || it.key !== 'g:' + currentGroupId)) recs.push(it); };
      recIds.forEach((id) => push(items.find((it) => it.members.some((x) => x.product.id === id))));
      const sameCat = items.filter((it) => cat && it.categoryIds.includes(cat.id)).sort((a, b) => b.createdAt - a.createdAt);
      sameCat.forEach(push);
      items.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(push);
      if (recs.length) {
        recsRoot.innerHTML = '<div class="recs"><h2>You may also like</h2><div class="sw-grid">' + recs.map((it) => S.cardHTML(it, store)).join('') + '</div></div>';
        S.bindQuickAdd(recsRoot);
      }
    })
    .catch((err) => {
      console.error(err);
      if (err.status === 404) notFound();
      else root.innerHTML = '<div class="store-empty">Sorry, we couldn\u2019t load this product. ' + S.esc(err.message) + ' <a href="/shop">Back to shop</a></div>';
    });
})();
