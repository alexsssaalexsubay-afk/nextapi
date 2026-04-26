package debuglog

import (
	"encoding/json"
	"os"
	"time"
)

const (
	sessionID = "f88467"
	logPath   = "/Users/sunwuyuan/Desktop/nextapi-v3/.cursor/debug-f88467.log"
)

type Entry struct {
	SessionID    string         `json:"sessionId"`
	RunID        string         `json:"runId"`
	HypothesisID string         `json:"hypothesisId"`
	Location     string         `json:"location"`
	Message      string         `json:"message"`
	Data         map[string]any `json:"data"`
	Timestamp    int64          `json:"timestamp"`
}

func Write(runID, hypothesisID, location, message string, data map[string]any) {
	entry := Entry{
		SessionID:    sessionID,
		RunID:        runID,
		HypothesisID: hypothesisID,
		Location:     location,
		Message:      message,
		Data:         data,
		Timestamp:    time.Now().UnixMilli(),
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return
	}
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}
