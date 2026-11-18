/**
 * Control de publicación de un documento (H-035): botón en la cabecera del editor para abrir el diálogo
 * de publicación con tres vistas (no publicado, publicado, confirmar despublicación).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Copy, Check, ExternalLink, Globe, Info, TriangleAlert } from "lucide-react";
import DialogFrame from "../editor/DialogFrame";
import { setFileVisibility } from "../files/uploadFile";
import { checkPublication, publishNote, republishNote, unpublishNote, setPublicationExpiry, publicUrl, publicationErrorMessage, type PublicationStatus, type PublicationCheck } from "./publicationApi";
import { cdmxInputToIso, isoToCdmxInput, defaultExpiryInput, expiryError, formatCdmx } from "./cdmxTime";
import ExpiryPicker from "./ExpiryPicker";
import "./publish-control.css";

interface Props {
  vaultId: string;
  noteId: string;
  status: PublicationStatus;
  onStatus: (status: PublicationStatus) => void;
  getHtml: () => string | null;
}

type View = "unpublished" | "published" | "confirm-unpublish";

export default function PublishControl({ vaultId, noteId, status, onStatus, getHtml }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("unpublished");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<PublicationCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [visBusy, setVisBusy] = useState<ReadonlySet<string>>(new Set());
  const [visError, setVisError] = useState<string | null>(null);
  const [enableExpiry, setEnableExpiry] = useState(false);
  const [expiryInput, setExpiryInput] = useState("");
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryEditInput, setExpiryEditInput] = useState("");
  const linkRef = useRef<HTMLInputElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryPickerId = useId();
  const expiryEditId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setEnableExpiry(false);
    setExpiryInput(defaultExpiryInput());
    setEditingExpiry(false);
    setExpiryEditInput("");
  }, [open]);

  useEffect(() => {
    if (!open || !editingExpiry) return;
    if (status.unpublish_at) {
      setExpiryEditInput(isoToCdmxInput(status.unpublish_at));
    } else {
      setExpiryEditInput(defaultExpiryInput());
    }
  }, [editingExpiry, status.unpublish_at, open]);

  // Al abrir, determinar la vista inicial
  useEffect(() => {
    if (!open) return;
    setAck(false);
    setPublishError(null);
    setNotice(null);
    setVisError(null);
    setCopied(false);
    setCopyFailed(false);
    if (status.published) {
      setView("published");
      // Revisar los recursos del documento publicado
      void performCheck();
    } else {
      setView("unpublished");
      setCheck(null);
      // Revisar los recursos antes de publicar
      void performCheck();
    }
  }, [open]);

  async function performCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const html = getHtml();
      if (html === null) {
        setCheckError("No se pudo leer el documento. Vuelve a Lectura e inténtalo de nuevo.");
        setCheck(null);
        return;
      }
      const result = await checkPublication(vaultId, noteId, html);
      setCheck(result);
    } catch (err) {
      setCheckError(publicationErrorMessage(err));
      setCheck(null);
    } finally {
      setChecking(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    setPublishError(null);
    try {
      const html = getHtml();
      if (html === null) {
        setPublishError("No se pudo leer el documento. Vuelve a Lectura e inténtalo de nuevo.");
        return;
      }
      const result = enableExpiry ? await publishNote(vaultId, noteId, html, cdmxInputToIso(expiryInput)) : await publishNote(vaultId, noteId, html);
      onStatus(result);
      setView("published");
      setNotice("Publicado. Copia el enlace para compartirlo.");
    } catch (err) {
      setPublishError(publicationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRepublish() {
    setBusy(true);
    setPublishError(null);
    setNotice(null);
    try {
      const html = getHtml();
      if (html === null) {
        setPublishError("No se pudo leer el documento. Vuelve a Lectura e inténtalo de nuevo.");
        return;
      }
      const result = await republishNote(vaultId, noteId, html);
      onStatus(result);
      setNotice("Republicado. La página pública ya tiene los cambios.");
    } catch (err) {
      setPublishError(publicationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpublish() {
    setBusy(true);
    setPublishError(null);
    try {
      await unpublishNote(vaultId, noteId);
      onStatus({
        enabled: status.enabled,
        published: false,
        token: null,
        path: null,
        published_at: null,
        republished_at: null,
        stale: false,
        unpublish_at: null,
      });
      setOpen(false);
    } catch (err) {
      setPublishError(publicationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExpiry() {
    setBusy(true);
    setPublishError(null);
    try {
      const iso = cdmxInputToIso(expiryEditInput);
      const result = await setPublicationExpiry(vaultId, noteId, iso);
      onStatus(result);
      setEditingExpiry(false);
      setNotice(`Se despublicará el ${formatCdmx(result.unpublish_at || "")}.`);
    } catch (err) {
      setPublishError(publicationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveExpiry() {
    setBusy(true);
    setPublishError(null);
    try {
      const result = await setPublicationExpiry(vaultId, noteId, null);
      onStatus(result);
      setNotice("Se quitó la fecha de despublicación.");
    } catch (err) {
      setPublishError(publicationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Cambia a «público» los archivos que la persona eligió (uno o todos los privados), uno por uno; lo que falle se queda privado y se avisa. */
  async function handleMakePublic(ids: string[]) {
    setVisError(null);
    setVisBusy(new Set(ids));
    const done = new Set<string>();
    let failed = 0;
    for (const id of ids) {
      try {
        await setFileVisibility(id, "public");
        done.add(id);
      } catch {
        failed += 1;
      }
    }
    setCheck((prev) => {
      if (!prev) return prev;
      const resources = prev.resources.map((r) => (done.has(r.id) ? { ...r, visibility: "public" as const } : r));
      return { ...prev, resources, has_private: resources.some((r) => r.visibility !== "public") };
    });
    if (failed > 0) setVisError(failed === 1 ? "No se pudo hacer público un archivo. Inténtalo de nuevo." : `No se pudieron hacer públicos ${failed} archivos. Inténtalo de nuevo.`);
    setVisBusy(new Set());
  }

  async function handleCopyLink() {
    if (!status.path) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(publicUrl(status.path));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso o sin API: se deja el enlace seleccionado para copiarlo a mano.
      linkRef.current?.select();
      setCopyFailed(true);
    }
  }

  const dataState = status.published ? (status.stale ? "stale" : "ok") : "idle";
  const buttonLabel =
    status.published ?
      (status.stale ? "Publicado, con cambios sin republicar" : "Publicado en la web: ver el enlace")
      : "Publicar en la web";

  return (
    <>
      <button
        type="button"
        className="note-nav-button publish-trigger"
        data-state={dataState}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => setOpen(true)}
      >
        <Globe size={16} aria-hidden="true" />
        {status.published && (
          <span className="publish-dot" data-state={status.stale ? "stale" : "ok"} aria-hidden="true" />
        )}
      </button>

      {open && (
        <DialogFrame
          role="dialog"
          titleId={titleId}
          title={view === "confirm-unpublish" ? "¿Despublicar el documento?" : (view === "published" ? "Documento publicado" : "Publicar documento")}
          glyph={view === "confirm-unpublish" ? TriangleAlert : Globe}
          tone={view === "confirm-unpublish" ? "danger" : "neutral"}
          size="md"
          backdropClosable={!busy}
          onCancel={() => {
            if (!busy) setOpen(false);
          }}
          actions={
            view === "unpublished" ? (
              <>
                <button type="button" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={check?.has_private ? "btn-danger" : "btn-primary"}
                  disabled={!ack || checking || check === null || busy || (enableExpiry && expiryError(expiryInput) !== null)}
                  aria-busy={busy}
                  onClick={() => void handlePublish()}
                >
                  {busy ? "Publicando…" : (check?.has_private ? "Publicar de todos modos" : "Publicar")}
                </button>
              </>
            ) : view === "published" ? (
              <>
                <button type="button" onClick={() => setOpen(false)}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy || checking}
                  onClick={() => setView("confirm-unpublish")}
                >
                  Despublicar
                </button>
                <button
                  type="button"
                  className={status.stale ? "btn-primary" : ""}
                  disabled={busy || checking || check === null}
                  aria-busy={busy}
                  onClick={() => void handleRepublish()}
                >
                  {busy ? "Republicando…" : (check?.has_private ? "Republicar de todos modos" : "Republicar")}
                </button>
              </>
            ) : (
              // confirm-unpublish
              <>
                <button type="button" onClick={() => setView("published")}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void handleUnpublish()}
                >
                  {busy ? "Despublicando…" : "Despublicar"}
                </button>
              </>
            )
          }
        >
          {view === "unpublished" && (
            <div className="publish-view unpublished">
              <p>Se creará una copia fija con un enlace público. Cualquier persona que tenga el enlace podrá verla, sin iniciar sesión.</p>
              <p className="publish-secondary">Los cambios que hagas después no se ven hasta que la republiques. Puedes despublicarla cuando quieras.</p>

              <ReviewZone checking={checking} check={check} error={checkError} onRetry={() => void performCheck()} onMakePublic={(ids) => void handleMakePublic(ids)} busy={visBusy} visError={visError} full />

              <label className="publish-ack">
                <input
                  type="checkbox"
                  id="publish-ack"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  disabled={checking}
                />
                <span>Entiendo que cualquier persona con el enlace podrá ver este documento</span>
              </label>

              <label className="publish-ack">
                <input
                  type="checkbox"
                  checked={enableExpiry}
                  onChange={(e) => setEnableExpiry(e.target.checked)}
                  disabled={checking}
                />
                <span>Despublicar automáticamente en una fecha</span>
              </label>

              {enableExpiry && (
                <ExpiryPicker
                  id={expiryPickerId}
                  value={expiryInput}
                  onChange={setExpiryInput}
                  disabled={checking}
                  error={expiryError(expiryInput)}
                />
              )}
            </div>
          )}

          {view === "published" && (
            <div className="publish-view published">
              {notice && <div className="publish-alert publish-alert--ok" role="status">{notice}</div>}
              {status.stale && (
                <div className="publish-alert publish-alert--warning" role="status">
                  El documento cambió desde la última publicación. La página pública todavía muestra la versión anterior.
                </div>
              )}

              <div className="publish-link-section">
                <label htmlFor="publish-link">Enlace público</label>
                <div className="publish-link-row">
                  <input
                    id="publish-link"
                    type="text"
                    readOnly
                    ref={linkRef}
                    value={publicUrl(status.path || "")}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    aria-label="Copiar enlace público"
                    onClick={() => void handleCopyLink()}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div role="status" className="publish-status">{copied ? "Enlace copiado" : copyFailed ? "Selecciona el enlace y cópialo" : ""}</div>
              </div>

              <a
                href={publicUrl(status.path || "")}
                target="_blank"
                rel="noopener noreferrer"
                className="publish-link-open"
              >
                Abrir la página
                <ExternalLink size={14} aria-hidden="true" />
              </a>

              {status.published_at && (
                <p className="publish-dates">
                  Publicado el {formatDate(status.published_at)}
                  {status.republished_at && (
                    <>
                      <br />
                      Republicado el {formatDate(status.republished_at)}
                    </>
                  )}
                </p>
              )}

              <div className="publish-expiry-block">
                <h3 className="publish-expiry-label">Despublicación automática</h3>
                {status.unpublish_at ? (
                  <>
                    <p className="publish-expiry-status">Se despublicará el {formatCdmx(status.unpublish_at)}.</p>
                    {!editingExpiry && (
                      <div className="publish-expiry-actions">
                        <button type="button" onClick={() => setEditingExpiry(true)} disabled={busy}>
                          Cambiar
                        </button>
                        <button type="button" onClick={() => void handleRemoveExpiry()} disabled={busy} aria-busy={busy}>
                          {busy ? "Quitando…" : "Quitar"}
                        </button>
                      </div>
                    )}
                    {editingExpiry && (
                      <div className="publish-expiry-inline">
                        <ExpiryPicker
                          id={expiryEditId}
                          value={expiryEditInput}
                          onChange={setExpiryEditInput}
                          disabled={busy}
                          error={expiryError(expiryEditInput)}
                        />
                        <div className="publish-expiry-inline-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => void handleSaveExpiry()}
                            disabled={busy || expiryError(expiryEditInput) !== null}
                            aria-busy={busy}
                          >
                            {busy ? "Guardando…" : "Guardar fecha"}
                          </button>
                          <button type="button" onClick={() => setEditingExpiry(false)} disabled={busy}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="publish-expiry-status">Sin fecha de despublicación.</p>
                    {!editingExpiry && (
                      <div className="publish-expiry-actions">
                        <button type="button" onClick={() => setEditingExpiry(true)} disabled={busy}>
                          Programar
                        </button>
                      </div>
                    )}
                    {editingExpiry && (
                      <div className="publish-expiry-inline">
                        <ExpiryPicker
                          id={expiryEditId}
                          value={expiryEditInput}
                          onChange={setExpiryEditInput}
                          disabled={busy}
                          error={expiryError(expiryEditInput)}
                        />
                        <div className="publish-expiry-inline-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => void handleSaveExpiry()}
                            disabled={busy || expiryError(expiryEditInput) !== null}
                            aria-busy={busy}
                          >
                            {busy ? "Guardando…" : "Guardar fecha"}
                          </button>
                          <button type="button" onClick={() => setEditingExpiry(false)} disabled={busy}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <ReviewZone checking={checking} check={check} error={checkError} onRetry={() => void performCheck()} onMakePublic={(ids) => void handleMakePublic(ids)} busy={visBusy} visError={visError} />
            </div>
          )}

          {view === "confirm-unpublish" && (
            <div className="publish-view confirm-unpublish">
              <p>Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.</p>
            </div>
          )}

          {publishError && (
            <div className="publish-alert" role="alert">
              {publishError}
            </div>
          )}
        </DialogFrame>
      )}
    </>
  );
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(isoDate)) + " CDMX";
}

const plural = (n: number) => (n === 1 ? "1 imagen" : `${n} imágenes`);

/** Resultado de revisar los recursos del documento: los archivos privados con su botón «Hacer público» (cada uno, o todos a la vez), aviso de externos o error con «Reintentar». Nada cambia sin que la persona lo pida. */
function ReviewZone({ checking, check, error, onRetry, onMakePublic, busy, visError, full = false }: {
  checking: boolean; check: PublicationCheck | null; error: string | null; onRetry: () => void;
  onMakePublic: (ids: string[]) => void; busy: ReadonlySet<string>; visError: string | null;
  /** En la vista de publicar también dice que los archivos ya son públicos. */
  full?: boolean;
}) {
  const hidden = check ? check.resources.filter((r) => r.visibility !== "public") : [];
  const privateIds = hidden.filter((r) => r.visibility === "private").map((r) => r.id);
  const working = busy.size > 0;
  return (
    <div className="publish-review" aria-live="polite">
      {checking && <p>Revisando los recursos del documento…</p>}
      {!checking && error && (
        <div className="publish-alert" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>Reintentar</button>
        </div>
      )}
      {!checking && check && check.has_private && (
        <div className="publish-alert publish-alert--warning" role="alert">
          <strong>Hay recursos que no se verán</strong>
          <ul className="publish-private-list">
            {hidden.map((r) => (
              <li key={r.id}>
                {r.visibility === "private" ? (
                  <>
                    <span className="publish-private-name">{`«${r.name}» · privado`}</span>
                    <button type="button" className="publish-private-action" aria-label={`Hacer público «${r.name}»`} disabled={working} aria-busy={busy.has(r.id)} onClick={() => onMakePublic([r.id])}>
                      {busy.has(r.id) ? "Haciendo público…" : "Hacer público"}
                    </button>
                  </>
                ) : (
                  <span className="publish-private-name">Un archivo que no existe o no es tuyo</span>
                )}
              </li>
            ))}
          </ul>
          {privateIds.length > 1 && (
            <button type="button" className="publish-private-all" disabled={working} aria-busy={working} onClick={() => onMakePublic(privateIds)}>
              {working ? "Haciendo públicos…" : `Hacer públicos todos (${privateIds.length})`}
            </button>
          )}
          {visError && <p className="publish-private-error" role="status">{visError}</p>}
          <p>Quien abra el enlace no verá estos archivos. Hazlos públicos aquí o publica sin ellos. Un archivo público lo puede abrir cualquiera que tenga su enlace, también fuera de este documento. No cambiamos nada sin que lo pidas.</p>
        </div>
      )}
      {full && !checking && check && !check.has_private && check.resources.length > 0 && (
        <div className="publish-info">
          <Check size={16} aria-hidden="true" />
          <p>Los archivos del documento ya son públicos.</p>
        </div>
      )}
      {!checking && check && check.external.length > 0 && (
        <div className="publish-info">
          <Info size={16} aria-hidden="true" />
          <p>Este documento usa {plural(check.external.length)} de otros sitios: se mostrarán desde su origen mientras sigan disponibles.</p>
        </div>
      )}
    </div>
  );
}
