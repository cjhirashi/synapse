/** Botón de la franja de la bóveda que abre el diálogo «Compartir» (H-064 F5b). */
import { Share2 } from "lucide-react";
import { useContext, useState } from "react";
import { MeContext } from "../auth/RequireAuth";
import { useVaultAccess } from "../notes/useVaultAccess";
import ShareDialog from "./ShareDialog";
import { folderOptions } from "./folderOptions";

interface Props {
  vaultId: string;
  vaultName: string;
  notes: ReadonlyArray<{ path: string }>;
}

export default function ShareButton({ vaultId, vaultName, notes }: Props) {
  const { isOwner } = useVaultAccess();
  const canShare = useContext(MeContext)?.can_share_vaults ?? false;
  const [open, setOpen] = useState(false);
  if (!isOwner || !canShare) return null;
  return (
    <>
      <button type="button" className="note-nav-button vault-share-button" aria-label="Compartir esta bóveda" title="Compartir" onClick={() => setOpen(true)}>
        <Share2 size={16} aria-hidden="true" />
      </button>
      {open && <ShareDialog vaultId={vaultId} vaultName={vaultName} folders={folderOptions(notes.map((n) => n.path))} onClose={() => setOpen(false)} />}
    </>
  );
}
