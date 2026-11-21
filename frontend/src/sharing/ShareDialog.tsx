/** Diálogo «Compartir»: quién tiene acceso a la bóveda, invitar y cambiar o quitar permisos (H-064 F5b). */
import { Share2 } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import DialogFrame from "../editor/DialogFrame";
import { PROBLEM } from "../api/problems";
import { inviteMember, listMembers, removeMember, updateMemberGrants, type Grant, type Member } from "./sharingApi";
import GrantsEditor from "./GrantsEditor";
import { grantsText } from "./grants";
import "./sharing.css";

interface Props {
  vaultId: string;
  vaultName: string;
  folders: string[];
  onClose: () => void;
}

const READ_ALL: Grant[] = [{ folder: "*", level: "lectura" }];
const GENERIC = "No se pudo completar. Inténtalo de nuevo.";

function inviteError(err: unknown): string {
  const { status, type } = err as { status?: number; type?: string };
  if (status === 404 && type === PROBLEM.inviteeNotFound) return "No hay ninguna cuenta con ese correo.";
  if (status === 409 && type === PROBLEM.memberAlreadyExists) return "Esa persona ya tiene una invitación o acceso.";
  if (status === 409 && type === PROBLEM.memberLimitReached) return "Esta bóveda ya tiene 50 personas.";
  if (status === 422) return "Revisa el correo y los permisos (no puedes invitarte a ti mismo).";
  return GENERIC;
}

export default function ShareDialog({ vaultId, vaultName, folders, onClose }: Props) {
  const id = useId();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<Grant[]>(READ_ALL);
  const [inviteKey, setInviteKey] = useState(0);
  const [inviteNote, setInviteNote] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; grants: Grant[] } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setMembers((await listMembers(vaultId)).items);
    } catch {
      setFailed(true);
    }
  }, [vaultId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reinvitar a alguien con acceso terminado reabre su misma fila: se reemplaza por id en vez de duplicarla.
  const upsert = (member: Member) => setMembers((list) => (list ?? []).some((m) => m.id === member.id) ? (list ?? []).map((m) => (m.id === member.id ? member : m)) : [...(list ?? []), member]);

  async function run(action: () => Promise<void>, onError: (err: unknown) => void) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const memberFailure = (err: unknown) => {
    const status = (err as { status?: number }).status;
    setMemberError(status === 404 || status === 409 ? "Ese acceso ya cambió. Se actualizó la lista." : GENERIC);
    if (status === 404 || status === 409) void load();
  };

  const invite = () =>
    run(
      async () => {
        const to = email.trim();
        upsert(await inviteMember(vaultId, to, grants));
        setEmail("");
        setGrants(READ_ALL);
        setInviteKey((k) => k + 1);
        setInviteNote({ kind: "status", text: `Invitación enviada a ${to}.` });
      },
      (err) => setInviteNote({ kind: "alert", text: inviteError(err) }),
    );

  const saveGrants = (memberId: string, next: Grant[]) =>
    run(async () => {
      upsert(await updateMemberGrants(vaultId, memberId, next));
      setEditing(null);
    }, memberFailure);

  const remove = (memberId: string) =>
    run(async () => {
      await removeMember(vaultId, memberId);
      setMembers((list) => (list ?? []).filter((m) => m.id !== memberId));
      setConfirming(null);
    }, memberFailure);

  const shown = (members ?? []).filter((m) => m.status === "pendiente" || m.status === "activo");

  return (
    <DialogFrame
      titleId={`${id}-title`}
      title="Compartir"
      subtitle={vaultName}
      glyph={Share2}
      size="lg"
      backdropClosable={false}
      onCancel={onClose}
      actions={<button type="button" className="shared-btn" onClick={onClose}>Cerrar</button>}
    >
      <div className="share-dialog-body">
        {failed && (
          <div role="alert" className="share-banner">
            No se pudieron cargar las personas con acceso.
            <button type="button" onClick={() => void load()}>Reintentar</button>
          </div>
        )}
        {members === null && !failed && <p>Cargando…</p>}
        {memberError && <p role="alert" className="share-banner">{memberError}</p>}

        {shown.length > 0 && (
          <section className="share-section">
            <h2>Personas con acceso</h2>
            <ul className="share-members">
              {shown.map((member) => {
                const name = member.user?.display_name || member.user?.email || "Sin nombre";
                const pending = member.status === "pendiente";
                return (
                  <li key={member.id} className="share-member">
                    <div className="share-member-main">
                      <span className="share-member-name">{name}</span>
                      {member.user?.display_name && <span className="share-member-email">{member.user.email}</span>}
                      <span className="share-pill" data-status={member.status}>{pending ? "Pendiente" : "Activo"}</span>
                      {editing?.id !== member.id && <span className="share-member-grants">{grantsText(member.grants)}</span>}
                    </div>

                    {editing?.id === member.id ? (
                      <div className="share-member-editor">
                        <GrantsEditor value={editing.grants} onChange={(next) => setEditing({ id: member.id, grants: next })} folders={folders} disabled={busy} idPrefix={`${id}-edit`} />
                        <div className="shared-actions">
                          <button type="button" className="shared-btn" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
                          <button type="button" className="shared-btn shared-btn--primary" disabled={busy} onClick={() => void saveGrants(member.id, editing.grants)}>Guardar permisos</button>
                        </div>
                      </div>
                    ) : confirming === member.id ? (
                      <div className="share-member-confirm">
                        <p>¿Quitar el acceso de {name}?</p>
                        <div className="shared-actions">
                          <button type="button" className="shared-btn" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button>
                          <button type="button" className="shared-btn shared-btn--danger" disabled={busy} onClick={() => void remove(member.id)}>Quitar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="shared-actions">
                        <button type="button" className="shared-btn" disabled={busy} onClick={() => { setMemberError(null); setEditing({ id: member.id, grants: [...member.grants] }); }}>Permisos</button>
                        <button type="button" className="shared-btn shared-btn--danger" disabled={busy} onClick={() => { setMemberError(null); setConfirming(member.id); }}>{pending ? "Cancelar invitación" : "Quitar acceso"}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {members !== null && (
          <section className="share-section">
            <h2>Invitar a alguien</h2>
            <div className="share-invite-form">
              <div className="share-field">
                <label htmlFor={`${id}-email`}>Correo de la persona</label>
                <input
                  id={`${id}-email`}
                  type="email"
                  className="share-input"
                  autoComplete="off"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  disabled={busy}
                  onChange={(e) => { setEmail(e.target.value); setInviteNote(null); }}
                />
              </div>
              <GrantsEditor key={inviteKey} value={grants} onChange={setGrants} folders={folders} disabled={busy} idPrefix={`${id}-invite`} />
              <div className="share-form-actions">
                <button type="button" className="shared-btn shared-btn--primary" disabled={busy || !email.trim()} onClick={() => void invite()}>Invitar</button>
                {inviteNote && <p role={inviteNote.kind} className="share-banner">{inviteNote.text}</p>}
              </div>
            </div>
          </section>
        )}
      </div>
    </DialogFrame>
  );
}
