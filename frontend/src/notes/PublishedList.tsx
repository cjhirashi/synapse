import { useEffect, useState, useCallback } from "react";
import { Copy, ExternalLink, Trash2, Calendar, FileText } from "lucide-react";
import { listPublications, publicUrl, unpublishNote, setPublicationExpiry, publicationErrorMessage } from "./publicationApi";
import { cdmxInputToIso, isoToCdmxInput, defaultExpiryInput, expiryError, formatCdmx } from "./cdmxTime";
import ExpiryPicker from "./ExpiryPicker";
import type { PublishedItem } from "./publicationApi";
import { NOTE_ID_PREFIX } from "./noteRules";
import "./published-list.css";

interface Props {
  vaultId: string;
  onOpenNote: (noteId: string) => void;
}

interface CardState {
  itemId: string;
  error: string | null;
  loading: boolean;
  editingExpiry: boolean;
  expiryInput: string;
  confirmingDelete: boolean;
  copied: boolean;
  copyFailed: boolean;
}

const freshCard = (itemId: string): CardState => ({
  itemId, error: null, loading: false, editingExpiry: false, expiryInput: "", confirmingDelete: false, copied: false, copyFailed: false,
});

export default function PublishedList({ vaultId, onOpenNote }: Props) {
  const [items, setItems] = useState<PublishedItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});

  const loadPublications = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const loaded = await listPublications(vaultId);
      setItems(loaded);
    } catch (err) {
      setListError(publicationErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    void loadPublications();
  }, [loadPublications]);

  const getCardState = (itemId: string): CardState => cardStates[itemId] ?? freshCard(itemId);

  // Función de actualización: los temporizadores y las respuestas tardías no pisan campos que cambiaron mientras tanto.
  const updateCardState = (itemId: string, partial: Partial<CardState>) => {
    setCardStates((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? freshCard(itemId)), ...partial } }));
  };

  const toggleExpiryEditor = (item: PublishedItem) => {
    if (getCardState(item.note_id).editingExpiry) {
      updateCardState(item.note_id, { editingExpiry: false });
      return;
    }
    updateCardState(item.note_id, {
      editingExpiry: true, error: null, confirmingDelete: false,
      expiryInput: item.unpublish_at ? isoToCdmxInput(item.unpublish_at) : defaultExpiryInput(),
    });
  };

  const copyLink = async (item: PublishedItem) => {
    const itemId = item.note_id;
    updateCardState(itemId, { loading: true });
    try {
      const url = publicUrl(item.path);
      await navigator.clipboard.writeText(url);
      updateCardState(itemId, { loading: false, copied: true, copyFailed: false });
      setTimeout(() => updateCardState(itemId, { copied: false }), 2000);
    } catch {
      updateCardState(itemId, { loading: false, copyFailed: true });
    }
  };

  const saveExpiry = async (item: PublishedItem) => {
    const itemId = item.note_id;
    const state = getCardState(itemId);
    const error = expiryError(state.expiryInput);
    if (error !== null) return;

    updateCardState(itemId, { loading: true });
    try {
      const iso = cdmxInputToIso(state.expiryInput);
      const result = await setPublicationExpiry(vaultId, itemId, iso);
      setItems((prev) =>
        prev?.map((it) =>
          it.note_id === itemId ? { ...it, unpublish_at: result.unpublish_at } : it
        ) ?? null
      );
      updateCardState(itemId, { loading: false, editingExpiry: false });
    } catch (err) {
      updateCardState(itemId, { loading: false, error: publicationErrorMessage(err) });
    }
  };

  const removeExpiry = async (item: PublishedItem) => {
    const itemId = item.note_id;
    updateCardState(itemId, { loading: true });
    try {
      const result = await setPublicationExpiry(vaultId, itemId, null);
      setItems((prev) =>
        prev?.map((it) =>
          it.note_id === itemId ? { ...it, unpublish_at: result.unpublish_at } : it
        ) ?? null
      );
      updateCardState(itemId, { loading: false, editingExpiry: false });
    } catch (err) {
      updateCardState(itemId, { loading: false, error: publicationErrorMessage(err) });
    }
  };

  const confirmDelete = async (item: PublishedItem) => {
    const itemId = item.note_id;
    updateCardState(itemId, { loading: true });
    try {
      await unpublishNote(vaultId, itemId);
      setItems((prev) => prev?.filter((it) => it.note_id !== itemId) ?? null);
    } catch (err) {
      updateCardState(itemId, { loading: false, error: publicationErrorMessage(err) });
    }
  };

  if (isLoading) {
    return <p className="published-list-loading">Cargando publicados…</p>;
  }

  if (listError !== null) {
    return (
      <div className="published-list-error" role="alert">
        <p>{listError}</p>
        <button type="button" className="btn btn-sm" onClick={() => void loadPublications()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (items === null || items.length === 0) {
    return (
      <div className="published-list-empty">
        <p>Aún no has publicado ningún documento. Se publican desde el globo junto a «PDF» al leer un documento.</p>
      </div>
    );
  }

  return (
    <div className="published-list-container">
      <div className="published-list-header">
        <h2 className="published-list-title">Documentos publicados</h2>
        {items.length > 0 && (
          <span className="published-list-count">
            {items.length === 1 ? "1 documento" : `${items.length} documentos`}
          </span>
        )}
      </div>
      <ul className="published-list">
        {items.map((item) => {
          const state = getCardState(item.note_id);
          const url = publicUrl(item.path);
          return (
            <li key={item.note_id} className="published-card">
              <div className="published-card-title">
                {item.title}
                {item.deleted && (
                  <span className="published-card-badge published-card-badge-deleted">Documento borrado</span>
                )}
                {item.stale && !item.deleted && (
                  <span className="published-card-badge published-card-badge-stale">Con cambios sin republicar</span>
                )}
              </div>
              {item.note_path && <p className="published-card-path">{item.note_path}</p>}
              <div className="published-card-metadata">
                <p>Publicado el {formatCdmx(item.published_at)}</p>
                {item.republished_at && <p>Republicado el {formatCdmx(item.republished_at)}</p>}
                {item.unpublish_at ? (
                  <p>Se despublicará el {formatCdmx(item.unpublish_at)}</p>
                ) : (
                  <p>Sin fecha de despublicación</p>
                )}
              </div>
              {state.editingExpiry && (
                <div className="published-card-expiry-editor">
                  <ExpiryPicker
                    value={state.expiryInput}
                    onChange={(value) => updateCardState(item.note_id, { expiryInput: value })}
                    disabled={state.loading}
                    error={expiryError(state.expiryInput)}
                    id={`expiry-${item.note_id}`}
                  />
                  <div className="published-card-expiry-buttons">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={state.loading || expiryError(state.expiryInput) !== null}
                      onClick={() => void saveExpiry(item)}
                    >
                      Guardar fecha
                    </button>
                    {item.unpublish_at && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={state.loading}
                        onClick={() => void removeExpiry(item)}
                      >
                        Quitar fecha
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={state.loading}
                      onClick={() => updateCardState(item.note_id, { editingExpiry: false })}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {state.confirmingDelete && (
                <div className="published-card-confirm-delete">
                  <p>Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.</p>
                  <div className="published-card-confirm-buttons">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={state.loading}
                      onClick={() => updateCardState(item.note_id, { confirmingDelete: false })}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={state.loading}
                      aria-busy={state.loading}
                      onClick={() => void confirmDelete(item)}
                    >
                      Despublicar
                    </button>
                  </div>
                </div>
              )}
              {state.copyFailed && (
                <div className="published-card-copy-fallback">
                  <p role="status">Selecciona el enlace y cópialo</p>
                  <input type="text" readOnly value={url} aria-label="Enlace público" onClick={(e) => e.currentTarget.select()} />
                </div>
              )}
              {state.error && (
                <p className="published-card-error" role="alert">
                  {state.error}
                </p>
              )}
              <div className="published-card-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={state.loading || state.copied}
                  aria-busy={state.loading}
                  onClick={() => void copyLink(item)}
                >
                  <Copy size={16} aria-hidden="true" />
                  {state.copied ? "Copiado" : "Copiar enlace"}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Abrir
                </a>
                {!item.deleted && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={state.loading}
                    aria-busy={state.loading}
                    onClick={() => onOpenNote(`${NOTE_ID_PREFIX}${vaultId}:${item.note_id}`)}
                  >
                    <FileText size={16} aria-hidden="true" />
                    Ver documento
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={state.loading}
                  aria-busy={state.loading}
                  onClick={() => toggleExpiryEditor(item)}
                >
                  <Calendar size={16} aria-hidden="true" />
                  Fecha de despublicación
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={state.loading}
                  aria-busy={state.loading}
                  onClick={() => updateCardState(item.note_id, { confirmingDelete: !state.confirmingDelete, editingExpiry: false, error: null })}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Despublicar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
