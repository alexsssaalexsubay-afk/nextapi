package uptoken

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAssetClientDecodesReviewMetadata(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/assets/ut-asset-portrait" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"virtual_id":"ut-asset-portrait",
			"asset_url":"asset://ut-asset-portrait",
			"url":"https://cdn.example/portrait.jpg",
			"status":"failed",
			"processing_status":"Rejected",
			"filename":"portrait.jpg",
			"size_bytes":204800,
			"rejection_reason":"The portrait was not approved for real-person reference use."
		}`))
	}))
	defer srv.Close()

	client := &AssetClient{apiKey: "ut-test", base: srv.URL, http: srv.Client()}
	asset, err := client.GetAsset(context.Background(), "ut-asset-portrait")
	if err != nil {
		t.Fatalf("GetAsset: %v", err)
	}
	if asset.ProcessingStatus != "Rejected" {
		t.Fatalf("ProcessingStatus = %q", asset.ProcessingStatus)
	}
	if asset.RejectionReason != "The portrait was not approved for real-person reference use." {
		t.Fatalf("RejectionReason = %q", asset.RejectionReason)
	}
	if asset.Filename != "portrait.jpg" || asset.SizeBytes != 204800 {
		t.Fatalf("metadata = filename:%q size:%d", asset.Filename, asset.SizeBytes)
	}
}

func TestAssetClientReturnsSanitizedUpstreamError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":{"code":"InvalidParameter","message":"image at position 1 resource download failed.","type":"upstream_error"}}`))
	}))
	defer srv.Close()

	client := &AssetClient{apiKey: "ut-test", base: srv.URL, http: srv.Client()}
	_, err := client.GetAsset(context.Background(), "ut-asset-bad")
	if err == nil {
		t.Fatal("expected error")
	}
	var assetErr *AssetError
	if !errors.As(err, &assetErr) {
		t.Fatalf("expected AssetError, got %T: %v", err, err)
	}
	if assetErr.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("StatusCode = %d", assetErr.StatusCode)
	}
	if assetErr.Message != "image at position 1 resource download failed." {
		t.Fatalf("Message = %q", assetErr.Message)
	}
}

func TestAssetClientUploadSendsDeclaredFileContentType(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/assets" {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer ut-test" {
			t.Fatalf("Authorization = %q", got)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("ParseMultipartForm: %v", err)
		}
		file, fh, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("FormFile: %v", err)
		}
		defer file.Close()
		raw, _ := io.ReadAll(file)
		if string(raw) != "jpeg-bytes" {
			t.Fatalf("file bytes = %q", string(raw))
		}
		if fh.Filename != "portrait.jpg" {
			t.Fatalf("filename = %q", fh.Filename)
		}
		if got := fh.Header.Get("Content-Type"); got != "image/jpeg" {
			t.Fatalf("file content type = %q", got)
		}
		if got := r.FormValue("content_type"); got != "image/jpeg" {
			t.Fatalf("content_type field = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"virtual_id":"ut-asset-uploaded","asset_url":"asset://ut-asset-uploaded","status":"pending"}`))
	}))
	defer srv.Close()

	client := &AssetClient{apiKey: "ut-test", base: srv.URL, http: srv.Client()}
	asset, err := client.UploadAsset(context.Background(), "portrait.jpg", "image/jpeg", []byte("jpeg-bytes"))
	if err != nil {
		t.Fatalf("UploadAsset: %v", err)
	}
	if asset.VirtualID != "ut-asset-uploaded" {
		t.Fatalf("VirtualID = %q", asset.VirtualID)
	}
}
