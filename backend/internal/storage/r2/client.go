package r2

import (
	"context"
	"errors"
	"io"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Client struct {
	s3     *s3.Client
	bucket string
}

// New creates a Cloudflare R2 client using the S3-compatible API.
func New() (*Client, error) {
	account := os.Getenv("R2_ACCOUNT_ID")
	access := os.Getenv("R2_ACCESS_KEY_ID")
	if access == "" {
		access = os.Getenv("R2_ACCESS_KEY")
	}
	secret := os.Getenv("R2_SECRET_ACCESS_KEY")
	if secret == "" {
		secret = os.Getenv("R2_SECRET_KEY")
	}
	bucket := os.Getenv("R2_BUCKET")
	if account == "" || access == "" || secret == "" || bucket == "" {
		return nil, errors.New("R2 env vars missing")
	}
	endpoint := os.Getenv("R2_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://" + account + ".r2.cloudflarestorage.com"
	}
	cli := s3.New(s3.Options{
		Region:       "auto",
		Credentials:  credentials.NewStaticCredentialsProvider(access, secret, ""),
		BaseEndpoint: aws.String(endpoint),
	})
	return &Client{s3: cli, bucket: bucket}, nil
}

// Upload streams body to key.
func (c *Client) Upload(ctx context.Context, key string, body io.Reader, contentType string) error {
	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        body,
		ContentType: aws.String(contentType),
	})
	return err
}

// Delete removes an object by key. Missing objects are treated as success by S3/R2.
func (c *Client) Delete(ctx context.Context, key string) error {
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	return err
}

// PresignGet returns a URL valid for `expires`.
func (c *Client) PresignGet(ctx context.Context, key string, expires time.Duration) (string, error) {
	ps := s3.NewPresignClient(c.s3)
	req, err := ps.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}
