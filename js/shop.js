// Casma — /shop product grid
(function () {
  'use strict';
  const S = window.CasmaStore;
  const grid = document.getElementById('productGrid');
  const catsEl = document.getElementById('shopCats');
  const searchEl = document.getElementById('shopSearch');
  const sortEl = document.getElementById('shopSort');
  const countEl = document.getElementById('shopCount');

  const params = new URLSearchParams(location.search);
  const state = { category: params.get('category') || 'all', q: params.get('q') || '', sort: params.get('sort') || 'featured' };
  let store, items, cats;

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.category !== 'all') p.set('category', state.category);
    if (state.q) p.set('q', state.q);
    if (state.sort !== 'featured') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', '/shop' + (qs ? '?' + qs : ''));
  }

  function renderCats() {
    const btn = (slug, name, n) => '<button type="button" role="tab" class="shop-cat' + (state.category === slug ? ' active' : '') +
      '" data-cat="' + slug + '" aria-selected="' + (state.category === slug) + '">' + S.esc(name) + ' <span>' + n + '</span></button>';
    catsEl.innerHTML = btn('all', 'All', items.length) +
      cats.map((c) => btn(c.slug, c.name, items.filter((i) => i.categoryIds.includes(c.id)).length)).join('');
  }

  function render() {
    const cat = cats.find((c) => c.slug === state.category);
    if (state.category !== 'all' && !cat) state.category = 'all';
    const q = state.q.trim().toLowerCase();
    let list = items.filter((i) => (!cat || i.categoryIds.includes(cat.id)) &&
      (!q || (i.name + ' ' + i.members.map((m) => m.product.sku + ' ' + m.label).join(' ')).toLowerCase().includes(q)));

    const natural = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
    if (state.sort === 'price-asc') list.sort((a, b) => a.priceCents - b.priceCents || natural(a, b));
    else if (state.sort === 'price-desc') list.sort((a, b) => b.priceCents - a.priceCents || natural(a, b));
    else if (state.sort === 'name') list.sort(natural);
    else {
      const catRank = (i) => { const k = cats.findIndex((c) => i.categoryIds.includes(c.id)); return k < 0 ? 99 : k; };
      list.sort((a, b) => (b.inStock - a.inStock) || (catRank(a) - catRank(b)) || (a.sortIndex - b.sortIndex) || natural(a, b));
    }

    renderCats();
    countEl.textContent = list.length + (list.length === 1 ? ' product' : ' products') + (cat ? ' in ' + cat.name : '');
    grid.innerHTML = list.length
      ? list.map((i) => S.cardHTML(i, store)).join('')
      : '<div class="store-empty">No products match your search. <button type="button" class="link-btn" id="clearSearch">Clear search</button></div>';
    syncUrl();
  }

  catsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.shop-cat');
    if (!b) return;
    state.category = b.dataset.cat;
    render();
  });
  let t;
  searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = searchEl.value; render(); }, 150); });
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; render(); });
  grid.addEventListener('click', (e) => {
    if (e.target.id === 'clearSearch') { state.q = ''; searchEl.value = ''; render(); }
  });
  S.bindQuickAdd(grid);

  searchEl.value = state.q;
  sortEl.value = state.sort;

  S.loadStore().then((data) => {
    store = data;
    items = S.buildItems(store);
    cats = (store.categories || [])
      .slice().sort((a, b) => (a.sortIndex - b.sortIndex) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, slug: S.slugify(c.name) }))
      .filter((c) => items.some((i) => i.categoryIds.includes(c.id)));
    render();
  }).catch((err) => {
    console.error(err);
    grid.innerHTML = '<div class="store-empty">Sorry, we couldn\u2019t load the shop right now. ' + S.esc(err.message) +
      ' <br><a href="/contact">Contact us</a> or call <a href="tel:0415481375">0415 481 375</a> to order.</div>';
  });
})();
