import { useState } from "react";
import { Bot, User, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { MessageContent } from "./message-content";
import type { ChatMessage } from "@/types/chat";
import type { ToolCall } from "@/types/session";

interface MessageBubbleProps {
  message: ChatMessage;
  toolCallErrors?: Map<string, string>;
}

export function MessageBubble({ message, toolCallErrors }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isTool) {
    return null; // Tool messages are shown inline with assistant messages
  }

  const hasContent = !!message.content?.trim();
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

  // Skip assistant messages with neither text nor tool calls
  if (!isUser && !hasContent && !hasToolCalls) {
    return null;
  }

  // Tool-call-only assistant message: render compact tool call list
  if (!isUser && !hasContent && hasToolCalls) {
    return (
      <div className="space-y-1">
        {message.tool_calls!.map((tc) => (
          <ToolCallItem key={tc.id} toolCall={tc} isError={toolCallErrors?.has(tc.id)} errorContent={toolCallErrors?.get(tc.id)} />
        ))}
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border shadow-sm"
        }`}
      >
        {hasToolCalls && (
          <div className="mb-2 space-y-1">
            {message.tool_calls!.map((tc) => (
              <ToolCallItem key={tc.id} toolCall={tc} compact isError={toolCallErrors?.has(tc.id)} errorContent={toolCallErrors?.get(tc.id)} />
            ))}
          </div>
        )}
        <MessageContent content={message.content} role={message.role} />
        {message.timestamp && (
          <div className={`mt-1 text-[10px] ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallItem({ toolCall, compact, isError, errorContent }: { toolCall: ToolCall; compact?: boolean; isError?: boolean; errorContent?: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = toolCall.arguments && Object.keys(toolCall.arguments).length > 0;
  const canExpand = hasArgs || (isError && !!errorContent);
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  const StatusIcon = isError
    ? <AlertTriangle className={`${iconSize} shrink-0 text-red-500`} />
    : <Check className={`${iconSize} shrink-0 text-green-500`} />;

  return (
    <div className={compact ? "" : "rounded-md border bg-muted/50 overflow-hidden"}>
      <button
        type="button"
        onClick={() => canExpand && setExpanded(!expanded)}
        className={`flex items-center gap-1.5 w-full text-left ${
          compact
            ? "text-xs text-muted-foreground py-0.5"
            : "px-3 py-1.5 text-sm hover:bg-muted/80 transition-colors"
        } ${canExpand ? "cursor-pointer" : "cursor-default"}`}
      >
        {StatusIcon}
        <span className={`font-mono truncate ${compact ? "" : "text-xs"}`}>{toolCall.name}</span>
        {canExpand && (
          <ChevronRight className={`h-3 w-3 shrink-0 ml-auto text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        )}
      </button>
      {expanded && canExpand && (
        <div className={`text-[11px] overflow-auto max-h-48 ${
          compact ? "pl-4.5 pb-1" : "px-3 pb-2 border-t bg-muted/30"
        }`}>
          {isError && errorContent && (
            <pre className="text-red-500 whitespace-pre-wrap">{errorContent}</pre>
          )}
          {hasArgs && (
            <pre className="text-muted-foreground">{JSON.stringify(toolCall.arguments, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
