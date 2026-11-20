package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// HashPassword returns a bcrypt hash with a work factor suitable for an
// interactive login.
func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	if len(password) > 200 {
		return "", errors.New("password is too long")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Claims is the JWT payload issued by the API.
type Claims struct {
	UserID string `json:"sub"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	OrgID  string `json:"org"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret []byte
	ttl    time.Duration
	issuer string
}

func NewManager(secret string) *Manager {
	return &Manager{secret: []byte(secret), ttl: 7 * 24 * time.Hour, issuer: "leknowde"}
}

func (m *Manager) Issue(userID, email, name, orgID string) (string, time.Time, error) {
	expires := time.Now().Add(m.ttl)
	claims := Claims{
		UserID: userID,
		Email:  email,
		Name:   name,
		OrgID:  orgID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expires),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	return token, expires, err
}

func (m *Manager) Parse(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	}, jwt.WithIssuer(m.issuer), jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// BearerToken extracts a token from an Authorization header.
func BearerToken(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.SplitN(strings.TrimSpace(header), " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
		return strings.TrimSpace(parts[1])
	}
	return ""
}
