package model

import (
	"database/sql"
	"time"
)

type User struct {
	ID        int64          `json:"id" db:"id"`
	Username  string         `json:"username" db:"username"`
	Password  string         `json:"-" db:"password"`
	Nickname  string         `json:"nickname" db:"nickname"`
	Avatar    string         `json:"avatar" db:"avatar"`
	Bio       sql.NullString `json:"bio" db:"bio"`
	CreatedAt time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt time.Time      `json:"updated_at" db:"updated_at"`
}

type Category struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Slug      string    `json:"slug" db:"slug"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Post struct {
	ID         int64     `json:"id" db:"id"`
	Title      string    `json:"title" db:"title"`
	Slug       string    `json:"slug" db:"slug"`
	Summary    string    `json:"summary" db:"summary"`
	Content    string    `json:"content" db:"content"`
	AuthorID   int64     `json:"author_id" db:"author_id"`
	CategoryID *int64    `json:"category_id" db:"category_id"`
	Status     string    `json:"status" db:"status"` // published / draft
	ViewCount  int       `json:"view_count" db:"view_count"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`

	// joined fields
	Author   *User     `json:"author,omitempty" db:"-"`
	Category *Category `json:"category,omitempty" db:"-"`
	Tags     []Tag     `json:"tags,omitempty" db:"-"`
}

type Tag struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
}

type PostTag struct {
	PostID int64 `json:"post_id" db:"post_id"`
	TagID  int64 `json:"tag_id" db:"tag_id"`
}

type Archive struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Count int `json:"count"`
}

type Comment struct {
	ID        int64     `json:"id" db:"id"`
	PostID    int64     `json:"post_id" db:"post_id"`
	ParentID  *int64    `json:"parent_id" db:"parent_id"`
	Name      string    `json:"name" db:"name"`
	Email     string    `json:"-" db:"email"`
	Content   string    `json:"content" db:"content"`
	LikeCount int       `json:"like_count" db:"like_count"`
	CanDelete bool     `json:"can_delete" db:"-"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	Replies []Comment `json:"replies,omitempty" db:"-"`
}

type CommentLike struct {
	ID        int64     `json:"id" db:"id"`
	CommentID int64     `json:"comment_id" db:"comment_id"`
	Email     string    `json:"email" db:"email"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
