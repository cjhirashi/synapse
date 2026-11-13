import { agentName, useAgentProfiles } from "./agentProfiles";
import UserAvatar from "../settings/UserAvatar";
import "./agents.css";

/** Agente con su foto (o iniciales) y su nombre visible; el id técnico queda en el título. */
export default function AgentBadge({ agentId, size = 18, showName = true }: { agentId: string; size?: number; showName?: boolean }) {
  const profiles = useAgentProfiles();
  const name = agentName(agentId, profiles);
  return (
    <span className="agent-badge" title={name === agentId ? `Agente ${agentId}` : `${name} (agente ${agentId})`}>
      <UserAvatar photoUrl={profiles[agentId]?.photo_url ?? null} label={name} size={size} />
      {showName && <span className="agent-badge-name">{name}</span>}
    </span>
  );
}
