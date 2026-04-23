package domain

import "testing"

// ---------------------------------------------------------------------------
// IsTerminal
// ---------------------------------------------------------------------------

func TestIsTerminal_TerminalStates(t *testing.T) {
	for _, s := range []JobStatus{JobSucceeded, JobFailed, JobTimedOut, JobCanceled} {
		if !s.IsTerminal() {
			t.Errorf("expected %s to be terminal", s)
		}
	}
}

func TestIsTerminal_NonTerminalStates(t *testing.T) {
	for _, s := range []JobStatus{JobQueued, JobSubmitting, JobRunning, JobRetrying} {
		if s.IsTerminal() {
			t.Errorf("expected %s NOT to be terminal", s)
		}
	}
}

// ---------------------------------------------------------------------------
// IsRetryable
// ---------------------------------------------------------------------------

func TestIsRetryable_FailedAndTimedOut(t *testing.T) {
	for _, s := range []JobStatus{JobFailed, JobTimedOut} {
		if !s.IsRetryable() {
			t.Errorf("expected %s to be retryable", s)
		}
	}
}

func TestIsRetryable_OtherStatesNotRetryable(t *testing.T) {
	for _, s := range []JobStatus{JobQueued, JobSubmitting, JobRunning, JobRetrying, JobSucceeded, JobCanceled} {
		if s.IsRetryable() {
			t.Errorf("expected %s NOT to be retryable", s)
		}
	}
}

// ---------------------------------------------------------------------------
// CanTransitionTo — valid edges
// ---------------------------------------------------------------------------

var validEdges = []struct {
	from JobStatus
	to   JobStatus
}{
	{JobQueued, JobSubmitting},
	{JobQueued, JobFailed},
	{JobQueued, JobCanceled},
	{JobSubmitting, JobRunning},
	{JobSubmitting, JobRetrying},
	{JobSubmitting, JobFailed},
	{JobSubmitting, JobCanceled},
	{JobRunning, JobSucceeded},
	{JobRunning, JobFailed},
	{JobRunning, JobTimedOut},
	{JobRunning, JobCanceled},
	{JobRetrying, JobSubmitting},
	{JobRetrying, JobFailed},
	{JobRetrying, JobTimedOut},
	{JobRetrying, JobCanceled},
}

func TestCanTransitionTo_ValidEdges(t *testing.T) {
	for _, e := range validEdges {
		if !e.from.CanTransitionTo(e.to) {
			t.Errorf("expected valid transition %s → %s", e.from, e.to)
		}
	}
}

// ---------------------------------------------------------------------------
// CanTransitionTo — invalid / forbidden edges
// ---------------------------------------------------------------------------

var invalidEdges = []struct {
	from JobStatus
	to   JobStatus
}{
	// Terminal states have no outgoing edges.
	{JobSucceeded, JobQueued},
	{JobSucceeded, JobRunning},
	{JobSucceeded, JobFailed},
	{JobFailed, JobQueued},
	{JobFailed, JobRunning},
	{JobFailed, JobSucceeded},
	{JobTimedOut, JobRunning},
	{JobCanceled, JobRunning},
	// Illogical backward transitions.
	{JobRunning, JobQueued},
	{JobSubmitting, JobQueued},
	{JobRetrying, JobQueued},
	{JobRetrying, JobRunning}, // must go through submitting first
	// queued can't skip to succeeded
	{JobQueued, JobSucceeded},
	{JobQueued, JobRunning},
}

func TestCanTransitionTo_InvalidEdges(t *testing.T) {
	for _, e := range invalidEdges {
		if e.from.CanTransitionTo(e.to) {
			t.Errorf("expected INVALID transition %s → %s to be rejected", e.from, e.to)
		}
	}
}

// ---------------------------------------------------------------------------
// ValidTransitions coverage: every terminal state has no outgoing edges.
// ---------------------------------------------------------------------------

func TestValidTransitions_TerminalStatesHaveNoEdges(t *testing.T) {
	for _, s := range []JobStatus{JobSucceeded, JobFailed, JobTimedOut, JobCanceled} {
		if edges, ok := ValidTransitions[s]; ok && len(edges) > 0 {
			t.Errorf("terminal state %s should have 0 outgoing edges, got %v", s, edges)
		}
	}
}
