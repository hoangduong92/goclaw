package tools

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/nextlevelbuilder/goclaw/internal/providers"
)

// Registry manages tool registration and execution.
type Registry struct {
	tools       map[string]Tool
	mu          sync.RWMutex
	rateLimiter *ToolRateLimiter // nil = no rate limiting
	scrubbing   bool             // scrub credentials from output (default true)
}

func NewRegistry() *Registry {
	return &Registry{
		tools:     make(map[string]Tool),
		scrubbing: true, // enabled by default
	}
}

// SetRateLimiter enables per-key tool rate limiting.
func (r *Registry) SetRateLimiter(rl *ToolRateLimiter) {
	r.rateLimiter = rl
}

// SetScrubbing enables or disables credential scrubbing on tool output.
func (r *Registry) SetScrubbing(enabled bool) {
	r.scrubbing = enabled
}

// Register adds a tool to the registry.
func (r *Registry) Register(tool Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[tool.Name()] = tool
}

// Get returns a tool by name.
func (r *Registry) Get(name string) (Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.tools[name]
	return t, ok
}

// Unregister removes a tool from the registry by name.
func (r *Registry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.tools, name)
}

// Execute runs a tool by name with the given arguments.
func (r *Registry) Execute(ctx context.Context, name string, args map[string]interface{}) *Result {
	return r.ExecuteWithContext(ctx, name, args, "", "", "", "", nil)
}

// ExecuteWithContext runs a tool with channel/chat/session context and optional async callback.
// peerKind is "direct" or "group" (used by spawn/subagent tools for session key building).
// sessionKey is used to resolve sandbox scope (used by SandboxAware tools).
//
// Context values are injected into ctx so tools can read them without mutable fields,
// making tool instances thread-safe for concurrent execution.
func (r *Registry) ExecuteWithContext(ctx context.Context, name string, args map[string]interface{}, channel, chatID, peerKind, sessionKey string, asyncCB AsyncCallback) *Result {
	r.mu.RLock()
	tool, ok := r.tools[name]
	r.mu.RUnlock()

	if !ok {
		return ErrorResult("unknown tool: " + name)
	}

	// Inject per-call values into context (immutable — safe for concurrent use)
	if channel != "" {
		ctx = WithToolChannel(ctx, channel)
	}
	if chatID != "" {
		ctx = WithToolChatID(ctx, chatID)
	}
	if peerKind != "" {
		ctx = WithToolPeerKind(ctx, peerKind)
	}
	if sessionKey != "" {
		ctx = WithToolSandboxKey(ctx, sessionKey)
		ctx = WithToolSessionKey(ctx, sessionKey)
	}
	if asyncCB != nil {
		ctx = WithToolAsyncCB(ctx, asyncCB)
	}

	// Rate limit check (per session key)
	if r.rateLimiter != nil && sessionKey != "" {
		if err := r.rateLimiter.Allow(sessionKey); err != nil {
			return ErrorResult(err.Error())
		}
	}

	start := time.Now()
	result := tool.Execute(ctx, args)
	duration := time.Since(start)

	// Scrub credentials from tool output before returning to LLM
	if r.scrubbing {
		if result.ForLLM != "" {
			result.ForLLM = ScrubCredentials(result.ForLLM)
		}
		if result.ForUser != "" {
			result.ForUser = ScrubCredentials(result.ForUser)
		}
	}

	slog.Debug("tool executed",
		"tool", name,
		"duration_ms", duration.Milliseconds(),
		"is_error", result.IsError,
		"async", result.Async,
	)

	return result
}

// ProviderDefs returns tool definitions for LLM provider APIs.
func (r *Registry) ProviderDefs() []providers.ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()

	defs := make([]providers.ToolDefinition, 0, len(r.tools))
	for _, tool := range r.tools {
		defs = append(defs, ToProviderDef(tool))
	}
	return defs
}

// List returns all registered tool names.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	return names
}

// Count returns the number of registered tools.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tools)
}

// Clone creates a shallow copy of the registry with all registered tools.
// The clone shares the rate limiter (thread-safe) and scrubbing setting.
// Used by subagent toolsFactory so subagents inherit parent tools (web_fetch, web_search, etc.).
func (r *Registry) Clone() *Registry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	clone := &Registry{
		tools:       make(map[string]Tool, len(r.tools)),
		rateLimiter: r.rateLimiter,
		scrubbing:   r.scrubbing,
	}
	for name, tool := range r.tools {
		clone.tools[name] = tool
	}
	return clone
}
