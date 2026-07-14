package handler

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	useMinIO bool
	minio    *minio.Client
	bucket   string
	baseDir  string
}

func NewStorage(baseDir string) (*Storage, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		os.MkdirAll(baseDir, 0755)
		return &Storage{useMinIO: false, baseDir: baseDir}, nil
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "pdf-uploads"
	}
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio connect: %w", err)
	}
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio create bucket: %w", err)
		}
	}
	return &Storage{useMinIO: true, minio: client, bucket: bucket, baseDir: baseDir}, nil
}

func (s *Storage) Save(filename string, reader io.Reader, size int64, contentType string) (string, error) {
	if s.useMinIO {
		_, err := s.minio.PutObject(context.Background(), s.bucket, filename, reader, size, minio.PutObjectOptions{ContentType: contentType})
		if err != nil {
			return "", fmt.Errorf("minio put: %w", err)
		}
		return filename, nil
	}
	destPath := filepath.Join(s.baseDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, reader); err != nil {
		os.Remove(destPath)
		return "", err
	}
	return filename, nil
}

func (s *Storage) Open(filename string) (io.ReadCloser, error) {
	if s.useMinIO {
		obj, err := s.minio.GetObject(context.Background(), s.bucket, filename, minio.GetObjectOptions{})
		if err != nil {
			return nil, fmt.Errorf("minio get: %w", err)
		}
		return obj, nil
	}
	return os.Open(filepath.Join(s.baseDir, filename))
}

func (s *Storage) Delete(filename string) error {
	if s.useMinIO {
		return s.minio.RemoveObject(context.Background(), s.bucket, filename, minio.RemoveObjectOptions{})
	}
	return os.Remove(filepath.Join(s.baseDir, filename))
}
