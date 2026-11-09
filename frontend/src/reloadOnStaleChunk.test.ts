import { beforeEach, expect, test, vi } from "vitest";
import { installStaleChunkReload } from "./reloadOnStaleChunk";

beforeEach(() => sessionStorage.clear());

function fire(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

test("un chunk obsoleto recarga la página una sola vez", () => {
  const reload = vi.fn();
  installStaleChunkReload(window, reload);
  expect(fire().defaultPrevented).toBe(true);
  fire();
  expect(reload).toHaveBeenCalledTimes(1);
});
