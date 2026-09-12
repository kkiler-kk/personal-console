const API = '/api'

function getHeaders() {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  // auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  // user
  getProfile: () => request('/user/profile'),
  updateProfile: (body) => request('/user/profile', { method: 'PUT', body: JSON.stringify(body) }),

  // posts
  getPosts: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/posts${qs ? '?' + qs : ''}`)
  },
  getPost: (slug) => request(`/posts/${slug}`),
  getArchive: () => request('/posts/archive'),

  // admin posts
  getAdminPosts: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/admin/posts${qs ? '?' + qs : ''}`)
  },
  createPost: (body) => request('/posts', { method: 'POST', body: JSON.stringify(body) }),
  updatePost: (id, body) => request(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),

  // categories
  getCategories: () => request('/categories'),
  createCategory: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // tags
  getTags: () => request('/tags'),

  // upload
  uploadImage: (file) => {
    const formData = new FormData()
    formData.append('image', file)
    return request('/upload', { method: 'POST', body: formData, headers: {} })
  },

  // gallery
  getGallery: () => request('/gallery'),
  deleteGalleryFile: (filename) => request(`/gallery/${filename}`, { method: 'DELETE' }),

  // comments
  getComments: (slug, email) => {
    const qs = email ? '?email=' + encodeURIComponent(email) : ''
    return request(`/posts/${slug}/comments${qs}`)
  },
  createComment: (slug, body) => request(`/posts/${slug}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  likeComment: (id, email) => request(`/comments/${id}/like`, { method: 'POST', body: JSON.stringify({ email }) }),
  checkLike: (id, email) => request(`/comments/${id}/like${email ? '?email=' + encodeURIComponent(email) : ''}`),
  deleteComment: (id, email) => request(`/comments/${id}`, { method: 'DELETE', body: JSON.stringify({ email }) }),
}
