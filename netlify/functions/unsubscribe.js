// Odhlášení z alertů přes unikátní token v URL.
// GET /.netlify/functions/unsubscribe?token=<uuid>
// Token je uložen v alerts.unsubscribe_token — jeden klik deaktivuje alert.

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const HTML_OK = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WingSpot – odhlášen</title></head>
<body style="margin:0;padding:40px 20px;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;">
  <div style="max-width:400px;margin:0 auto;">
    <div style="font-size:2.5rem;margin-bottom:16px;">✅</div>
    <h1 style="font-size:1.4rem;margin:0 0 12px;">Odhlášen ze zasílání</h1>
    <p style="color:#94a3b8;margin:0 0 24px;">Tento alert byl deaktivován. Přijít zpět?
      Alerty spravuješ v appce po přihlášení.</p>
    <a href="https://wingspot.netlify.app" style="display:inline-block;padding:10px 20px;
      background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-size:0.9rem;">
      Zpět do WingSpot ↗</a>
  </div>
</body></html>`;

const HTML_ERR = (msg) => `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><title>WingSpot – chyba</title></head>
<body style="margin:0;padding:40px 20px;background:#0f172a;font-family:system-ui,sans-serif;
  color:#e2e8f0;text-align:center;">
  <p style="color:#ef4444;">${msg}</p>
  <a href="https://wingspot.netlify.app" style="color:#0ea5e9;">Zpět do WingSpot</a>
</body></html>`;

export const handler = async (event) => {
  const { token } = event.queryStringParameters ?? {};
  if (!token) {
    return { statusCode: 400, headers: { "Content-Type": "text/html" }, body: HTML_ERR("Chybí token.") };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: { "Content-Type": "text/html" }, body: HTML_ERR("Chyba serveru.") };
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
    return { statusCode: 502, headers: { "Content-Type": "text/html" }, body: HTML_ERR("Nepodařilo se odhlásit. Zkus to znovu.") };
  }

  return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: HTML_OK };
};
