package videomerge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSucceededClipsKeepsOnlyFinishedClipsWithURLs(t *testing.T) {
	clips := succeededClips([]mergeClip{
		{JobID: "1", Status: "succeeded", VideoURL: "https://cdn.example/1.mp4"},
		{JobID: "2", Status: "failed", VideoURL: "https://cdn.example/2.mp4"},
		{JobID: "3", Status: "succeeded", VideoURL: "   "},
		{JobID: "4", Status: "succeeded", VideoURL: "https://cdn.example/4.mp4"},
	})
	if len(clips) != 2 {
		t.Fatalf("succeeded clips = %d; want 2", len(clips))
	}
	if clips[0].JobID != "1" || clips[1].JobID != "4" {
		t.Fatalf("clip order = %#v; want successful source order", clips)
	}
}

func TestWriteConcatListUsesFFmpegConcatFormat(t *testing.T) {
	path := filepath.Join(t.TempDir(), "concat.txt")
	if err := writeConcatList(path, []string{"/tmp/a.mp4", "/tmp/b.mp4"}); err != nil {
		t.Fatalf("writeConcatList returned error: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read concat list: %v", err)
	}
	got := string(data)
	for _, want := range []string{"file '/tmp/a.mp4'", "file '/tmp/b.mp4'"} {
		if !strings.Contains(got, want) {
			t.Fatalf("concat list = %q; missing %q", got, want)
		}
	}
}

func TestExecutorEnabledRequiresBothFlags(t *testing.T) {
	t.Setenv("VIDEO_MERGE_ENABLED", "true")
	t.Setenv("VIDEO_MERGE_EXECUTOR_ENABLED", "false")
	if executorEnabled() {
		t.Fatal("executor should stay disabled until executor flag is true")
	}
	t.Setenv("VIDEO_MERGE_EXECUTOR_ENABLED", "true")
	if !executorEnabled() {
		t.Fatal("executor should be enabled when both flags are true")
	}
}
