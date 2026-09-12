package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

type GalleryHandler struct {
	uploadDir string
}

func NewGalleryHandler() *GalleryHandler {
	return &GalleryHandler{uploadDir: "./uploads"}
}

type galleryItem struct {
	Filename string `json:"filename"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
	ModTime  string `json:"mod_time"`
}

func (h *GalleryHandler) List(c *gin.Context) {
	entries, err := os.ReadDir(h.uploadDir)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"items": []galleryItem{}, "total": 0})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read uploads directory"})
		return
	}

	var items []galleryItem
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !isImageExt(ext) {
			continue
		}
		items = append(items, galleryItem{
			Filename: entry.Name(),
			URL:      "/uploads/" + entry.Name(),
			Size:     info.Size(),
			ModTime:  info.ModTime().Format("2006-01-02T15:04:05Z"),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].ModTime > items[j].ModTime
	})

	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (h *GalleryHandler) Delete(c *gin.Context) {
	filename := c.Param("filename")
	// sanitize: only allow files in uploads dir
	cleanName := filepath.Base(filename)
	path := filepath.Join(h.uploadDir, cleanName)

	if !strings.HasPrefix(path, h.uploadDir) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete file"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func isImageExt(ext string) bool {
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	return allowed[ext]
}
