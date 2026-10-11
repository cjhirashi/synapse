# frontend/src/

Código fuente React.

```
src/
├── api/        # clientes HTTP del backend (auth.ts) y errores de la API (problems.ts)
├── auth/       # login y guardia de rutas
├── layout/     # marco de las rutas privadas (enlace a cambiar contraseña, cerrar sesión)
├── settings/   # ajustes de cuenta (cambiar contraseña)
├── App.tsx     # rutas
└── main.tsx
```

`api/auth.ts` renueva la sesión sola: ante un 401 llama una vez a `/auth/refresh`
(serializado entre pestañas con Web Locks) y repite la petición; si falla, la sesión se da
por cerrada (`RequireAuth` y las páginas que reciben ese 401 llevan a `/login`).

Los errores de la API llegan como Problem Details (SPEC-0004): `api/problems.ts` define
`ApiError` (`status`, `type`, `title`, `detail`, `errors`) y `parseProblem`, que tolera
cuerpos no JSON. La UI decide por `type` —con las constantes `PROBLEM.*`— o por `status`
cuando basta (401), y muestra sus propios textos en español; `title`/`detail` vienen en inglés.

El resto de la estructura (bóvedas, editor, sync) se define en sus propias specs.
