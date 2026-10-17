---
id: PLAN-NNN
tipo: plan
feature: NNN-slug
estado: draft
aprobaciones:
  fase_2: pendiente
actualizado: ‹YYYY-MM-DD›
---

# PLAN-NNN · ‹Nombre›

> El *cómo*. Traduce cada `RF-` al **patrón de arquitectura elegido en la Génesis**
> (Constitución Art. 1–2), de forma concreta.

## 0. Gates de simplicidad
- [ ] Simplicity — ¿la solución más simple que funciona?
- [ ] Anti-Abstraction — ¿sin capas especulativas?
- [ ] Integration-First — ¿contratos antes que implementación?

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | ‹confirmación de conformidad con el patrón elegido› |
| Art. 5 (seguridad) | ‹…› |

## 2. Arquitectura de la feature  *(según el patrón elegido)*
> Encabezados de ejemplo (hexagonal). Si el patrón es por-capas / Clean / Onion, usar
> sus zonas equivalentes (p. ej. por-capas: modelo/repositorio · servicio · ruta · flujo).
### Núcleo de negocio
- Entidades, invariantes, reglas.
### Coordinación (casos de uso / fronteras de entrada)
- ‹caso de uso› ← implementa `RF-…`
### Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| ‹…› | ‹…› | ‹…› |

## 3. Modelo de datos
- Esquemas, migraciones (y su orden), índices.

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| ‹openapi.yaml› | ‹…› | Spectral, oasdiff, Schemathesis |

## 5. Estrategia de pruebas (por zona del patrón)
| Zona | Qué se prueba | Herramienta |
|---|---|---|
| ‹núcleo› | reglas puras | unit |
| ‹coordinación› | orquestación | unit + dobles |
| ‹fronteras› | cumplen su contrato | integración |
| ‹sistema› | recorrido completo | e2e |

## 6. Secuenciación de archivos
- Orden de creación: **tests antes que código**.

## 7. Seguimiento de complejidad  *(opcional)*
| Excepción a la simplicidad | Justificación |
|---|---|

## 8. Impacto en documentación  (obligatorio — Constitución Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| ‹docs/…› | ‹…› | ‹actualizar …› |

Si la feature no toca documentación: `Sin impacto en documentación — verificado contra
el mapa del Artículo 11`.

## 9. Implementación por requisito
### Implementación de RF-001
- Componentes / fronteras / tests que lo cubren (nombra los archivos → van a `covers`).
### Implementación de RF-002
- …
