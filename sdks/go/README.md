# nextapi-go

Official Go SDK for [NextAPI](https://api.nextapi.top). No external dependencies.

## Install

```bash
go get github.com/sanidg/nextapi-go
```

## Usage

```go
package main

import (
	"context"
	"fmt"

	nextapi "github.com/sanidg/nextapi-go"
)

func main() {
	c := nextapi.NewClient("sk-...")

	job, err := c.Generate(context.Background(), nextapi.GenerateRequest{
		Prompt:          "A cat surfing on a rainbow",
		Model:           "seedance-v2-pro",
		DurationSeconds: 5,
		Resolution:      "1080p",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(job.ID, job.Status, job.EstimatedCredits)

	final, err := c.Wait(context.Background(), job.ID, 0, 0)
	if err != nil {
		panic(err)
	}
	fmt.Println(final.Status)
}
```

## Errors

Non-2xx responses return a `*nextapi.Error` with `Code`, `Message`, and `StatusCode`.
