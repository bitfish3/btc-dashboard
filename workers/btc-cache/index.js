// btc-cache — MVRV Z-Score 缓存代理：bitcoin-data.com 间歇返回 0KB，本 worker 取一次缓存 30min
// + KV 存 last-good（源失败保留上次好值），前端拿小包、免疫抽风。
// （SOPR/Puell 前端直取 looknode 正常，无需经此；worker→worker 同账号子请求被 CF error 1042 禁。）
// 输出：{mvrvz, ts}

const TTL_MS = 30 * 60 * 1000; // 30min
const SRC = { mvrvz: 'https://bitcoin-data.com/v1/mvrv-zscore' };

async function jget(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'btc-cache/1.0' } });
  return r.json();
}

async function refresh(prev) {
  const next = { ...prev };
  delete next._dbg; // 清除历史调试残留（避免 spread 永久带着）
  // MVRV Z-Score (bitcoin-data 间歇挂 → 失败保留 last-good)
  try { const a = await jget(SRC.mvrvz); const v = parseFloat(a?.[a.length - 1]?.mvrvZscore); if (!isNaN(v)) next.mvrvz = v; } catch (e) {}
  next.ts = Date.now();
  return next;
}

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    };
    const force = new URL(request.url).searchParams.has('refresh');
    let prev = {};
    try { prev = JSON.parse((await env.BTC_CACHE.get('latest')) || '{}'); } catch (e) {}

    if (force) {
      const next = await refresh(prev);
      ctx.waitUntil(env.BTC_CACHE.put('latest', JSON.stringify(next)));
      return new Response(JSON.stringify(next), { headers: cors });
    }

    const fresh = prev.ts && (Date.now() - prev.ts < TTL_MS);
    if (fresh) return new Response(JSON.stringify(prev), { headers: cors });

    if (prev.ts) {
      // 过期 → 先返回旧值（stale-while-revalidate），后台刷新
      ctx.waitUntil(refresh(prev).then(n => env.BTC_CACHE.put('latest', JSON.stringify(n))));
      return new Response(JSON.stringify(prev), { headers: cors });
    }

    // 无任何缓存 → 同步取一次
    const next = await refresh(prev);
    ctx.waitUntil(env.BTC_CACHE.put('latest', JSON.stringify(next)));
    return new Response(JSON.stringify(next), { headers: cors });
  },
};
