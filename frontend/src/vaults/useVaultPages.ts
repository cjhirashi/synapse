import { useCallback, useEffect, useRef, useState } from "react";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";

type Status = "loading" | "ready" | "error";

/** Bóvedas por página: las mismas que daba la API REST de 0003 (RF-024). */
export const PAGE_SIZE = 50;

/**
 * Lista de bóvedas activas o de la papelera leída de la réplica local (SPEC-0003 RF-018,
 * RF-028; SPEC-0005 RF-009; PLAN-0005 §2.5, P-1).
 *
 * La réplica es local, así que no hay cursor: se lee la lista entera, ya ordenada por
 * `vaultStore`, y "Cargar más" sólo muestra `PAGE_SIZE` más de lo leído.
 *
 * Cada escritura en la réplica (de la UI, del pull o de otra pestaña) cambia `dataVersion`
 * y la lista se vuelve a leer en silencio, sin pasar por "Cargando…" ni perder cuántas se
 * estaban viendo. Cada lectura abre una generación nueva: una respuesta de una generación
 * anterior se descarta en vez de pisar la más reciente (PLAN-0003 §15, VA-9).
 */
export function useVaultPages(deleted: boolean) {
  const { vaults, dataVersion } = useSync();
  const [all, setAll] = useState<Vault[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<Status>("loading");
  const generation = useRef(0);

  /** Lee la réplica; con `silent` conserva lo mostrado mientras tanto (recarga en vivo). */
  const read = useCallback(
    async (silent: boolean) => {
      const current = ++generation.current;
      if (!silent) setStatus("loading");
      try {
        const items = await vaults.list({ deleted });
        if (current !== generation.current) return;
        setAll(items);
        setStatus("ready");
      } catch (err) {
        if (current !== generation.current) return;
        console.error(err);
        setStatus("error");
      }
    },
    [vaults, deleted],
  );

  const reload = useCallback(() => read(false), [read]);

  // Primera lectura al montar (o con otra réplica u otra lista).
  useEffect(() => {
    void read(false);
  }, [read]);

  // Recarga en vivo; la primera ejecución la cubre la lectura de arriba.
  const seenVersion = useRef(dataVersion);
  useEffect(() => {
    if (seenVersion.current === dataVersion) return;
    seenVersion.current = dataVersion;
    void read(true);
  }, [dataVersion, read]);

  function loadMore() {
    setVisible((count) => count + PAGE_SIZE);
  }

  /** Quita de la vista una bóveda que salió de esta lista (borrada o restaurada desde aquí). */
  function remove(id: string) {
    setAll((current) => current.filter((vault) => vault.id !== id));
  }

  return { items: all.slice(0, visible), hasMore: all.length > visible, status, loadMore, reload, remove };
}
