package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (s *Server) handleListNotifications(c *gin.Context) {
	list, err := s.store.ListNotifications(c.Request.Context(), userID(c), 50)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load notifications.")
		return
	}
	unread := 0
	for _, n := range list {
		if !n.Read {
			unread++
		}
	}
	ok(c, gin.H{"notifications": list, "unread": unread})
}

func (s *Server) handleReadNotifications(c *gin.Context) {
	var req struct {
		ID string `json:"id"`
	}
	_ = c.ShouldBindJSON(&req)
	if err := s.store.MarkNotificationsRead(c.Request.Context(), userID(c), req.ID); err != nil {
		fail(c, http.StatusInternalServerError, "update_failed", "Could not update notifications.")
		return
	}
	ok(c, gin.H{"status": "updated"})
}

func (s *Server) handleAuditLogs(c *gin.Context) {
	logs, err := s.store.ListAuditLogs(c.Request.Context(), orgID(c), queryInt(c, "limit", 100, 1, 500))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load the audit log.")
		return
	}
	ok(c, gin.H{"logs": logs})
}
