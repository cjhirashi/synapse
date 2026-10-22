import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

// Data router (no `BrowserRouter`): sólo así existe `useBlocker`, que el editor usa para no
// perder un borrador al navegar dentro de la app (SPEC-0008 RF-008, VF-1). Una única ruta
// comodín monta `App`, cuyas `<Routes>` siguen decidiendo las pantallas como rutas
// descendientes: nada de la tabla de rutas cambia.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
