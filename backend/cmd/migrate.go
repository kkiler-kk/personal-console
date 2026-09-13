package main

import (
	"log"

	"github.com/jmoiron/sqlx"
)

func autoMigrate(db *sqlx.DB) {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(50) NOT NULL UNIQUE,
			password VARCHAR(255) NOT NULL,
			nickname VARCHAR(50) NOT NULL DEFAULT '',
			avatar VARCHAR(255) NOT NULL DEFAULT '',
			bio TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS categories (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(50) NOT NULL,
			slug VARCHAR(50) NOT NULL UNIQUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS posts (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			title VARCHAR(200) NOT NULL,
			slug VARCHAR(255) NOT NULL UNIQUE,
			summary TEXT,
			content LONGTEXT NOT NULL,
			author_id BIGINT NOT NULL,
			category_id BIGINT DEFAULT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'published',
			view_count INT NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_author (author_id),
			INDEX idx_category (category_id),
			INDEX idx_status (status),
			INDEX idx_created (created_at),
			INDEX idx_slug (slug),
			FOREIGN KEY (author_id) REFERENCES users(id),
			FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS tags (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(50) NOT NULL UNIQUE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS post_tags (
			post_id BIGINT NOT NULL,
			tag_id BIGINT NOT NULL,
			PRIMARY KEY (post_id, tag_id),
			FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
			FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS comments (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			post_id BIGINT NOT NULL,
			parent_id BIGINT DEFAULT NULL,
			name VARCHAR(50) NOT NULL DEFAULT '',
			email VARCHAR(255) NOT NULL,
			content TEXT NOT NULL,
			like_count INT NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_post (post_id),
			INDEX idx_parent (parent_id),
			FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
			FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS comment_likes (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			comment_id BIGINT NOT NULL,
			email VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uk_comment_email (comment_id, email),
			FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS assets (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			symbol VARCHAR(32) NOT NULL UNIQUE,
			name VARCHAR(100) NOT NULL,
			type VARCHAR(16) NOT NULL DEFAULT 'stock',
			price_source VARCHAR(32) NOT NULL DEFAULT 'yahoo',
			currency VARCHAR(8) NOT NULL DEFAULT 'USD',
			current_price DECIMAL(18,4),
			price_updated_at DATETIME,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS trades (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			asset_id BIGINT NOT NULL,
			side VARCHAR(8) NOT NULL,
			quantity DECIMAL(18,6) NOT NULL,
			price DECIMAL(18,4) NOT NULL,
			fee DECIMAL(12,2) NOT NULL DEFAULT 0,
			traded_at DATE NOT NULL,
			note TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (asset_id) REFERENCES assets(id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS price_history (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			symbol VARCHAR(32) NOT NULL,
			date DATE NOT NULL,
			close DECIMAL(18,4) NOT NULL,
			UNIQUE KEY uk_symbol_date (symbol, date)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS language_profiles (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			lang VARCHAR(8) NOT NULL UNIQUE,
			level VARCHAR(50) NOT NULL DEFAULT '',
			goal TEXT,
			note TEXT,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS study_sessions (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			lang VARCHAR(8) NOT NULL,
			activity VARCHAR(20) NOT NULL DEFAULT 'other',
			minutes INT NOT NULL DEFAULT 0,
			session_date DATE NOT NULL,
			note VARCHAR(200),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			KEY idx_session_date (session_date),
			KEY idx_lang_date (lang, session_date)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS habits (
			id BIGINT PRIMARY KEY AUTO_INCREMENT,
			name VARCHAR(50) NOT NULL,
			icon VARCHAR(16),
			color VARCHAR(16),
			archived BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS habit_logs (
			habit_id BIGINT NOT NULL,
			log_date DATE NOT NULL,
			PRIMARY KEY (habit_id, log_date)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	}

	for _, sql := range statements {
		if _, err := db.Exec(sql); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	// add categories.section if missing (idempotent)
	var colCount int
	if err := db.Get(&colCount, `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = 'categories' AND column_name = 'section'`); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}
	if colCount == 0 {
		if _, err := db.Exec("ALTER TABLE categories ADD COLUMN section VARCHAR(20) NOT NULL DEFAULT 'blog'"); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	// seed 随手记 category for the life module (idempotent via INSERT IGNORE on unique slug).
	// Must run after categories.section exists. Cache staleness self-heals via 30min TTL
	// (autoMigrate has no redis client by design — do not refactor main.go for this).
	if _, err := db.Exec(`INSERT IGNORE INTO categories (name, slug, section) VALUES ('随手记', 'notes', 'life')`); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	// seed the single-user "felix" account (id=1). SingleUserMiddleware treats every request as
	// users.id=1, but the Register endpoint was removed with the login flow (2026-09-13), so a
	// fresh database would otherwise have no way to create that row. Placed after the statements
	// loop (users table exists) alongside the notes seed. INSERT IGNORE is idempotent: on an
	// existing DB that already has a user with id=1 it is a no-op. The password is a bcrypt hash
	// (cost 10) of the fixed non-secret string "single-user-no-login" — it is NOT loginable
	// (auth removed); if auth is ever restored the user should change this password.
	if _, err := db.Exec(`INSERT IGNORE INTO users (id, username, password, nickname) VALUES (1, 'felix', '$2a$10$HVXvvmJ7ZlX/.Y2JfxkBROLeH29JinMlx.qq.xvQpZYYuegl1pDO6', 'Felix')`); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	// widen assets.price_source to fit 'computed_gold_cny' (17 chars > legacy VARCHAR(16)); idempotent
	var priceSourceLen int
	if err := db.Get(&priceSourceLen, `
		SELECT character_maximum_length FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'price_source'`); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}
	if priceSourceLen < 32 {
		if _, err := db.Exec("ALTER TABLE assets MODIFY COLUMN price_source VARCHAR(32) NOT NULL DEFAULT 'yahoo'"); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	// add assets.sort_order if missing (idempotent) — persistent drag-sort ordering (Task 3).
	// Same information_schema probe pattern as categories.section / assets.price_source above.
	var sortOrderCount int
	if err := db.Get(&sortOrderCount, `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'sort_order'`); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}
	if sortOrderCount == 0 {
		if _, err := db.Exec("ALTER TABLE assets ADD COLUMN sort_order INT NOT NULL DEFAULT 0"); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	// One-time normalization of legacy rows to sort_order = id. Naturally idempotent: the WHERE
	// sort_order = 0 predicate only matches rows that have never been ordered (fresh ALTER leaves
	// DEFAULT 0); after the first run every row is non-zero, so subsequent startups affect 0 rows.
	// New assets get MAX(sort_order)+1 (always > 0) in Create, and Reorder writes 1..N, so a
	// legitimate user-assigned order is never 0 and never clobbered here.
	if _, err := db.Exec("UPDATE assets SET sort_order = id WHERE sort_order = 0"); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	log.Println("database tables migrated")
}
