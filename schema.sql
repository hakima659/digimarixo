schema.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT '📦',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  compare_price INTEGER NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  total INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'کاربر',
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL DEFAULT 0,
  min_order_amount INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_active
ON products(active);

CREATE INDEX IF NOT EXISTS idx_products_created
ON products(created_at);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_created
ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product
ON reviews(product_id);

INSERT OR IGNORE INTO categories
(id, name, slug, icon, sort_order)
VALUES
(1, 'موبایل و تبلت', 'mobile-tablet', '📱', 1),
(2, 'لپ‌تاپ و کامپیوتر', 'laptop-computer', '💻', 2),
(3, 'لوازم جانبی دیجیتال', 'digital-accessories', '🎧', 3),
(4, 'صوتی و تصویری', 'audio-video', '📺', 4),
(5, 'لوازم خانگی', 'home-appliances', '🏠', 5),
(6, 'آشپزخانه', 'kitchen', '🍳', 6),
(7, 'پوشاک', 'fashion', '👕', 7),
(8, 'کفش و کیف', 'shoes-bags', '👟', 8),
(9, 'زیبایی و سلامت', 'beauty-health', '💄', 9),
(10, 'ابزار و تجهیزات', 'tools-equipment', '🔧', 10),
(11, 'خودرو و موتورسیکلت', 'auto-motorcycle', '🚗', 11),
(12, 'کتاب و لوازم تحریر', 'books-stationery', '📚', 12),
(13, 'ورزش و سفر', 'sports-travel', '🏕️', 13),
(14, 'اسباب‌بازی و کودک', 'toys-kids', '🧸', 14),
(15, 'سوپرمارکت', 'supermarket', '🛒', 15),
(16, 'طلا و اکسسوری', 'gold-accessories', '💎', 16);

INSERT OR IGNORE INTO products
(name, slug, description, price, compare_price, image_url, stock, category_id, active)
VALUES
(
  'گوشی هوشمند اقتصادی',
  'budget-smartphone',
  'نمونه محصول برای راه‌اندازی فروشگاه دیجی‌ماریکسو',
  85000000,
  92000000,
  '',
  10,
  1,
  1
),
(
  'هدفون بی‌سیم',
  'wireless-headphones',
  'هدفون بی‌سیم نمونه برای فروشگاه',
  1800000,
  2200000,
  '',
  25,
  3,
  1
),
(
  'کوله‌پشتی روزمره',
  'everyday-backpack',
  'کوله‌پشتی نمونه مناسب استفاده روزمره',
  1450000,
  1700000,
  '',
  18,
  8,
  1
);
