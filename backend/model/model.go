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
	Section   string    `json:"section" db:"section"`
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

type Asset struct {
	ID             int64      `json:"id" db:"id"`
	Symbol         string     `json:"symbol" db:"symbol"`
	Name           string     `json:"name" db:"name"`
	Type           string     `json:"type" db:"type"`
	PriceSource    string     `json:"price_source" db:"price_source"`
	Currency       string     `json:"currency" db:"currency"`
	CurrentPrice   *float64   `json:"current_price" db:"current_price"`
	PriceUpdatedAt *time.Time `json:"price_updated_at" db:"price_updated_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type Trade struct {
	ID        int64     `json:"id" db:"id"`
	AssetID   int64     `json:"asset_id" db:"asset_id"`
	Side      string    `json:"side" db:"side"`
	Quantity  float64   `json:"quantity" db:"quantity"`
	Price     float64   `json:"price" db:"price"`
	Fee       float64   `json:"fee" db:"fee"`
	TradedAt  time.Time `json:"traded_at" db:"traded_at"`
	Note      string    `json:"note" db:"note"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`

	Asset *Asset `json:"asset,omitempty" db:"-"`
}

type PriceHistory struct {
	ID     int64     `json:"id" db:"id"`
	Symbol string    `json:"symbol" db:"symbol"`
	Date   time.Time `json:"date" db:"date"`
	Close  float64   `json:"close" db:"close"`
}

type LanguageProfile struct {
	ID        int64     `json:"id" db:"id"`
	Lang      string    `json:"lang" db:"lang"`
	Level     string    `json:"level" db:"level"`
	Goal      string    `json:"goal" db:"goal"`
	Note      string    `json:"note" db:"note"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type StudySession struct {
	ID          int64     `json:"id" db:"id"`
	Lang        string    `json:"lang" db:"lang"`
	Activity    string    `json:"activity" db:"activity"`
	Minutes     int       `json:"minutes" db:"minutes"`
	SessionDate time.Time `json:"session_date" db:"session_date"`
	Note        string    `json:"note" db:"note"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type Habit struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Icon      string    `json:"icon" db:"icon"` // nullable column — queries should IFNULL (task 4.2)
	Color     string    `json:"color" db:"color"`
	Archived  bool      `json:"archived" db:"archived"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`

	// CheckedToday 为查询产物（List 的子查询列，task 4.5）：INSERT/UPDATE 不涉及。
	CheckedToday bool `json:"checked_today" db:"checked_today"`
}

type HabitLog struct {
	HabitID int64     `json:"habit_id" db:"habit_id"`
	LogDate time.Time `json:"log_date" db:"log_date"`
}
