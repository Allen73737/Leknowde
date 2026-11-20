// Package migrations embeds the portable SQL schema so the API can apply
// schema changes at startup without shipping migration tooling to production.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
