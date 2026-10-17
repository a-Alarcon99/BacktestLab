# Changelog

## Sin publicar

- API: precios con *stale-while-revalidate* (se sirven y refrescan en segundo plano hasta 15 min) y
  calentamiento de precios y velas desde `/health`.
- Ping externo (cron-job.org) cada 12 min de 12:00 a 01:00 (hora de España) para que la API
  gratuita de Render no se duerma (ver `DEPLOY.md`, Paso 7). `render.yaml` pasa a `plan: free`.

## 0.1.0 — Beta (2026-10-15)

Primera versión pública.

- Catálogo de activos con cotización en vivo y gráfico histórico (1h/4h/1d/1w/1M).
- Motor de backtesting: indicadores, cruces, patrones de velas y comprobación de contradicciones.
- Cuentas (email + verificación), invitados, planes y cuotas aplicadas en servidor.
- Estrategias propias en base de datos y estrategias predefinidas de solo lectura.
- Dos auditorías de seguridad (ver `SECURITY.md`). Pagos aún no disponibles (`/plans`).
