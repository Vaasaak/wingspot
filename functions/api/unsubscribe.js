function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function htmlOk(siteUrl) {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WingSpot – odhlášen</title></head>
<body style="margin:0;padding:40px 20px;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;">
  <div style="max-width:400px;margin:0 auto;">
    <div style="font-size:2.5rem;margin-bottom:16px;">✅</div>
    <h1 style="font-size:1.4rem;margin:0 0 12px;">Odhlášen ze zasílání</h1>
    <p style="color:#94a3b8;margin:0 0 24px;">Tento alert byl deaktivován. Přijít zpět?
      Alerty spravuješ v appce po přihlášení.</p>
    <a href="${siteUrl}" style="display:inline-block;padding:10px 20px;
      background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-size:0.9rem;">
      Zpět do WingSpot ↗</a>
  </div>
</body></html>`;
}

function htmlErr(msg, siteUrl) {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><title>WingSpot – chyba</title></head>
<body style="margin:0;padding:40px 20px;background:#0f172a;font-family:system-ui,sans-serif;
  color:#e2e8f0;text-align:center;">
  <p style="color:#ef4444;">${msg}</p>
  <a href="${siteUrl}" style="color:#0ea5e9;">Zpět do WingSpot</a>
</body></html>`;
}

export async function onRequest(context) {
  const { request, env } = context;

  const siteUrl     = env.SITE_URL ?? "https://wingspot.netlify.app";
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
  const htmlHeaders = { "Content-Type": "text/html" };

  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return new Response(htmlErr("Chybí token.", siteUrl), { status: 400, headers: htmlHeaders });
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response(htmlErr("Chyba serveru.", siteUrl), { status: 500, headers: htmlHeaders });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/alerts?unsubscribe_token=eq.${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders(serviceKey), Prefer: "return=minimal" },
      body: JSON.stringify({ active: false }),
    }
  );

  if (!res.ok) {
    return new Response(htmlErr("Nepodařilo se odhlásit. Zkus to znovu.", siteUrl), { status: 502, headers: htmlHeaders });
  }

  return new Response(htmlOk(siteUrl), { status: 200, headers: htmlHeaders });
}
