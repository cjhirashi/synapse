import { useId } from "react";
import { Bell, Plus, X } from "lucide-react";
import {
  MAX_REMINDERS, MAX_REMINDER_MINUTES, REMINDER_UNIT_LABEL, REMINDER_UNIT_MINUTES, formatReminder, splitReminder, type ReminderUnit,
} from "./taskModel";

const UNITS: ReminderUnit[] = ["minutes", "hours", "days", "weeks"];

/** Una fila: «[número] [unidad] antes» con su botón de quitar. La unidad cambia sin alterar el número, como en Google Calendar. */
function Row({ minutes, onChange, onRemove, label }: { minutes: number; onChange: (minutes: number) => void; onRemove: () => void; label: string }) {
  const { value, unit } = splitReminder(minutes);
  const max = Math.floor(MAX_REMINDER_MINUTES / REMINDER_UNIT_MINUTES[unit]);
  const commit = (nextValue: number, nextUnit: ReminderUnit) => {
    const total = Math.round(nextValue) * REMINDER_UNIT_MINUTES[nextUnit];
    if (Number.isFinite(total) && total >= 1) onChange(Math.min(total, MAX_REMINDER_MINUTES));
  };
  return (
    <li className="rm-row">
      <Bell size={14} aria-hidden="true" className="rm-bell" />
      <input
        type="number" inputMode="numeric" min={1} max={max} value={value} aria-label={`${label}: cantidad`}
        onChange={(e) => commit(e.target.valueAsNumber, unit)}
      />
      <select value={unit} aria-label={`${label}: unidad`} onChange={(e) => commit(value, e.target.value as ReminderUnit)}>
        {UNITS.map((u) => <option key={u} value={u}>{REMINDER_UNIT_LABEL[u][value === 1 ? 0 : 1]}</option>)}
      </select>
      <span className="rm-before">antes</span>
      <button type="button" className="tf-icon" aria-label={`Quitar ${formatReminder(minutes)}`} title="Quitar" onClick={onRemove}><X size={14} /></button>
    </li>
  );
}

interface Props {
  value: number[];
  onChange: (value: number[]) => void;
  /** Sin fecha de vencimiento no hay a qué anclarlos. */
  hasDue: boolean;
  /** Los recordatorios avisan a la persona solo cuando la tarea es suya. */
  mine: boolean;
}

/**
 * Recordatorios de una tarea: hasta cinco avisos antes del vencimiento, cada uno en minutos, horas, días o semanas. Se añaden
 * con «Añadir notificación» (empieza en 30 minutos) y se quitan con la X; las repetidas se unen al guardar.
 */
export default function ReminderEditor({ value, onChange, hasDue, mine }: Props) {
  const id = useId();
  const full = value.length >= MAX_REMINDERS;
  return (
    <div className="tf-field rm" role="group" aria-labelledby={`${id}-t`}>
      <span id={`${id}-t`} className="rm-title">Notificaciones <small>(antes del vencimiento)</small></span>
      {!hasDue ? (
        <p className="tf-help">Elige una fecha de vencimiento para añadir recordatorios.</p>
      ) : (
        <>
          {value.length === 0 ? <p className="tf-help">Sin recordatorios: solo se avisa cuando la tarea vence.</p> : (
            <ul className="rm-list">
              {value.map((minutes, index) => (
                <Row
                  key={index} minutes={minutes} label={`Recordatorio ${index + 1}`}
                  onChange={(next) => onChange(value.map((m, i) => (i === index ? next : m)))}
                  onRemove={() => onChange(value.filter((_, i) => i !== index))}
                />
              ))}
            </ul>
          )}
          <button type="button" className="rm-add" disabled={full} onClick={() => onChange([...value, 30])}>
            <Plus size={14} aria-hidden="true" /> Añadir notificación
          </button>
          {full && <p className="tf-help">Máximo {MAX_REMINDERS} recordatorios por tarea.</p>}
          {!mine && <p className="tf-help">Los recordatorios te avisan a ti: esta tarea no es tuya, así que no generará avisos.</p>}
        </>
      )}
    </div>
  );
}
