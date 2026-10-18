# Gira Sudáfrica M19 · Club Universitario de Córdoba

App web (se abre desde un link y se puede instalar en el celular) con el cronograma, la vestimenta, los avisos y la información útil de la gira (11 al 25 de noviembre de 2026).

- **App pública:** `/`. Tiene cuatro pantallas: Hoy, Días, Avisos e Info.
- **Panel de administración:** `/administrador`. No está enlazado desde la app y se entra con contraseña.

La contraseña está en `lib/store.js` (`ADMIN_PASSWORD`). Si en Vercel se define la variable de entorno `ADMIN_PASSWORD`, esa tiene prioridad.

## Publicar en Vercel

1. En Vercel: **Add New → Project**, importar este repositorio y hacer **Deploy**. No hace falta configurar nada.
2. Conectar la base de datos: en el proyecto entrar a **Storage → Create Database → Upstash (Redis)**, elegir el plan gratuito y conectarla al proyecto. Eso crea solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. **Redeploy**, para que el proyecto tome las variables nuevas.
4. Entrar a `https://<tu-dominio>/administrador` y guardar una vez. Mientras la base está vacía, la app usa el programa tentativo cargado en `lib/seed.js`.

## Cómo funciona

- Los datos se guardan en Upstash Redis y las fotos se achican en el celular antes de subirse.
- Todos los días arrancan **bloqueados**: desde el panel se desbloquean con el interruptor y se toca **Guardar**.
- Los bloques marcados como "Oculto" no se muestran aunque el día esté visible.
- La app consulta los datos cada 30 segundos, al volver a la pestaña y con el botón de actualizar.
- Los horarios se cargan en hora de Sudáfrica (SA) o de Argentina (AR), y cada persona elige en qué hora verlos.
- Funciona sin conexión: muestra lo último que descargó, con un aviso.
- Para simular un momento: `/?ahora=2026-11-17T10:30` (hora de Sudáfrica).
- **No cargar datos personales** (pasaportes, DNI, datos médicos, pagos individuales): el link es público.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | App pública |
| `administrador/` | Panel de administración |
| `api/data.js` | Datos públicos: solo días desbloqueados, sin bloques ni avisos ocultos |
| `api/admin.js` | Lee y guarda todo (requiere contraseña) |
| `api/photo.js` | Sube y sirve las fotos |
| `lib/store.js` | Base de datos, contraseña y validación |
| `lib/seed.js` | Programa tentativo inicial |
| `sw.js` | Modo sin conexión. **Subir `VERSION`** cada vez que se cambie la app pública |
| `icons/` | Logo e íconos |
