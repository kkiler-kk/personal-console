package main

import (
	"log"

	"blog/config"
	"blog/router"
)

func main() {
	cfg := config.Load()

	db := config.InitDB(cfg)
	defer db.Close()

	rdb := config.InitRedis(cfg)
	defer rdb.Close()

	// auto migrate
	autoMigrate(db)

	r := router.Setup(cfg, db, rdb)

	log.Printf("server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
