import { useEffect, useState } from "react";
import { SW_UPDATE_EVENT, applyUpdate, pendingUpdate } from "./serviceWorker";

/** Banner discreto: hay una versión nueva de la app; se aplica solo cuando la persona lo decide. */
export default function UpdateNotice() {
  const [visible, setVisible] = useState(pendingUpdate());
  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(SW_UPDATE_EVENT, show);
    return () => window.removeEventListener(SW_UPDATE_EVENT, show);
  }, []);
  if (!visible) return null;
  return (
    <div className="pwa-update" role="status">
      <span>Hay una versión nueva de Synapse.</span>
      <button type="button" onClick={applyUpdate}>Actualizar</button>
      <button type="button" onClick={() => setVisible(false)} aria-label="Cerrar aviso">Después</button>
    </div>
  );
}
