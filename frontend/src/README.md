# frontend/src/

Código fuente React.

```
src/
├── api/        # clientes HTTP del backend (auth.ts)
├── auth/       # login y guardia de rutas
├── layout/     # marco de las rutas privadas (enlace a cambiar contraseña, cerrar sesión)
├── settings/   # ajustes de cuenta (cambiar contraseña)
├── App.tsx     # rutas
└── main.tsx
```

`api/auth.ts` renueva la sesión sola: ante un 401 llama una vez a `/auth/refresh`
(serializado entre pestañas con Web Locks) y repite la petición; si falla, la sesión se da
por cerrada.

El resto de la estructura (bóvedas, editor, sync) se define en sus propias specs.
