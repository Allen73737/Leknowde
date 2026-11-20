package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
)

// Cipher encrypts provider credentials at rest with AES-256-GCM.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher accepts a base64 or raw 32-byte key. When the key is absent (local
// development only) it derives a stable key from the JWT secret.
func NewCipher(key, fallbackSecret string) (*Cipher, error) {
	var raw []byte
	if key != "" {
		if decoded, err := base64.StdEncoding.DecodeString(key); err == nil && len(decoded) == 32 {
			raw = decoded
		} else if len(key) == 32 {
			raw = []byte(key)
		} else {
			sum := sha256.Sum256([]byte(key))
			raw = sum[:]
		}
	} else {
		sum := sha256.Sum256([]byte("leknowde-encryption:" + fallbackSecret))
		raw = sum[:]
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

func (c *Cipher) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("ciphertext too short")
	}
	plain, err := c.aead.Open(nil, raw[:ns], raw[ns:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// HashToken produces a stable hash for single-use tokens (password reset).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func RandomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
