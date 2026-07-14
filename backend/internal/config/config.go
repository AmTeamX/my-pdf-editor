package config

import "os"

type Config struct {
	Port         string
	APIKey       string
	DatabasePath string
	UploadDir    string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	apiKey := os.Getenv("API_KEY")
	if apiKey == "" {
		apiKey = "dev-api-key-change-me"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "data/pdfeditor.db"
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "uploads"
	}
	os.MkdirAll(uploadDir, 0755)
	os.MkdirAll("data", 0755)

	return &Config{Port: port, APIKey: apiKey, DatabasePath: dbPath, UploadDir: uploadDir}
}
