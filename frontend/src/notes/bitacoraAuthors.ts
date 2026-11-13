/** Foto y nombre de los agentes en la bitácora (H-053). El servidor escribe `· aira (agente) ·`; aquí se muestra con su perfil. */
import type { AgentProfile } from "../agents/agentProfilesApi";

const AGENT_LINE = /^(- \*\*\d{2}:\d{2}:\d{2}\*\* · )([a-z0-9][a-z0-9-]{0,31}) \(agente\)( · )/;

/** Escapa lo que el Markdown interpretaría dentro del nombre o del texto alternativo. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+!|<>~]/g, "\\$&");
}

/**
 * Sustituye el id del agente por su nombre visible y antepone su foto en las líneas de la bitácora. Solo cambia lo que se
 * pinta: el documento guardado no se toca. Un agente sin perfil queda como está.
 */
export function decorateBitacora(content: string, profiles: Readonly<Record<string, AgentProfile>>): string {
  return content
    .split("\n")
    .map((line) => {
      const match = AGENT_LINE.exec(line);
      const profile = match ? profiles[match[2]] : undefined;
      if (!match || !profile || (!profile.display_name && !profile.photo_url)) return line;
      const id = match[2];
      const name = profile.display_name ? `${escapeMarkdown(profile.display_name)} (${id}, agente)` : `${id} (agente)`;
      const photo = profile.photo_url ? `![${escapeMarkdown(profile.display_name ?? id)}](${profile.photo_url}) ` : "";
      return `${match[1]}${photo}${name}${match[3]}${line.slice(match[0].length)}`;
    })
    .join("\n");
}
