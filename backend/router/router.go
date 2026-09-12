package router

import (
	"blog/config"
	"blog/handler"
	"blog/middleware"
	"blog/pkg/quote"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

func Setup(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// handlers
	uh := handler.NewUserHandler(cfg, db)
	ph := handler.NewPostHandler(cfg, db, rdb)
	ch := handler.NewCategoryHandler(cfg, db, rdb)
	th := handler.NewTagHandler(cfg, db, rdb)
	uh2 := handler.NewUploadHandler()
	gh := handler.NewGalleryHandler()
	cmth := handler.NewCommentHandler(cfg, db)
	dh := handler.NewDashboardHandler(db, rdb)
	auth := middleware.AuthMiddleware(cfg.JWTSecret)

	// invest: quote.Service 构造一次，由 asset/invest handler 共享
	qs := quote.NewService(cfg, db, rdb)
	ah := handler.NewAssetHandler(db, qs, rdb)
	trh := handler.NewTradeHandler(db, rdb)
	ih := handler.NewInvestHandler(db, qs)

	// serve uploaded files
	r.Static("/uploads", "./uploads")

	// public api
	api := r.Group("/api")
	{
		// auth
		api.POST("/auth/login", uh.Login)

		// posts (public)
		api.GET("/posts/archive", ph.Archive)
		api.GET("/posts", ph.List)
		api.GET("/posts/:slug", ph.GetBySlug)

		// categories
		api.GET("/categories", ch.List)

		// tags
		api.GET("/tags", th.List)

		// comments (public)
		api.GET("/posts/:slug/comments", cmth.List)
		api.POST("/posts/:slug/comments", cmth.Create)
		api.POST("/comments/:id/like", cmth.Like)
		api.GET("/comments/:id/like", cmth.CheckLike)
		api.DELETE("/comments/:id", cmth.Delete)
	}

	// protected api
	protected := r.Group("/api")
	protected.Use(auth)
	{
		// user
		protected.GET("/user/profile", uh.Profile)
		protected.PUT("/user/profile", uh.UpdateProfile)

		// posts (admin)
		protected.POST("/posts", ph.Create)
		protected.PUT("/posts/:id", ph.Update)
		protected.DELETE("/posts/:id", ph.Delete)
		protected.GET("/admin/posts", ph.AdminList)

		// categories (admin)
		protected.POST("/categories", ch.Create)
		protected.PUT("/categories/:id", ch.Update)
		protected.DELETE("/categories/:id", ch.Delete)

		// upload (admin)
		protected.POST("/upload", uh2.Upload)

		// gallery (admin)
		protected.GET("/gallery", gh.List)
		protected.DELETE("/gallery/:filename", gh.Delete)

		// dashboard
		protected.GET("/dashboard/summary", dh.Summary)

		// invest: assets
		protected.GET("/assets", ah.List)
		protected.POST("/assets", ah.Create)
		protected.PUT("/assets/:id", ah.Update)
		protected.DELETE("/assets/:id", ah.Delete)
		protected.PUT("/assets/:id/price", ah.UpdatePrice)

		// invest: trades
		protected.GET("/trades", trh.List)
		protected.POST("/trades", trh.Create)
		protected.DELETE("/trades/:id", trh.Delete)

		// invest: positions / quotes / price history
		protected.GET("/positions", ih.Positions)
		protected.GET("/positions/history", ih.PositionsHistory)
		protected.GET("/quotes", ih.Quotes)
		protected.GET("/price-history", ih.PriceHistory)
	}

	return r
}
