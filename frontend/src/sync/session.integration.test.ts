// Sesión y cortes del canal con réplicas reales (SPEC-0005 RF-016, RF-019, RNF-002).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Browser, createUser, Device, eventually, type TestUser } from "../test-utils/device";
import { BATCH_SIZE } from "./replicator";

/** Ids (`vault:{uuid}`) de los documentos de un cuerpo de `_bulk_docs`. */
function bulkIds(body: string | undefined): string[] {
  return (JSON.parse(body ?? "{}") as { docs?: { _id: string }[] }).docs?.map((doc) => doc._id) ?? [];
}

/** Nombres de todas las bóvedas activas según la API REST. */
async function serverNames(browser: Browser): Promise<string[]> {
  const page = (await (await browser.api("/vaults?limit=200")).json()) as { items: { name: string }[] };
  return page.items.map((item) => item.name).sort();
}

describe("sesión y cortes (integración)", () => {
  let user: TestUser;
  let device: Device;

  beforeEach(async () => {
    user = await createUser();
    device = new Device(user);
    await device.signIn();
    await device.open();
    await device.synced();
  });

  afterEach(async () => {
    await device.destroy();
  });

  it("la sesión invalidada a mitad detiene la replicación sin perder pendientes y reanuda al volver a entrar", async () => {
    // Otro navegador cambia la contraseña: invalida las sesiones de los demás (RF-021 de 0002).
    const other = new Browser();
    await other.login(user.email, user.password);
    const password = "otra-definitiva-1234";
    await other.api("/auth/change-password", "POST", { current_password: user.password, new_password: password });

    const vault = await device.sync.vaults.create({ name: "Escrita tras caducar", description: null, tags: [] });

    // RF-016: el estado lo dice, la escritura sigue en la réplica y pendiente.
    await device.waitForStatus((status) => status.state === "session-expired" && status.pending);
    await expect(device.sync.vaults.get(vault.id)).resolves.toMatchObject({ name: "Escrita tras caducar" });
    expect(await serverNames(other)).toEqual([]);

    // Volver a entrar (la app desmonta la sesión en /login y la abre de nuevo): misma réplica.
    await device.close();
    await device.signIn(password);
    await device.open();
    await device.synced();
    expect(await serverNames(other)).toEqual(["Escrita tras caducar"]);
  });

  it("un corte a mitad de lote reanuda desde el checkpoint sin reenviar lo confirmado ni duplicar", async () => {
    const total = BATCH_SIZE + 10;
    device.setNetwork("offline");
    for (let i = 0; i < total; i += 1) {
      await device.sync.vaults.create({ name: `Bóveda ${String(i).padStart(2, "0")}`, description: null, tags: [] });
    }

    // Se corta la red en cuanto el servidor confirma el primer lote. El estado ya decía "sin
    // conexión" antes de volver la red, así que se espera al corte mismo, no al estado.
    const cut = new Promise<void>((resolve) => {
      const stop = device.onSyncEvent((event) => {
        if (event.type !== "checkpoint") return;
        stop();
        device.setNetwork("offline");
        resolve();
      });
    });
    const sentBefore = device.requests.length;
    device.setNetwork("online");
    await cut;
    await device.waitForStatus((status) => status.state === "offline" && status.pending);

    device.setNetwork("online");
    await device.synced();

    const bulks = device.requests.slice(sentBefore).filter((request) => request.path.endsWith("/_bulk_docs"));
    const [first, ...later] = bulks.map((request) => bulkIds(request.body));
    expect(first).toHaveLength(BATCH_SIZE);
    const resent = later.flat().filter((id) => first.includes(id));
    expect(resent).toEqual([]);
    expect(new Set([...first, ...later.flat()]).size).toBe(total);

    const names = await serverNames(device);
    expect(names).toHaveLength(total);
    expect(new Set(names).size).toBe(total);
  });

  it("con el backend caído el estado pasa a sin conexión y se recupera al volver", async () => {
    device.setNetwork("backend-down");
    await device.waitForStatus((status) => status.state === "offline");
    const vault = await device.sync.vaults.create({ name: "Durante la caída", description: null, tags: [] });
    await device.waitForStatus((status) => status.state === "offline" && status.pending);

    device.setNetwork("online");
    await device.synced();
    expect(await serverNames(device)).toEqual(["Durante la caída"]);
    await expect(device.sync.vaults.get(vault.id)).resolves.toMatchObject({ deleted_at: null });
  });
});
