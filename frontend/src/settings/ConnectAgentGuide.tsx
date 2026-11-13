import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Link } from "react-router-dom";

/** Bloque de código con su botón de copiar. */
export function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles: la persona puede seleccionar el texto.
    }
  }
  return (
    <div className="ag-code">
      <div className="ag-code-bar">
        <span>{title}</span>
        <button type="button" onClick={() => void copy()} aria-label={`Copiar ${title}`}>
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre tabIndex={0}>{code}</pre>
    </div>
  );
}

function toolCode(base: string): string {
  return `import os, requests

BASE = "${base}"
HEADERS = {"Authorization": f"Bearer {os.environ['SYNAPSE_API_KEY']}"}

def listar_bovedas():
    return requests.get(f"{BASE}/vaults", headers=HEADERS, timeout=30).json()

def listar_notas(vault_id):
    return requests.get(f"{BASE}/vaults/{vault_id}/notes", headers=HEADERS, timeout=30).json()

def crear_nota(vault_id, path, content):
    body = {"path": path, "content": content}
    return requests.post(f"{BASE}/vaults/{vault_id}/notes", headers=HEADERS, json=body, timeout=30).json()`;
}

function promptText(base: string): string {
  return `Tienes acceso a Synapse, mi sistema de notas y tareas organizado en bóvedas.

Conexión
- URL base: ${base}
- Cada petición lleva el encabezado Authorization: Bearer <API key>. La key está en la variable de entorno SYNAPSE_API_KEY; nunca la muestres ni la copies en una nota.
- Esquema completo de la API: ${base}/openapi.json

Rutas principales
- GET /vaults: mis bóvedas.
- GET /vaults/{id}/notes y GET /vaults/{id}/notes/{note_id}: leer notas.
- POST /vaults/{id}/notes con {"path": "Carpeta/Nota.md", "content": "..."}: crear una nota.
- PATCH /vaults/{id}/notes/{note_id}: editar; envía If-Match con el ETag de la última lectura.
- GET y POST /vaults/{id}/tasks: ver y crear tareas de la bóveda.

Reglas
- Una respuesta 401 significa que la key no es válida o fue revocada: avísame, no reintentes.
- Si el servidor rechaza una escritura por permisos, dime en qué carpeta y no insistas.
- No borres ni muevas notas si no te lo pido.`;
}

/**
 * Cómo conectar un agente externo (Claude, ChatGPT, Gemini, n8n…) con una API key (H-053). Solo texto y fragmentos
 * copiables; todo lo que dice sale de `docs/API.md` y del esquema `/openapi.json` del propio servidor.
 */
export default function ConnectAgentGuide() {
  const base = window.location.origin;
  return (
    <div className="ag-guide">
      <section className="ag-card" aria-labelledby="guide-steps">
        <h3 id="guide-steps">Antes de empezar</h3>
        <ol className="ag-steps">
          <li>
            Crea una API key en «Mis API keys». Ponle el nombre del agente (por ejemplo <code>op-chatgpt</code>) y, si debe escribir en
            tus bóvedas, escribe también su id de agente (por ejemplo <code>chatgpt</code>).
          </li>
          <li>
            Copia la key (empieza con <code>syn_ak_</code>): se muestra <strong>una sola vez</strong>. Guárdala como secreto en la plataforma del
            agente, nunca dentro de un prompt compartido ni de un repositorio.
          </li>
          <li>
            Registra al agente en las bóvedas donde debe escribir, en <Link className="ag-link" to="/settings/agent-access">Agentes por bóveda</Link>.
            Un agente sin registrar puede leer la bóveda, pero solo escribe en <code>AG - MENSAJES</code>.
          </li>
        </ol>
      </section>

      <section className="ag-card" aria-labelledby="guide-data">
        <h3 id="guide-data">Datos de conexión</h3>
        <dl className="ag-kv">
          <dt>URL base</dt>
          <dd><code>{base}</code></dd>
          <dt>Autenticación</dt>
          <dd><code>Authorization: Bearer syn_ak_…</code></dd>
          <dt>Esquema OpenAPI</dt>
          <dd><code>{base}/openapi.json</code></dd>
          <dt>Formato</dt>
          <dd>JSON</dd>
        </dl>
        <CodeBlock title="Probar la conexión (terminal)" code={`export SYNAPSE_API_KEY="syn_ak_…"\ncurl -H "Authorization: Bearer $SYNAPSE_API_KEY" ${base}/vaults`} />
        <p>
          Respuesta <strong>200</strong> con tus bóvedas: la key funciona. <strong>401</strong>: la key es inválida o está revocada.
        </p>
      </section>

      <section className="ag-card" aria-labelledby="guide-scope">
        <h3 id="guide-scope">Qué puede hacer un agente con su key</h3>
        <p>
          Actúa con tu cuenta y solo ve tus datos: leer y escribir <strong>notas</strong> y <strong>carpetas</strong>, subir <strong>archivos</strong>, crear y
          actualizar <strong>tareas</strong> y sincronizar. Para editar una nota envía el <code>ETag</code> que recibió al leerla en el encabezado{" "}
          <code>If-Match</code>.
        </p>
        <p>
          No puede crear ni revocar API keys, cambiar tu perfil o tu contraseña, ni leer tus avisos. Donde escribe lo decide{" "}
          <Link className="ag-link" to="/settings/agent-access">Agentes por bóveda</Link>.
        </p>
      </section>

      <section aria-labelledby="guide-platforms">
        <h3 id="guide-platforms" className="ag-section-title" style={{ marginTop: 0 }}>Por plataforma</h3>
        <div className="ag-platforms">
          <details className="ag-platform">
            <summary>ChatGPT (GPT personalizado con Actions)</summary>
            <div className="ag-platform-body">
              <ol>
                <li>En ChatGPT crea o edita un GPT y abre <strong>Configurar → Acciones → Crear nueva acción</strong>.</li>
                <li>En el esquema elige <strong>Importar desde URL</strong> y pega <code>{base}/openapi.json</code>.</li>
                <li>En <strong>Autenticación</strong> elige <strong>Clave de API</strong>, tipo <strong>Bearer</strong>, y pega tu key.</li>
                <li>Pega en las instrucciones del GPT el texto de «Instrucción lista para pegar».</li>
              </ol>
              <p>
                El esquema es extenso. Si ChatGPT lo rechaza por tamaño, importa solo las rutas que necesites (bóvedas, notas y tareas). Los nombres de los menús
                pueden variar según tu plan y la versión de ChatGPT, que debe permitir GPTs personalizados.
              </p>
            </div>
          </details>

          <details className="ag-platform">
            <summary>Claude (Claude Code o la API de Anthropic)</summary>
            <div className="ag-platform-body">
              <p>
                El chat de Claude se conecta a servicios con conectores MCP, no con una API key suelta. Para usar esta key emplea Claude Code o la API de
                Anthropic con herramientas.
              </p>
              <ol>
                <li><strong>Claude Code:</strong> exporta <code>SYNAPSE_API_KEY</code> en tu terminal y pega la instrucción de abajo en el <code>CLAUDE.md</code> del proyecto. Claude usará <code>curl</code> con el encabezado.</li>
                <li><strong>API de Anthropic (uso de herramientas):</strong> define herramientas cuyo código haga las peticiones HTTP; las funciones están en «Cualquier agente con código».</li>
              </ol>
            </div>
          </details>

          <details className="ag-platform">
            <summary>Gemini (API de Gemini o Gemini CLI)</summary>
            <div className="ag-platform-body">
              <ol>
                <li><strong>API de Gemini:</strong> declara funciones (listar bóvedas, leer notas, crear una nota…) con function calling y haz que su código llame a Synapse con el encabezado. Las funciones están en «Cualquier agente con código».</li>
                <li><strong>Gemini CLI:</strong> exporta <code>SYNAPSE_API_KEY</code> y pega la instrucción de abajo en su archivo de contexto.</li>
              </ol>
            </div>
          </details>

          <details className="ag-platform">
            <summary>Cualquier agente con código (OpenAI, Gemini, Claude, scripts)</summary>
            <div className="ag-platform-body">
              <p>Estas funciones sirven tal cual como herramientas de cualquier modelo con function calling:</p>
              <CodeBlock title="Funciones en Python" code={toolCode(base)} />
            </div>
          </details>

          <details className="ag-platform">
            <summary>n8n, Make, Zapier y similares</summary>
            <div className="ag-platform-body">
              <ol>
                <li>Usa un nodo de petición HTTP hacia <code>{base}/vaults</code> (o la ruta que necesites).</li>
                <li>Añade un encabezado <code>Authorization</code> con el valor <code>Bearer syn_ak_…</code>; guarda la key en las credenciales de la herramienta, no en el flujo.</li>
              </ol>
            </div>
          </details>
        </div>
      </section>

      <section className="ag-card" aria-labelledby="guide-prompt">
        <h3 id="guide-prompt">Instrucción lista para pegar</h3>
        <p>Pégala en las instrucciones del agente para que sepa cómo usar Synapse.</p>
        <CodeBlock title="Instrucción para el agente" code={promptText(base)} />
      </section>
    </div>
  );
}
