package http

import (
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// FilesHandler serves workspace files over HTTP with Bearer token auth.
type FilesHandler struct {
	workspaceRoot string
	token         string
}

// NewFilesHandler creates a handler that serves files from the workspace root.
func NewFilesHandler(workspaceRoot, token string) *FilesHandler {
	return &FilesHandler{workspaceRoot: workspaceRoot, token: token}
}

// RegisterRoutes registers the file serving route.
func (h *FilesHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/files/{path...}", h.auth(h.handleServe))
}

func (h *FilesHandler) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h.token != "" {
			// Accept token via Bearer header or ?token= query param (for <img src>).
			provided := extractBearerToken(r)
			if provided == "" {
				provided = r.URL.Query().Get("token")
			}
			if provided != h.token {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
		}
		next(w, r)
	}
}

func (h *FilesHandler) handleServe(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	if relPath == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	// Prevent path traversal
	if strings.Contains(relPath, "..") {
		slog.Warn("security.files_traversal", "path", relPath)
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	absPath := filepath.Join(h.workspaceRoot, relPath)

	// Double-check the resolved path is within the workspace
	cleanAbs := filepath.Clean(absPath)
	cleanRoot := filepath.Clean(h.workspaceRoot)
	if !strings.HasPrefix(cleanAbs, cleanRoot+string(filepath.Separator)) && cleanAbs != cleanRoot {
		slog.Warn("security.files_escape", "resolved", cleanAbs, "root", cleanRoot)
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(cleanAbs)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	// Set Content-Type from extension
	ext := filepath.Ext(cleanAbs)
	ct := mime.TypeByExtension(ext)
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}

	http.ServeFile(w, r, cleanAbs)
}
