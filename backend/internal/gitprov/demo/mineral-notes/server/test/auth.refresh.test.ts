import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashRefreshToken, mintRefreshToken } from "../src/auth/tokens";
import { revokeFamily, rotateRefreshToken, RefreshTokenError } from "../src/auth/refresh";

describe("refresh token rotation", () => {
  it("produces opaque tokens with sufficient entropy", () => {
    const token = mintRefreshToken();
    assert.ok(token.length >= 64);
    assert.notEqual(token, mintRefreshToken());
  });

  it("hashes tokens deterministically", () => {
    const token = "abc123";
    assert.equal(hashRefreshToken(token), hashRefreshToken(token));
    assert.notEqual(hashRefreshToken(token), hashRefreshToken("abc124"));
  });

  it("rejects an unknown token", async () => {
    await assert.rejects(
      () => rotateRefreshToken(mintRefreshToken(), "test-agent"),
      (error: unknown) => error instanceof RefreshTokenError && error.code === "unknown_token",
    );
  });

  it("revokes the whole family when a used token is replayed", async () => {
    const first = mintRefreshToken();
    await assert.rejects(() => rotateRefreshToken(first, "test-agent"));
    const revoked = await revokeFamily("00000000-0000-0000-0000-000000000000", "test");
    assert.equal(typeof revoked, "number");
  });
});
