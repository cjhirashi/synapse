// Utilidades de prueba para la UI de sincronización (SPEC-0005; PLAN-0005 §2.5).
import { act } from "@testing-library/react";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { ReactNode } from "react";
import { vi } from "vitest";
import type { Replicator, ReplicatorOptions, SyncEvent } from "../sync/replicator";
import type { SyncEnv } from "../sync/resources";
import { SyncContext, type SyncContextValue } from "../sync/useSync";
import { createVaultStore, utcNow } from "../sync/vaultStore";

PouchDB.plugin(memory);

let counter = 0;

/** Nombre de base único por prueba (el adaptador en memoria comparte las bases por nombre). */
export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function memoryDb(name = uniqueName("db")): PouchDB.Database {
  return new PouchDB(name, { adapter: "memory" });
}

/** Replicador falso: registra las llamadas y deja emitir eventos como lo haría el real. */
export function fakeReplicator() {
  let onEvent: ((event: SyncEvent) => void) | null = null;
  const replicator: Replicator = {
    start: vi.fn(),
    sessionExpired: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(async () => undefined),
  };
  return {
    replicator,
    create: vi.fn((options: ReplicatorOptions) => {
      onEvent = options.onEvent;
      return replicator;
    }),
    /** Emite un evento del replicador (dentro de `act`, porque actualiza el estado de React). */
    emit(event: SyncEvent) {
      act(() => onEvent?.(event));
    },
  };
}

/**
 * Entorno de `SyncProvider` sobre PouchDB en memoria: réplica local con nombre propio y una
 * base en memoria como remota. Sin `create`, usa el replicador falso.
 */
export function memoryEnv(overrides: Partial<SyncEnv> = {}) {
  const fake = fakeReplicator();
  const localName = uniqueName("local");
  const remote = memoryDb(uniqueName("remote"));
  const env: SyncEnv = {
    localDb: { name: localName, adapter: "memory" },
    createRemote: () => remote,
    createReplicator: fake.create,
    ...overrides,
  };
  return { env, fake, remote, localName };
}

/**
 * Contexto de sincronización mínimo para probar una página: un `vaultStore` real sobre una
 * réplica en memoria y el resto con valores neutros que la prueba puede sustituir.
 */
export function syncValue(overrides: Partial<SyncContextValue> = {}, db = memoryDb()) {
  const value: SyncContextValue = {
    vaults: createVaultStore(db, "u1"),
    dataVersion: 0,
    replicating: true,
    status: { state: "online", pending: false, lastSyncAt: null },
    rejections: [],
    conflicts: [],
    resolveConflict: vi.fn(async () => undefined),
    requestLogout: vi.fn(async () => undefined),
    logout: {
      phase: "closed",
      reason: "pending",
      failure: null,
      syncAndExit: vi.fn(async () => undefined),
      discardAndExit: vi.fn(async () => undefined),
      cancel: vi.fn(),
    },
    ...overrides,
  };
  return { value, db };
}

export function WithSync({ value, children }: { value: SyncContextValue; children: ReactNode }) {
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/**
 * Almacén para sembrar bóvedas en una réplica de prueba: su reloj avanza un segundo por
 * escritura desde 2026-10-12T09:00:00Z, así que el orden de la lista (RF-024 de 0003) es fijo.
 */
export function seedStore(db: PouchDB.Database) {
  let tick = 0;
  return createVaultStore(db, "u1", { now: () => utcNow(new Date(Date.UTC(2026, 9, 12, 9, 0, tick++))) });
}
