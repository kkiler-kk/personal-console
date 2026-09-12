package main

import (
	"context"
	"log"

	"blog/config"
	"blog/pkg/quote"
	"blog/router"
	"blog/service"
)

func main() {
	cfg := config.Load()

	db := config.InitDB(cfg)
	defer db.Close()

	rdb := config.InitRedis(cfg)
	defer rdb.Close()

	// auto migrate
	autoMigrate(db)

	// quote.Service 全局单实例（task 4.5）：快照调度器与 router 内 handler 共享，
	// 消除双实例双 HTTP client/连接池。
	qs := quote.NewService(cfg, db, rdb)

	// 每日价格快照调度器 + 启动补跑
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cronHandle := service.StartSnapshotScheduler(ctx, db, qs)
	defer cronHandle.Stop()

	r := router.Setup(cfg, db, rdb, qs)

	log.Printf("server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
