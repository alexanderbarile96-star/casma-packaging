// Same-origin proxy to the SupplyWise Retail Storefront API.
// Browser calls /api/sw/<path>; this forwards server-to-server so ad/privacy
// blockers can't interfere with checkout. See SupplyWise builder guide §8 A7.
const UPSTREAM = 'https://actions.supplywise.com.au/api/retail/v1/casmapackaging';
const ALLOWED = /^(store|products(\/.*)?|categories|filters|shipping|promo-code|checkout|auth\/token|account(\/.*)?)$/;

module.exports = async (req, res) => {
  let path = req.query.path;
  if (Array.isArray(path)) path = path.join('/');
  path = String(path || '').split('/').filter(Boolean);
  const joined = path.join('/');
  if (!ALLOWED.test(joined) || !['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
    return;
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
  }
  const url = UPSTREAM + '/' + path.map(encodeURIComponent).join('/') + (qs.toString() ? '?' + qs : '');
  const headers = { Accept: 'application/json' };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  let body;
  if (req.method !== 'GET') {
    body = typeof req.body === 'string' ? req.body : (req.body == null ? undefined : JSON.stringify(req.body));
  }
  try {
    const up = await fetch(url, { method: req.method, headers, body });
    const text = await up.text();
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
    // Short CDN cache for catalogue reads; never cache writes or account data.
    if (req.method === 'GET' && !joined.startsWith('account')) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    else res.setHeader('Cache-Control', 'no-store');
    res.status(up.status).send(text);
  } catch (err) {
    console.error('SupplyWise proxy error', err);
    res.status(502).json({ error: { code: 'upstream_unreachable', message: 'Could not reach the store service. Please try again.' } });
  }
};
