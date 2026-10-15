# Despliegue de BacktestLab 0.1.0 (Beta)

Arquitectura: **Vercel** (web, `backtestlab.xyz`) + **Render** (API, `api.backtestlab.xyz`) +
**Supabase** (BD, ya existente) + **Resend** (emails). Dominio en Porkbun.

## 0. Antes de empezar: genera dos secretos

En PowerShell (uno para cada variable; guárdalos en un gestor de contraseñas):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

- `BETTER_AUTH_SECRET` → un valor nuevo para producción (no reutilices el local).
- `INTERNAL_API_KEY`  → otro valor, **idéntico** en Vercel y en Render.

## 1. Base de datos (Supabase)

Aplica las migraciones al proyecto de producción desde tu PC:

```powershell
cd apps\web
# .env.local con DIRECT_DATABASE_URL apuntando a la BD de producción
npm run db:migrate
```

En Supabase → Authentication/Settings, deja el Data API sin exponer las tablas (RLS ya está activo).
Considera un proyecto Supabase separado para producción si ahora usas el mismo que en desarrollo.

## 2. Correo (Resend)

1. Crea cuenta en resend.com → *Domains* → añade `backtestlab.xyz`.
2. Resend te dará registros DNS (SPF/DKIM). Añádelos en Porkbun → *DNS* del dominio.
3. Cuando esté "Verified", crea una *API Key* → será `RESEND_API_KEY`.
4. `MAIL_FROM` = `BacktestLab <no-reply@backtestlab.xyz>`.

Sin dominio verificado solo se pueden enviar correos a tu propia dirección.

## 3. API en Render

1. render.com → *New* → *Blueprint* → conecta tu repo de GitHub (usa `render.yaml`).
2. Rellena los secretos que pide: `DATABASE_URL` (pooler, puerto 6543), `INTERNAL_API_KEY`,
   `COINGECKO_API_KEY` (opcional).
3. Espera al deploy; comprueba `https://<tu-servicio>.onrender.com/health`.
4. Render → servicio → *Settings → Custom Domains* → añade `api.backtestlab.xyz`. Render te
   indicará un registro **CNAME**; créalo en Porkbun (*DNS* → `CNAME`, host `api`).

## 4. Web en Vercel

1. vercel.com → *Add New → Project* → importa el repo.
2. **Root Directory: `apps/web`** (Framework: Next.js se detecta solo).
3. *Environment Variables* (Production):

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | pooler Supabase (6543) |
| `BETTER_AUTH_SECRET` | secreto del paso 0 |
| `BETTER_AUTH_URL` | `https://backtestlab.xyz` |
| `NEXT_PUBLIC_APP_URL` | `https://backtestlab.xyz` |
| `NEXT_PUBLIC_API_URL` | `https://api.backtestlab.xyz` |
| `API_URL` | `https://api.backtestlab.xyz` |
| `INTERNAL_API_KEY` | idéntica a la de Render |
| `TRUSTED_PROXY_HOPS` | `1` |
| `RESEND_API_KEY` | del paso 2 |
| `MAIL_FROM` | `BacktestLab <no-reply@backtestlab.xyz>` |

4. *Deploy*. (El build necesita `DATABASE_URL` porque pre-renderiza el catálogo.)
5. Vercel → *Settings → Domains* → añade `backtestlab.xyz` y `www.backtestlab.xyz`. Vercel te
   dirá qué registros crear en Porkbun (normalmente `A` `76.76.21.21` para el raíz y `CNAME`
   `cname.vercel-dns.com` para `www`). Borra antes los registros por defecto de Porkbun
   (ALIAS/CNAME de "parking") que choquen.

## 5. Protección extra (muy recomendable)

- Vercel → *Firewall*: regla de *rate limit* para `/api/auth/*` y `/api/backtests/run`.
- Vercel y Supabase: activa *Spend Management* / límites de gasto. Resend: límite mensual.
- Captcha (Turnstile) en registro: pendiente (ver `SECURITY.md`).

## 6. Prueba final

1. `https://backtestlab.xyz` carga y muestra precios.
2. Crear cuenta → llega el correo → verificar → iniciar sesión.
3. Ejecutar un backtest desde un activo.
4. `https://api.backtestlab.xyz/docs` debe dar 404 (documentación desactivada).
5. Etiqueta la versión: `git tag v0.1.0 && git push --tags`.

## Notas

- Plan `starter` de Render (≈7 $/mes): el plan gratuito se "duerme" y los backtests fallarían.
- Pagos: aún no existen; `/plans` muestra "próximamente".
