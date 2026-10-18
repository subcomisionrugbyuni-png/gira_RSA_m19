# Gira Sudáfrica M19 · Club Universitario de Córdoba

App web (se abre desde un link y se puede instalar en el celular) con el cronograma, la vestimenta, los avisos y la información útil de la gira (11 al 25 de noviembre de 2026).

- **App pública:** `/`. Tiene cuatro pantallas: Hoy, Días, Avisos e Info.
- **Panel de administración:** `/administrador`. No está enlazado desde la app y se entra con contraseña.

La contraseña está escrita en `supabase/migrations/20261018000000_gira.sql` (función `clave_ok`) y la verifica la base de datos.

## Puesta en marcha (una sola vez)

1. **Supabase**: en el proyecto `gvokucecvdhjhwvktlut` entrar a **SQL Editor → New query**, pegar todo el contenido de `supabase/migrations/20261018000000_gira.sql` y tocar **Run**. Con la CLI, `supabase link --project-ref gvokucecvdhjhwvktlut` y después `supabase db push` hacen lo mismo.
2. **Vercel**: **Add New → Project**, importar este repositorio y hacer **Deploy**. No hace falta configurar variables: la URL de Supabase y la clave publishable están en `lib/store.js`.
3. Entrar a `https://<tu-dominio>/administrador` y guardar una vez. Mientras la base está vacía, la app usa el programa tentativo cargado en `lib/seed.js`.

Para cambiar la contraseña: editar `clave_ok` en el SQL y volver a correr solo esa función en el SQL Editor.

## Cómo funciona

- Los datos y las fotos se guardan en Supabase. Las tablas están cerradas y solo se accede por funciones; las que escriben piden la contraseña. Las fotos se achican en el celular antes de subirse.
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
| `lib/store.js` | Conexión a Supabase y validación |
| `supabase/migrations/` | Tablas y funciones de la base (incluye la contraseña) |
| `lib/seed.js` | Programa tentativo inicial |
| `sw.js` | Modo sin conexión. **Subir `VERSION`** cada vez que se cambie la app pública |
| `icons/` | Logo e íconos |
