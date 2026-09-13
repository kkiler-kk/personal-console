package middleware

import "github.com/gin-gonic/gin"

// SingleUserMiddleware 单用户本地部署：所有请求视为首个用户（users.id=1）。
// 2026-09-13 用户决定移除登录。公网部署前必须恢复 JWT 认证（见 spec §8）。
func SingleUserMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", int64(1))
		c.Set("username", "felix")
		c.Next()
	}
}
