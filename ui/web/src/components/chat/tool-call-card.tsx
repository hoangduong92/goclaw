import { useState } from "react";
import { Wrench, Check, AlertTriangle, Loader2, ChevronRight } from "lucide-react";
import type { ToolStreamEntry } from "@/types/chat";

interface ToolCallCardProps {
  entry: ToolStreamEntry;
}

export function ToolCallCard({ entry }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = entry.arguments && Object.keys(entry.arguments).length > 0;
  const hasError = entry.phase === "error" && !!entry.errorContent;
  const canExpand = hasArgs || hasError;

  return (
    <div className="my-1 rounded-md border bg-muted/50 overflow-hidden">
      <button
        type="button"
        onClick={() => canExpand && setExpanded(!expanded)}
        className={`flex items-start gap-2 w-full text-left px-3 py-2 text-sm ${
          canExpand ? "cursor-pointer hover:bg-muted/80 transition-colors" : "cursor-default"
        }`}
      >
        <ToolIcon phase={entry.phase} />
        <span className="font-mono text-xs break-all">{entry.name}</span>
        <PhaseLabel phase={entry.phase} />
        {canExpand && (
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        )}
      </button>
      {expanded && canExpand && (
        <div className="px-3 pb-2 border-t bg-muted/30 text-[11px] overflow-auto max-h-48">
          {hasError && (
            <pre className="text-red-500 whitespace-pre-wrap">{entry.errorContent}</pre>
          )}
          {hasArgs && (
            <pre className="text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(entry.arguments, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolIcon({ phase }: { phase: ToolStreamEntry["phase"] }) {
  switch (phase) {
    case "calling":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "completed":
      return <Check className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <Wrench className="h-4 w-4 text-muted-foreground" />;
  }
}

function PhaseLabel({ phase }: { phase: ToolStreamEntry["phase"] }) {
  const labels: Record<string, string> = {
    calling: "Running...",
    completed: "Done",
    error: "Failed",
  };
  const colors: Record<string, string> = {
    calling: "text-blue-500",
    completed: "text-green-500",
    error: "text-red-500",
  };
  return (
    <span className={`ml-auto text-xs ${colors[phase] ?? "text-muted-foreground"}`}>
      {labels[phase] ?? phase}
    </span>
  );
}
