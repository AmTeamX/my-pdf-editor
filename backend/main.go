package main

import (
	"log"
	"net/http"
	"os"

	"github.com/my-pdf-editor/backend/internal/config"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/router"
)

func main() {
	cfg := config.Load()

	var db database.Database
	var err error

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		log.Printf("Using PostgreSQL")
		db, err = database.NewPostgres(dsn)
	} else {
		log.Printf("Using SQLite: %s", cfg.DatabasePath)
		db, err = database.NewSQLite(cfg.DatabasePath)
	}
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	r := router.New(db, cfg)
	addr := ":" + cfg.Port
	log.Printf("PDF Editor API starting on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}
