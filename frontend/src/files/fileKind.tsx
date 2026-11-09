/** Clasificación de un archivo por su tipo: etiqueta de la columna «Tipo» e ícono con color propio en el nombre. */
import {
  File as FileIcon,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export type FileKind = "pdf" | "word" | "excel" | "powerpoint" | "html" | "csv" | "json" | "markdown" | "text" | "zip" | "image" | "other";

const KINDS: Record<FileKind, { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileText },
  word: { label: "Word", icon: FileText },
  excel: { label: "Excel", icon: FileSpreadsheet },
  powerpoint: { label: "PowerPoint", icon: Presentation },
  html: { label: "HTML", icon: FileCode },
  csv: { label: "CSV", icon: FileSpreadsheet },
  json: { label: "JSON", icon: FileJson },
  markdown: { label: "Markdown", icon: FileText },
  text: { label: "Texto", icon: FileText },
  zip: { label: "ZIP", icon: FileArchive },
  image: { label: "Imagen", icon: FileImage },
  other: { label: "Archivo", icon: FileIcon },
};

export function fileKind(contentType: string): FileKind {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("presentation") || type.includes("powerpoint")) return "powerpoint";
  if (type.includes("spreadsheet") || type.includes("excel")) return "excel";
  if (type.includes("word") || type.includes("opendocument.text") || type.includes("rtf")) return "word";
  if (type.includes("html")) return "html";
  if (type.includes("csv")) return "csv";
  if (type.includes("json")) return "json";
  if (type.includes("markdown")) return "markdown";
  if (type.includes("zip")) return "zip";
  if (type.startsWith("text/")) return "text";
  return "other";
}

export function fileKindLabel(contentType: string): string {
  const kind = fileKind(contentType);
  return kind === "other" ? contentType : KINDS[kind].label;
}

export function FileKindIcon({ contentType }: { contentType: string }) {
  const kind = fileKind(contentType);
  const Icon = KINDS[kind].icon;
  return <Icon size={16} aria-hidden="true" className={`files-type-icon files-type-icon--${kind}`} data-kind={kind} />;
}
