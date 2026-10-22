/**
 * Contexto de sincronización para la UI (SPEC-0005 RF-009, RF-017; PLAN-0005 §2.5).
 *
 * Lo publica `SyncProvider` cuando la réplica local está abierta: las páginas de bóvedas
 * leen y escriben `vaults`, la barra de estado y las vistas de rechazos y conflictos leen
 * el resto, y el botón "Cerrar sesión" llama a `requestLogout()`.
 */
import { createContext, useContext } from "react";
import type { ConflictsStore, ManualConflict } from "./conflicts";
import type { NoteStore } from "../notes/noteStore";
import type { Rejection } from "./rejections";
import type { SyncStatus } from "./status";
import type { VaultStore } from "./vaultStore";

/**
 * Fase del cierre de sesión (RF-017):
 * - `closed`: sin aviso abierto (también durante una salida directa, sin cambios pendientes);
 * - `asking`: aviso de cambios pendientes con sus opciones;
 * - `syncing`: "Sincronizar y salir" en curso;
 * - `exiting`: cerrando la sesión y borrando la réplica desde el aviso.
 */
export type LogoutPhase = "closed" | "asking" | "syncing" | "exiting";

/**
 * Por qué se abrió el aviso (RF-017): `pending` (hay cambios sin confirmar) o `unreadable`
 * (la réplica no pudo leerse y no se sabe si los hay; VE-2).
 */
export type LogoutReason = "pending" | "unreadable";

/** Último fallo del cierre: `sync` (el push no confirmó todo) o `logout` (el servidor no cerró la sesión). */
export type LogoutFailure = "sync" | "logout" | null;

export interface LogoutState {
  phase: LogoutPhase;
  reason: LogoutReason;
  failure: LogoutFailure;
  /** Push de una vez; sale sólo si el servidor confirmó todo, si no vuelve al aviso. */
  syncAndExit(): Promise<void>;
  /**
   * Sale descartando los cambios no confirmados. Nunca rechaza: si el servidor no cierra la
   * sesión vuelve al aviso con `failure`; si la cierra pero la réplica no se borra, va al
   * login con el aviso de la copia conservada (VE-1).
   */
  discardAndExit(): Promise<void>;
  /** Cierra el aviso sin salir. */
  cancel(): void;
}

export interface SyncContextValue {
  /** Operaciones de la UI sobre las bóvedas de la réplica. */
  vaults: VaultStore;
  /** Operaciones de la UI sobre las notas de la réplica (SPEC-0008). */
  notes: NoteStore;
  /** Cambia con cada escritura en una bóveda de la réplica (de la UI, del pull o de otra pestaña). */
  dataVersion: number;
  /**
   * Cambia con cada escritura en una nota de la réplica. Va aparte de `dataVersion`: guardar
   * una nota no debe releer las listas de bóvedas (ni al revés).
   */
  notesVersion: number;
  /** `false` mientras el usuario deba cambiar su contraseña: el canal respondería 403 (RF-002). */
  replicating: boolean;
  status: SyncStatus;
  rejections: Rejection[];
  conflicts: ManualConflict[];
  resolveConflict: ConflictsStore["resolve"];
  /**
   * Cierra la sesión; con cambios sin confirmar (según el estado actual, no el del último
   * render) abre antes el aviso (RF-017).
   */
  requestLogout(): Promise<void>;
  logout: LogoutState;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

/** Estado de la sincronización; sólo dentro de `SyncProvider`. */
export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync() fuera de <SyncProvider>");
  return value;
}
