// Sustituto de `MemoryRouter` sobre un data router (SPEC-0008 VF-1).
//
// `useBlocker` (el aviso de cambios sin guardar del editor) sólo funciona con un data router,
// como el que monta `main.tsx`. Este componente es un reemplazo directo de `MemoryRouter`
// para las pruebas que montan `NoteEditor`: una única ruta comodín muestra los hijos, que
// llegan por contexto para que un `rerender` los actualice (el router se crea una sola vez).
import { ReactNode, createContext, useContext, useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

type InitialEntries = NonNullable<Parameters<typeof createMemoryRouter>[1]>["initialEntries"];

const Children = createContext<ReactNode>(null);

function Slot() {
  return <>{useContext(Children)}</>;
}

export function DataMemoryRouter({ initialEntries, children }: { initialEntries?: InitialEntries; children: ReactNode }) {
  const [router] = useState(() => createMemoryRouter([{ path: "*", element: <Slot /> }], { initialEntries }));
  return (
    <Children.Provider value={children}>
      <RouterProvider router={router} />
    </Children.Provider>
  );
}
