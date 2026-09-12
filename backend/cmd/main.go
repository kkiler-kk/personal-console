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

	// 每日价格快照调度器 + 启动补跑（quote.Service 无共享可变状态，
	// 与 router.Setup 内部实例并存安全：Redis/DB 共享，仅多一个 HTTP client）。
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cronHandle := service.StartSnapshotScheduler(ctx, db, quote.NewService(cfg, db, rdb))
	defer cronHandle.Stop()

	r := router.Setup(cfg, db, rdb)

	log.Printf("server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
