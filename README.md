# MetaSpy

Proyecto React (Vite) para consultar anuncios desde **Meta Ad Library API** (`ads_archive`).

## 1) Ejecutar el proyecto

```bash
npm install
copy .env.example .env
npm run dev
```

## 2) Variables necesarias

En `.env` configura:

```env
VITE_META_ACCESS_TOKEN=TU_TOKEN
VITE_META_APP_ID=TU_APP_ID
VITE_META_GRAPH_BASE_URL=https://graph.facebook.com
VITE_META_GRAPH_API_VERSION=v20.0
VITE_META_DEFAULT_PAGE_SIZE=100
VITE_META_GLOBAL_REACHED_COUNTRIES=US,CA,MX,CO,...
```

`VITE_META_ACCESS_TOKEN` es opcional si prefieres pegar el token directamente en la UI.

## 3) Datos que necesitas para conectarte/autenticarte

- `App ID` de Meta (el de tu aplicación)
- `Access Token` con permisos válidos para consultar la Ad Library API
- App en modo `Live` + permisos aprobados para uso fuera de desarrollo (según el caso)

## 4) Dónde ubicar esos datos en Meta Developers

1. Entra a [Meta for Developers](https://developers.facebook.com/).
2. Ve a **My Apps** y abre tu app (`App ID` arriba del panel principal).
3. En **Tools > Graph API Explorer** genera un token temporal de usuario.
4. Selecciona tu app, agrega los permisos requeridos y genera token.
5. Si necesitas larga duración, intercámbialo vía endpoint OAuth de Graph API.
6. Revisa en **App Review** y **Permissions and Features** que tu app/permisos estén aprobados para producción (`Live`).

## 5) Notas importantes

- Este proyecto consume la API desde frontend para acelerar pruebas.
- El token se puede guardar en `localStorage` desde la interfaz para evitar editar `.env`.
- Si el país en el formulario está vacío/ALL, se usa la lista global de países definida en `VITE_META_GLOBAL_REACHED_COUNTRIES`.

## 6) Endpoint usado

- `GET https://graph.facebook.com/{version}/ads_archive`

Parámetros base implementados:
- `search_terms`
- `ad_reached_countries`
- `ad_type`
- `fields`
- `limit`
- `access_token`
