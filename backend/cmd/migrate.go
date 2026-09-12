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
	}

	for _, sql := range statements {
		if _, err := db.Exec(sql); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}
	log.Println("database tables migrated")
}
