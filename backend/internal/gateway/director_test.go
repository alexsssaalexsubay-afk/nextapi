package gateway

import "testing"

func TestShouldRunDirectorWorkflowRequiresExplicitTrue(t *testing.T) {
	if shouldRunDirectorWorkflow(nil) {
		t.Fatal("nil run_workflow must not run paid workflow execution")
	}
	no := false
	if shouldRunDirectorWorkflow(&no) {
		t.Fatal("run_workflow=false must not run paid workflow execution")
	}
	yes := true
	if !shouldRunDirectorWorkflow(&yes) {
		t.Fatal("run_workflow=true should run workflow execution")
	}
}
