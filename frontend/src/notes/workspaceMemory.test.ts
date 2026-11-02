import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readMemory, writeMemory, forgetNote } from "./workspaceMemory";

describe("workspaceMemory", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("readMemory", () => {
    it("devuelve null si la clave no existe", () => {
      const result = readMemory("user1", "vault1");
      expect(result).toBeNull();
    });

    it("lee y devuelve la memoria válida", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: "note:vault1:abc", expanded: ["folder1"], scroll: 100 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toEqual(data);
    });

    it("devuelve null si el JSON es inválido", () => {
      const userId = "user1";
      const vaultId = "vault1";
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, "not json");

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
      expect(localStorage.getItem(`synapse.workspace.${userId}.${vaultId}`)).toBeNull();
    });

    it("devuelve null si el objeto no tiene la estructura correcta", () => {
      const userId = "user1";
      const vaultId = "vault1";
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify({}));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si noteId no es null ni string válido", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: 123, expanded: [], scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si noteId es de otra bóveda", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: "note:vault2:abc", expanded: [], scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si expanded no es un array", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: null, expanded: "not an array", scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si expanded contiene más de 500 elementos", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const expanded = Array.from({ length: 501 }, (_, i) => `folder${i}`);
      const data = { noteId: null, expanded, scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si un elemento de expanded supera 512 caracteres", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: null, expanded: ["a".repeat(513)], scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si scroll no es un entero finito", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: null, expanded: [], scroll: NaN };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si scroll es negativo", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: null, expanded: [], scroll: -1 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("devuelve null si scroll supera 10000000", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: null, expanded: [], scroll: 10000001 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(data));

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
    });

    it("no lanza si localStorage.getItem lanza", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Storage error");
      });

      const result = readMemory(userId, vaultId);
      expect(result).toBeNull();
      spy.mockRestore();
    });
  });

  describe("writeMemory", () => {
    it("escribe la memoria completa si está vacía", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const data = { noteId: "note:vault1:abc", expanded: ["folder1"], scroll: 100 };

      writeMemory(userId, vaultId, data);

      const stored = JSON.parse(localStorage.getItem(`synapse.workspace.${userId}.${vaultId}`));
      expect(stored).toEqual(data);
    });

    it("mezcla el patch sin pisar campos no mencionados", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const initial = { noteId: "note:vault1:abc", expanded: ["folder1"], scroll: 100 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(initial));

      writeMemory(userId, vaultId, { expanded: ["folder1", "folder2"] });

      const stored = JSON.parse(localStorage.getItem(`synapse.workspace.${userId}.${vaultId}`));
      expect(stored).toEqual({
        noteId: "note:vault1:abc",
        expanded: ["folder1", "folder2"],
        scroll: 100,
      });
    });

    it("no escribe si el JSON serializado supera 64 KiB", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const initial = { noteId: "note:vault1:abc", expanded: [], scroll: 0 };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(initial));

      const huge = "a".repeat(65536);
      writeMemory(userId, vaultId, { expanded: [huge] });

      const stored = JSON.parse(localStorage.getItem(`synapse.workspace.${userId}.${vaultId}`));
      expect(stored).toEqual(initial);
    });

    it("no lanza si localStorage.setItem lanza", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage error");
      });

      expect(() => writeMemory(userId, vaultId, { scroll: 50 })).not.toThrow();
      spy.mockRestore();
    });

    it("aísla datos entre dos usuarios", () => {
      const vaultId = "vault1";
      writeMemory("user1", vaultId, { noteId: "note:vault1:abc", expanded: [], scroll: 0 });
      writeMemory("user2", vaultId, { noteId: "note:vault1:def", expanded: [], scroll: 0 });

      const result1 = readMemory("user1", vaultId);
      const result2 = readMemory("user2", vaultId);

      expect(result1?.noteId).toBe("note:vault1:abc");
      expect(result2?.noteId).toBe("note:vault1:def");
    });

    it("aísla datos entre dos bóvedas", () => {
      const userId = "user1";
      writeMemory(userId, "vault1", { noteId: "note:vault1:abc", expanded: [], scroll: 0 });
      writeMemory(userId, "vault2", { noteId: "note:vault2:def", expanded: [], scroll: 0 });

      const result1 = readMemory(userId, "vault1");
      const result2 = readMemory(userId, "vault2");

      expect(result1?.noteId).toBe("note:vault1:abc");
      expect(result2?.noteId).toBe("note:vault2:def");
    });
  });

  describe("forgetNote", () => {
    it("pone noteId a null y scroll a 0, conservando expanded", () => {
      const userId = "user1";
      const vaultId = "vault1";
      const initial = {
        noteId: "note:vault1:abc",
        expanded: ["folder1", "folder2"],
        scroll: 100,
      };
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify(initial));

      forgetNote(userId, vaultId);

      const stored = readMemory(userId, vaultId);
      expect(stored).toEqual({
        noteId: null,
        expanded: ["folder1", "folder2"],
        scroll: 0,
      });
    });

    it("hace nada si la clave no existe", () => {
      expect(() => forgetNote("user1", "vault1")).not.toThrow();
    });

    it("no lanza si localStorage.setItem falla", () => {
      const userId = "user1";
      const vaultId = "vault1";
      localStorage.setItem(`synapse.workspace.${userId}.${vaultId}`, JSON.stringify({
        noteId: "note:vault1:abc",
        expanded: [],
        scroll: 0,
      }));

      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage error");
      });

      expect(() => forgetNote(userId, vaultId)).not.toThrow();
      spy.mockRestore();
    });
  });
});