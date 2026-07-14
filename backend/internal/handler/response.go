package handler

import (
	"encoding/json"
	"net/http"
	"os"
)

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string, err error) {
	resp := map[string]string{"error": message}
	if err != nil && os.Getenv("DEBUG") == "1" {
		resp["details"] = err.Error()
	}
	writeJSON(w, status, resp)
}
