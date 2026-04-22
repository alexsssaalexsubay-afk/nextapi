package auth

import "testing"

func TestKeyRoundTrip(t *testing.T) {
	cases := []struct {
		kind Kind
		env  Env
	}{
		{KindBusiness, EnvLive},
		{KindBusiness, EnvTest},
		{KindAdmin, EnvLive},
		{KindAdmin, EnvTest},
	}
	for _, c := range cases {
		full, prefix, err := NewKey(c.kind, c.env)
		if err != nil {
			t.Fatal(err)
		}
		if ParsePrefix(full) != prefix {
			t.Fatalf("prefix mismatch: %q vs %q", ParsePrefix(full), prefix)
		}
		k, e, err := ClassifyKey(full)
		if err != nil || k != c.kind || e != c.env {
			t.Fatalf("classify mismatch: got %v/%v/%v", k, e, err)
		}
		hash, err := Hash(full)
		if err != nil {
			t.Fatal(err)
		}
		if err := Verify(full, hash); err != nil {
			t.Fatalf("verify failed: %v", err)
		}
		if err := Verify(full+"x", hash); err == nil {
			t.Fatal("expected failure for tampered key")
		}
	}
}

func TestClassifyInvalid(t *testing.T) {
	if _, _, err := ClassifyKey("nope"); err == nil {
		t.Fatal("want err for invalid")
	}
	if _, _, err := ClassifyKey("xx_live_123"); err == nil {
		t.Fatal("want err for unknown kind")
	}
	if _, _, err := ClassifyKey("sk_stage_123"); err == nil {
		t.Fatal("want err for unknown env")
	}
}
