
const STORE_NAME = "دیجی‌ماریکسو";
const STORE_EN = "DigiMarixo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // =========================
      // HOME
      // =========================
      if (path === "/" && method === "GET") {
        return html(homePage());
      }

      // =========================
      // ADMIN
      // =========================
      if (path === "/admin" && method === "GET") {
        return html(adminPage());
      }

      // =========================
      // HEALTH
      // =========================
      if (path === "/api/health" && method === "GET") {
        return json({
          ok: true,
          store: STORE_NAME,
          english: STORE_EN,
          database: !!env.DB,
          time: new Date().toISOString()
        });
      }

      // =========================
      // CATEGORIES
      // =========================
      if (path === "/api/categories" && method === "GET") {
        const result = await env.DB
          .prepare(`
            SELECT id, name, slug, icon
            FROM categories
            ORDER BY sort_order ASC, id ASC
          `)
          .all();

        return json(result.results || []);
      }

      // =========================
      // PRODUCTS LIST
      // =========================
      if (path === "/api/products" && method === "GET") {
        const q = url.searchParams.get("q") || "";
        const category = url.searchParams.get("category") || "";
        const limit = Math.min(
          Math.max(parseInt(url.searchParams.get("limit") || "40", 10), 1),
          100
        );

        let sql = `
          SELECT
            p.id,
            p.name,
            p.slug,
            p.description,
            p.price,
            p.compare_price,
            p.image_url,
            p.stock,
            p.category_id,
            c.name AS category_name
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.active = 1
        `;

        const params = [];

        if (q) {
          sql += `
            AND (
              p.name LIKE ?
              OR p.description LIKE ?
              OR c.name LIKE ?
            )
          `;

          const search = `%${q}%`;
          params.push(search, search, search);
        }

        if (category) {
          sql += ` AND p.category_id = ? `;
          params.push(Number(category));
        }

        sql += ` ORDER BY p.created_at DESC LIMIT ? `;
        params.push(limit);

        const result = await env.DB.prepare(sql).bind(...params).all();

        return json(result.results || []);
      }

      // =========================
      // SINGLE PRODUCT
      // =========================
      const productMatch = path.match(/^\/api\/products\/(\d+)$/);

      if (productMatch && method === "GET") {
        const id = Number(productMatch[1]);

        const product = await env.DB
          .prepare(`
            SELECT
              p.*,
              c.name AS category_name
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.id = ?
          `)
          .bind(id)
          .first();

        if (!product) {
          return json({ error: "محصول پیدا نشد" }, 404);
        }

        const reviews = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              rating,
              comment,
              created_at
            FROM reviews
            WHERE product_id = ?
            ORDER BY created_at DESC
          `)
          .bind(id)
          .all();

        return json({
          product,
          reviews: reviews.results || []
        });
      }

      // =========================
      // ADMIN CREATE PRODUCT
      // =========================
      if (path === "/api/products" && method === "POST") {
        const auth = await adminAuth(request, env);

        if (!auth.ok) {
          return json({ error: auth.error }, 401);
        }

        const body = await request.json();

        const name = String(body.name || "").trim();
        const description = String(body.description || "").trim();
        const price = Number(body.price || 0);
        const comparePrice = Number(body.compare_price || 0);
        const imageUrl = String(body.image_url || "").trim();
        const stock = Number(body.stock || 0);
        const categoryId = Number(body.category_id || 0);

        if (!name) {
          return json({ error: "نام محصول الزامی است" }, 400);
        }

        if (!Number.isFinite(price) || price < 0) {
          return json({ error: "قیمت محصول نامعتبر است" }, 400);
        }

        const slug = slugify(name) + "-" + Date.now();

        const result = await env.DB
          .prepare(`
            INSERT INTO products
            (
              name,
              slug,
              description,
              price,
              compare_price,
              image_url,
              stock,
              category_id,
              active,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
          `)
          .bind(
            name,
            slug,
            description,
            price,
            comparePrice,
            imageUrl,
            stock,
            categoryId || null
          )
          .run();

        return json({
          ok: true,
          id: result.meta.last_row_id
        }, 201);
      }

      // =========================
      // ADMIN UPDATE PRODUCT
      // =========================
      if (productMatch && method === "PUT") {
        const auth = await adminAuth(request, env);

        if (!auth.ok) {
          return json({ error: auth.error }, 401);
        }

        const id = Number(productMatch[1]);
        const body = await request.json();

        await env.DB
          .prepare(`
            UPDATE products
            SET
              name = ?,
              description = ?,
              price = ?,
              compare_price = ?,
              image_url = ?,
              stock = ?,
              category_id = ?,
              active = ?
            WHERE id = ?
          `)
          .bind(
            String(body.name || ""),
            String(body.description || ""),
            Number(body.price || 0),
            Number(body.compare_price || 0),
            String(body.image_url || ""),
            Number(body.stock || 0),
            Number(body.category_id || 0) || null,
            body.active === false ? 0 : 1,
            id
          )
          .run();

        return json({ ok: true });
      }

      // =========================
      // ADMIN DELETE PRODUCT
      // =========================
      if (productMatch && method === "DELETE") {
        const auth = await adminAuth(request, env);

        if (!auth.ok) {
          return json({ error: auth.error }, 401);
        }

        const id = Number(productMatch[1]);

        await env.DB
          .prepare(`
            UPDATE products
            SET active = 0
            WHERE id = ?
          `)
          .bind(id)
          .run();

        return json({ ok: true });
      }

      // =========================
      // ORDERS CREATE
      // =========================
      if (path === "/api/orders" && method === "POST") {
        const body = await request.json();

        const customerName = String(body.customer_name || "").trim();
        const phone = String(body.phone || "").trim();
        const address = String(body.address || "").trim();
        const items = Array.isArray(body.items) ? body.items : [];

        if (!customerName || !phone || !address) {
          return json({
            error: "نام، شماره تماس و آدرس الزامی است"
          }, 400);
        }

        if (!items.length) {
          return json({
            error: "سبد خرید خالی است"
          }, 400);
        }

        let total = 0;
        const preparedItems = [];

        for (const item of items) {
          const productId = Number(item.product_id);
          const quantity = Math.max(
            1,
            Number(item.quantity || 1)
          );

          const product = await env.DB
            .prepare(`
              SELECT id, name, price, stock
              FROM products
              WHERE id = ?
              AND active = 1
            `)
            .bind(productId)
            .first();

          if (!product) {
            return json({
              error: "یکی از محصولات دیگر موجود نیست"
            }, 400);
          }

          if (product.stock < quantity) {
            return json({
              error: `موجودی محصول «${product.name}» کافی نیست`
            }, 400);
          }

          const lineTotal = product.price * quantity;

          total += lineTotal;

          preparedItems.push({
            product,
            quantity,
            lineTotal
          });
        }

        const orderResult = await env.DB
          .prepare(`
            INSERT INTO orders
            (
              customer_name,
              phone,
              address,
              total_amount,
              status,
              payment_status,
              created_at
            )
            VALUES (?, ?, ?, ?, 'pending', 'unpaid', datetime('now'))
          `)
          .bind(
            customerName,
            phone,
            address,
            total
          )
          .run();

        const orderId = orderResult.meta.last_row_id;

        for (const item of preparedItems) {
          await env.DB
            .prepare(`
              INSERT INTO order_items
              (
                order_id,
                product_id,
                product_name,
                price,
                quantity,
                total
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .bind(
              orderId,
              item.product.id,
              item.product.name,
              item.product.price,
              item.quantity,
              item.lineTotal
            )
            .run();

          await env.DB
            .prepare(`
              UPDATE products
              SET stock = stock - ?
              WHERE id = ?
            `)
            .bind(
              item.quantity,
              item.product.id
            )
            .run();
        }

        return json({
          ok: true,
          order_id: orderId,
          total_amount: total,
          payment_status: "unpaid",
          message: "سفارش با موفقیت ثبت شد"
        }, 201);
      }

      // =========================
      // GET ORDERS
      // =========================
      if (path === "/api/orders" && method === "GET") {
        const auth = await adminAuth(request, env);

        if (!auth.ok) {
          return json({ error: auth.error }, 401);
        }

        const result = await env.DB
          .prepare(`
            SELECT *
            FROM orders
            ORDER BY created_at DESC
            LIMIT 200
          `)
          .all();

        return json(result.results || []);
      }

      // =========================
      // UPDATE ORDER STATUS
      // =========================
      const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);

      if (orderMatch && method === "PUT") {
        const auth = await adminAuth(request, env);

        if (!auth.ok) {
          return json({ error: auth.error }, 401);
        }

        const id = Number(orderMatch[1]);
        const body = await request.json();

        const allowed = [
          "pending",
          "confirmed",
          "processing",
          "shipped",
          "delivered",
          "cancelled"
        ];

        const status = String(body.status || "");

        if (!allowed.includes(status)) {
          return json({
            error: "وضعیت سفارش نامعتبر است"
          }, 400);
        }

        await env.DB
          .prepare(`
            UPDATE orders
            SET status = ?
            WHERE id = ?
          `)
          .bind(status, id)
          .run();

        return json({ ok: true });
      }

      // =========================
      // REVIEWS
      // =========================
      if (path === "/api/reviews" && method === "POST") {
        const body = await request.json();

        const productId = Number(body.product_id);
        const name = String(body.name || "کاربر").trim();
        const rating = Math.min(
          5,
          Math.max(1, Number(body.rating || 5))
        );
        const comment = String(body.comment || "").trim();

        if (!productId || !comment) {
          return json({
            error: "محصول و متن نظر الزامی است"
          }, 400);
        }

        await env.DB
          .prepare(`
            INSERT INTO reviews
            (
              product_id,
              name,
              rating,
              comment,
              created_at
            )
            VALUES (?, ?, ?, ?, datetime('now'))
          `)
          .bind(
            productId,
            name,
            rating,
            comment
          )
          .run();

        return json({
          ok: true,
          message: "نظر شما ثبت شد"
        }, 201);
      }

      // =========================
      // 404
      // =========================
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      });

    } catch (error) {
      return json({
        error: "خطای داخلی سرور",
        details: error.message
      }, 500);
    }
  }
};


// =====================================================
// ADMIN AUTH
// =====================================================

async function adminAuth(request, env) {
  const configuredPassword = env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    return {
      ok: false,
      error: "ADMIN_PASSWORD هنوز در Cloudflare تنظیم نشده است"
    };
  }

  const auth = request.headers.get("Authorization") || "";

  if (!auth.startsWith("Bearer ")) {
    return {
      ok: false,
      error: "دسترسی مدیریت نیاز به ورود دارد"
    };
  }

  const password = auth.substring(7);

  if (password !== configuredPassword) {
    return {
      ok: false,
      error: "رمز مدیریت اشتباه است"
    };
  }

  return { ok: true };
}


// =====================================================
// HELPERS
// =====================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}

function html(content, status = 200) {
  return new Response(
    content,
    {
      status,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function money(value) {
  return Number(value || 0).toLocaleString("fa-IR");
}


// =====================================================
// HOME PAGE
// =====================================================

function homePage() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#ef394e">
<meta name="description" content="دیجی‌ماریکسو؛ فروشگاه آنلاین و بازار خرید و فروش کالا">
<title>دیجی‌ماریکسو | DigiMarixo</title>

<style>
*{
  box-sizing:border-box;
}

body{
  margin:0;
  font-family:Tahoma,Arial,sans-serif;
  background:#f5f5f5;
  color:#222;
}

button,
input,
textarea,
select{
  font-family:inherit;
}

a{
  text-decoration:none;
  color:inherit;
}

.top{
  background:#fff;
  border-bottom:1px solid #eee;
  position:sticky;
  top:0;
  z-index:20;
}

.top-inner{
  max-width:1250px;
  margin:auto;
  padding:14px 18px;
  display:flex;
  align-items:center;
  gap:18px;
}

.logo{
  font-size:23px;
  font-weight:900;
  color:#ef394e;
  white-space:nowrap;
}

.logo small{
  display:block;
  font-size:10px;
  color:#777;
  margin-top:3px;
  direction:ltr;
}

.search{
  flex:1;
  position:relative;
}

.search input{
  width:100%;
  border:0;
  outline:0;
  background:#f1f2f4;
  border-radius:10px;
  padding:14px 48px 14px 15px;
  font-size:14px;
}

.search button{
  position:absolute;
  right:5px;
  top:5px;
  border:0;
  background:#fff;
  border-radius:8px;
  padding:8px 12px;
  cursor:pointer;
}

.cart-btn{
  border:1px solid #ddd;
  background:#fff;
  padding:11px 14px;
  border-radius:9px;
  cursor:pointer;
  white-space:nowrap;
}

.nav{
  background:#fff;
  border-bottom:1px solid #eee;
}

.nav-inner{
  max-width:1250px;
  margin:auto;
  padding:10px 18px;
  display:flex;
  gap:10px;
  overflow:auto;
}

.cat{
  border:0;
  background:transparent;
  padding:8px 13px;
  white-space:nowrap;
  cursor:pointer;
  color:#444;
}

.cat:hover{
  color:#ef394e;
}

.hero{
  max-width:1250px;
  margin:20px auto;
  padding:30px;
  border-radius:18px;
  background:linear-gradient(135deg,#151c36,#ef394e);
  color:#fff;
  min-height:220px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:30px;
}

.hero h1{
  margin:0 0 12px;
  font-size:34px;
}

.hero p{
  margin:0;
  line-height:2;
  color:#f5f5f5;
}

.hero-btn{
  margin-top:20px;
  border:0;
  background:#fff;
  color:#222;
  border-radius:10px;
  padding:12px 20px;
  font-weight:bold;
  cursor:pointer;
}

.hero-icon{
  font-size:90px;
}

.container{
  max-width:1250px;
  margin:0 auto;
  padding:0 18px 50px;
}

.section-title{
  margin:30px 0 15px;
  font-size:22px;
}

.grid{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:15px;
}

.card{
  background:#fff;
  border-radius:12px;
  overflow:hidden;
  border:1px solid #eee;
  transition:.15s;
}

.card:hover{
  transform:translateY(-2px);
  box-shadow:0 5px 18px rgba(0,0,0,.08);
}

.pic{
  height:190px;
  background:#fafafa;
  display:flex;
  align-items:center;
  justify-content:center;
}

.pic img{
  max-width:100%;
  max-height:100%;
  object-fit:contain;
}

.noimg{
  font-size:55px;
  color:#ddd;
}

.card-body{
  padding:14px;
}

.card-title{
  font-size:15px;
  line-height:1.8;
  min-height:54px;
}

.price{
  font-weight:bold;
  font-size:18px;
  margin-top:10px;
}

.toman{
  font-size:11px;
  color:#777;
  margin-right:3px;
}

.old{
  color:#999;
  text-decoration:line-through;
  font-size:12px;
  margin-top:5px;
}

.card button{
  width:100%;
  margin-top:12px;
  border:0;
  background:#ef394e;
  color:#fff;
  padding:11px;
  border-radius:8px;
  cursor:pointer;
}

.empty{
  background:#fff;
  border-radius:12px;
  padding:35px;
  text-align:center;
  color:#777;
}

.modal{
  display:none;
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.55);
  z-index:100;
  padding:20px;
  overflow:auto;
}

.modal-box{
  max-width:700px;
  margin:50px auto;
  background:#fff;
  border-radius:15px;
  padding:22px;
}

.close{
  float:left;
  border:0;
  background:#eee;
  border-radius:7px;
  padding:8px 12px;
  cursor:pointer;
}

.product-detail{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:25px;
}

.detail-image{
  min-height:300px;
  background:#fafafa;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
}

.detail-image img{
  max-width:100%;
  max-height:350px;
}

.detail-price{
  font-size:25px;
  font-weight:bold;
  margin:20px 0;
}

.primary{
  border:0;
  background:#ef394e;
  color:#fff;
  padding:13px 20px;
  border-radius:9px;
  cursor:pointer;
  width:100%;
  font-weight:bold;
}

.form{
  display:grid;
  gap:12px;
}

.form input,
.form textarea,
.form select{
  width:100%;
  border:1px solid #ddd;
  border-radius:8px;
  padding:12px;
  outline:0;
}

.form textarea{
  min-height:100px;
  resize:vertical;
}

.cart-row{
  display:flex;
  justify-content:space-between;
  gap:10px;
  border-bottom:1px solid #eee;
  padding:13px 0;
}

.cart-actions{
  display:flex;
  align-items:center;
  gap:5px;
}

.small-btn{
  border:1px solid #ddd;
  background:#fff;
  padding:5px 9px;
  border-radius:5px;
  cursor:pointer;
}

.footer{
  background:#151c36;
  color:#fff;
  padding:35px 18px;
  margin-top:40px;
}

.footer-inner{
  max-width:1250px;
  margin:auto;
}

.footer h3{
  margin-top:0;
}

.footer p{
  color:#ddd;
  line-height:2;
}

@media(max-width:900px){
  .grid{
    grid-template-columns:repeat(3,1fr);
  }

  .hero{
    margin:12px;
  }
}

@media(max-width:650px){
  .top-inner{
    flex-wrap:wrap;
  }

  .logo{
    width:100%;
  }

  .search{
    order:3;
    width:100%;
    flex:auto;
  }

  .grid{
    grid-template-columns:repeat(2,1fr);
  }

  .hero{
    min-height:auto;
    padding:25px;
  }

  .hero h1{
    font-size:25px;
  }

  .hero-icon{
    display:none;
  }

  .product-detail{
    grid-template-columns:1fr;
  }

  .pic{
    height:150px;
  }
}
</style>
</head>

<body>

<header class="top">
  <div class="top-inner">

    <div class="logo">
      دیجی‌ماریکسو
      <small>DigiMarixo</small>
    </div>

    <div class="search">
      <input id="searchInput" placeholder="جستجوی کالا، برند یا دسته‌بندی...">
      <button onclick="searchProducts()">🔎</button>
    </div>

    <button class="cart-btn" onclick="openCart()">
      🛒 سبد خرید
      <span id="cartCount">0</span>
    </button>

  </div>
</header>

<nav class="nav">
  <div class="nav-inner" id="categories">
    <button class="cat" onclick="loadProducts()">همه کالاها</button>
  </div>
</nav>

<section class="hero">
  <div>
    <h1>به دیجی‌ماریکسو خوش آمدید</h1>
    <p>
      بازار آنلاین کالا؛ جستجو، مقایسه و خرید آسان.
      <br>
      DigiMarixo — Your Online Marketplace
    </p>
    <button class="hero-btn" onclick="loadProducts()">
      مشاهده محصولات
    </button>
  </div>

  <div class="hero-icon">🛍️</div>
</section>

<main class="container">

  <h2 class="section-title">محصولات</h2>

  <div id="products" class="grid">
    <div class="empty">در حال دریافت محصولات...</div>
  </div>

</main>

<footer class="footer">
  <div class="footer-inner">
    <h3>دیجی‌ماریکسو | DigiMarixo</h3>
    <p>
      یک فروشگاه و بازار آنلاین مستقل برای خرید و فروش کالا.
    </p>
    <p>
      © DigiMarixo
    </p>
  </div>
</footer>


<!-- PRODUCT MODAL -->
<div id="productModal" class="modal">
  <div class="modal-box">

    <button class="close" onclick="closeModal('productModal')">
      بستن
    </button>

    <div id="productDetail"></div>

  </div>
</div>


<!-- CART MODAL -->
<div id="cartModal" class="modal">
  <div class="modal-box">

    <button class="close" onclick="closeModal('cartModal')">
      بستن
    </button>

    <h2>سبد خرید</h2>

    <div id="cartItems"></div>

    <hr>

    <h3>
      مبلغ کل:
      <span id="cartTotal">0</span>
      تومان
    </h3>

    <button class="primary" onclick="checkout()">
      ادامه و ثبت سفارش
    </button>

  </div>
</div>


<!-- CHECKOUT MODAL -->
<div id="checkoutModal" class="modal">
  <div class="modal-box">

    <button class="close" onclick="closeModal('checkoutModal')">
      بستن
    </button>

    <h2>ثبت سفارش</h2>

    <form class="form" onsubmit="submitOrder(event)">

      <input
        id="customerName"
        required
        placeholder="نام و نام خانوادگی"
      >

      <input
        id="phone"
        required
        placeholder="شماره موبایل"
        inputmode="tel"
      >

      <textarea
        id="address"
        required
        placeholder="آدرس کامل"
      ></textarea>

      <button class="primary" type="submit">
        ثبت سفارش
      </button>

    </form>

    <p id="checkoutMessage"></p>

  </div>
</div>


<script>
var cart = JSON.parse(localStorage.getItem("digimarixo_cart") || "[]");

function saveCart(){
  localStorage.setItem("digimarixo_cart", JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount(){
  var count = 0;

  cart.forEach(function(item){
    count += Number(item.quantity || 0);
  });

  document.getElementById("cartCount").textContent = count;
}

function money(value){
  return Number(value || 0).toLocaleString("fa-IR");
}

async function loadCategories(){

  try{

    var response = await fetch("/api/categories");
    var data = await response.json();

    var box = document.getElementById("categories");

    data.forEach(function(cat){

      var button = document.createElement("button");

      button.className = "cat";

      button.textContent =
        (cat.icon || "📦") + " " + cat.name;

      button.onclick = function(){
        loadProducts("", cat.id);
      };

      box.appendChild(button);

    });

  }catch(error){

    console.error(error);

  }
}

async function loadProducts(query, category){

  query = query || "";
  category = category || "";

  var box = document.getElementById("products");

  box.innerHTML =
    '<div class="empty">در حال دریافت محصولات...</div>';

  try{

    var url =
      "/api/products?limit=100";

    if(query){
      url += "&q=" + encodeURIComponent(query);
    }

    if(category){
      url += "&category=" + encodeURIComponent(category);
    }

    var response = await fetch(url);

    var products = await response.json();

    if(!Array.isArray(products) || !products.length){

      box.innerHTML =
        '<div class="empty">محصولی پیدا نشد.</div>';

      return;
    }

    box.innerHTML = "";

    products.forEach(function(product){

      var card = document.createElement("div");

      card.className = "card";

      var image = product.image_url
        ? '<img src="' +
          escapeHtml(product.image_url) +
          '" alt="' +
          escapeHtml(product.name) +
          '">'
        : '<div class="noimg">📦</div>';

      var oldPrice = "";

      if(
        product.compare_price &&
        Number(product.compare_price) > Number(product.price)
      ){
        oldPrice =
          '<div class="old">' +
          money(product.compare_price) +
          ' تومان</div>';
      }

      card.innerHTML =
        '<div class="pic">' +
          image +
        '</div>' +

        '<div class="card-body">' +

          '<div class="card-title">' +
            escapeHtml(product.name) +
          '</div>' +

          '<div class="price">' +
            money(product.price) +
            '<span class="toman">تومان</span>' +
          '</div>' +

          oldPrice +

          '<button onclick="openProduct(' +
            Number(product.id) +
          ')">' +
            'مشاهده و خرید' +
          '</button>' +

        '</div>';

      box.appendChild(card);

    });

  }catch(error){

    box.innerHTML =
      '<div class="empty">خطا در دریافت محصولات</div>';

    console.error(error);

  }
}

function searchProducts(){

  var value =
    document.getElementById("searchInput").value.trim();

  loadProducts(value, "");

}

document
  .getElementById("searchInput")
  .addEventListener("keydown", function(event){

    if(event.key === "Enter"){
      searchProducts();
    }

  });

async function openProduct(id){

  try{

    var response =
      await fetch("/api/products/" + id);

    var data =
      await response.json();

    if(!data.product){

      alert("محصول پیدا نشد.");
      return;

    }

    var p = data.product;

    var image = p.image_url
      ? '<img src="' +
        escapeHtml(p.image_url) +
        '" alt="' +
        escapeHtml(p.name) +
        '">'
      : '<div class="noimg">📦</div>';

    document.getElementById("productDetail").innerHTML =

      '<div class="product-detail">' +

        '<div class="detail-image">' +
          image +
        '</div>' +

        '<div>' +

          '<h2>' +
            escapeHtml(p.name) +
          '</h2>' +

          '<p>' +
            escapeHtml(p.description || "توضیحی ثبت نشده است.") +
          '</p>' +

          '<div class="detail-price">' +
            money(p.price) +
            ' تومان' +
          '</div>' +

          '<p>موجودی: ' +
            money(p.stock) +
            ' عدد</p>' +

          '<button class="primary" onclick="addToCart(' +
            Number(p.id) +
            ')">' +
            'افزودن به سبد خرید' +
          '</button>' +

        '</div>' +

      '</div>';

    document.getElementById("productModal").style.display = "block";

  }catch(error){

    alert("خطا در دریافت محصول.");

  }

}

function addToCart(id){

  var found = cart.find(function(item){
    return Number(item.product_id) === Number(id);
  });

  if(found){

    found.quantity += 1;

  }else{

    cart.push({
      product_id: Number(id),
      quantity: 1
    });

  }

  saveCart();

  alert("محصول به سبد خرید اضافه شد.");

  closeModal("productModal");

}

async function openCart(){

  var box =
    document.getElementById("cartItems");

  if(!cart.length){

    box.innerHTML =
      '<div class="empty">سبد خرید خالی است.</div>';

    document.getElementById("cartTotal").textContent = "0";

    document.getElementById("cartModal").style.display = "block";

    return;

  }

  box.innerHTML =
    '<div class="empty">در حال دریافت...</div>';

  document.getElementById("cartModal").style.display = "block";

  var total = 0;
  var html = "";

  for(var i = 0; i < cart.length; i++){

    var item = cart[i];

    try{

      var response =
        await fetch("/api/products/" + item.product_id);

      var data =
        await response.json();

      if(!data.product){
        continue;
      }

      var p = data.product;

      var line =
        Number(p.price) *
        Number(item.quantity);

      total += line;

      html +=

        '<div class="cart-row">' +

          '<div>' +
            '<strong>' +
              escapeHtml(p.name) +
            '</strong>' +

            '<div>' +
              money(p.price) +
              ' تومان' +
            '</div>' +

          '</div>' +

          '<div class="cart-actions">' +

            '<button class="small-btn" onclick="changeQuantity(' +
              Number(p.id) +
              ',-1)">−</button>' +

            '<span>' +
              Number(item.quantity) +
            '</span>' +

            '<button class="small-btn" onclick="changeQuantity(' +
              Number(p.id) +
              ',1)">+</button>' +

            '<button class="small-btn" onclick="removeFromCart(' +
              Number(p.id) +
              ')">حذف</button>' +

          '</div>' +

        '</div>';

    }catch(error){

      console.error(error);

    }

  }

  box.innerHTML =
    html ||
    '<div class="empty">سبد خرید خالی است.</div>';

  document.getElementById("cartTotal").textContent =
    money(total);

}

function changeQuantity(id, amount){

  var item = cart.find(function(x){
    return Number(x.product_id) === Number(id);
  });

  if(!item){
    return;
  }

  item.quantity += amount;

  if(item.quantity <= 0){

    cart = cart.filter(function(x){
      return Number(x.product_id) !== Number(id);
    });

  }

  saveCart();

  openCart();

}

function removeFromCart(id){

  cart = cart.filter(function(item){
    return Number(item.product_id) !== Number(id);
  });

  saveCart();

  openCart();

}

function checkout(){

  if(!cart.length){

    alert("سبد خرید خالی است.");

    return;

  }

  closeModal("cartModal");

  document.getElementById("checkoutModal").style.display = "block";

}

async function submitOrder(event){

  event.preventDefault();

  var message =
    document.getElementById("checkoutMessage");

  message.textContent =
    "در حال ثبت سفارش...";

  var payload = {

    customer_name:
      document.getElementById("customerName").value.trim(),

    phone:
      document.getElementById("phone").value.trim(),

    address:
      document.getElementById("address").value.trim(),

    items:
      cart.map(function(item){

        return {
          product_id: Number(item.product_id),
          quantity: Number(item.quantity)
        };

      })

  };

  try{

    var response = await fetch(
      "/api/orders",
      {
        method: "POST",

        headers: {
          "content-type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );

    var data = await response.json();

    if(!response.ok){

      message.textContent =
        data.error ||
        "ثبت سفارش ناموفق بود.";

      return;

    }

    cart = [];

    saveCart();

    message.innerHTML =
      "<strong>سفارش با موفقیت ثبت شد.</strong>" +
      "<br>شماره سفارش: " +
      data.order_id +
      "<br>مبلغ: " +
      money(data.total_amount) +
      " تومان" +
      "<br><br>" +
      "درگاه پرداخت در مرحله بعد به فروشگاه متصل می‌شود.";

    event.target.reset();

  }catch(error){

    message.textContent =
      "خطا در ارتباط با سرور.";

  }

}

function closeModal(id){

  document.getElementById(id).style.display = "none";

}

function escapeHtml(value){

  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

window.addEventListener("click", function(event){

  if(event.target.classList.contains("modal")){

    event.target.style.display = "none";

  }

});

loadCategories();
loadProducts();
updateCartCount();

</script>

</body>
</html>`;
}


// =====================================================
// ADMIN PAGE
// =====================================================

function adminPage() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مدیریت دیجی‌ماریکسو</title>

<style>
body{
  margin:0;
  background:#f5f5f5;
  color:#222;
  font-family:Tahoma,Arial,sans-serif;
}

.container{
  max-width:1100px;
  margin:auto;
  padding:20px;
}

.header{
  background:#151c36;
  color:#fff;
  padding:20px;
  border-radius:12px;
  margin-bottom:20px;
}

.box{
  background:#fff;
  border-radius:12px;
  padding:20px;
  margin-bottom:20px;
}

input,
textarea,
select{
  width:100%;
  box-sizing:border-box;
  padding:12px;
  border:1px solid #ddd;
  border-radius:8px;
  margin:6px 0 12px;
  font-family:inherit;
}

textarea{
  min-height:100px;
}

button{
  border:0;
  border-radius:8px;
  padding:11px 16px;
  cursor:pointer;
  background:#ef394e;
  color:#fff;
}

.secondary{
  background:#333;
}

.grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:20px;
}

table{
  width:100%;
  border-collapse:collapse;
}

th,
td{
  border-bottom:1px solid #eee;
  padding:10px;
  text-align:right;
}

.status{
  padding:5px 8px;
  border-radius:5px;
  background:#eee;
}

@media(max-width:700px){
  .grid{
    grid-template-columns:1fr;
  }

  table{
    font-size:12px;
  }
}
</style>
</head>

<body>

<div class="container">

  <div class="header">
    <h1>پنل مدیریت دیجی‌ماریکسو</h1>
    <p>DigiMarixo Admin Panel</p>
  </div>

  <div class="box">

    <h2>ورود مدیریت</h2>

    <input
      id="adminPassword"
      type="password"
      placeholder="ADMIN_PASSWORD"
    >

    <button onclick="login()">
      ورود
    </button>

    <span id="loginMessage"></span>

  </div>

  <div id="dashboard" style="display:none">

    <div class="grid">

      <div class="box">

        <h2>افزودن محصول</h2>

        <input
          id="name"
          placeholder="نام محصول"
        >

        <textarea
          id="description"
          placeholder="توضیحات محصول"
        ></textarea>

        <input
          id="price"
          type="number"
          placeholder="قیمت"
        >

        <input
          id="compare_price"
          type="number"
          placeholder="قیمت قبل"
        >

        <input
          id="image_url"
          placeholder="آدرس تصویر"
        >

        <input
          id="stock"
          type="number"
          placeholder="موجودی"
          value="10"
        >

        <input
          id="category_id"
          type="number"
          placeholder="شناسه دسته‌بندی"
          value="1"
        >

        <button onclick="createProduct()">
          افزودن محصول
        </button>

        <p id="productMessage"></p>

      </div>

      <div class="box">

        <h2>وضعیت سیستم</h2>

        <button onclick="loadProducts()">
          دریافت محصولات
        </button>

        <button
          class="secondary"
          onclick="loadOrders()"
        >
          دریافت سفارش‌ها
        </button>

        <p id="systemMessage"></p>

      </div>

    </div>

    <div class="box">

      <h2>محصولات</h2>

      <div id="products">
        در حال دریافت...
      </div>

    </div>

    <div class="box">

      <h2>سفارش‌ها</h2>

      <div id="orders">
        هنوز دریافت نشده است.
      </div>

    </div>

  </div>

</div>

<script>
var token = "";

function login(){

  token =
    document.getElementById("adminPassword").value;

  if(!token){

    document.getElementById("loginMessage").textContent =
      "رمز را وارد کنید.";

    return;

  }

  document.getElementById("dashboard").style.display =
    "block";

  document.getElementById("loginMessage").textContent =
    "ورود انجام شد.";

  loadProducts();

}

async function api(url, options){

  options = options || {};

  options.headers = options.headers || {};

  options.headers.Authorization =
    "Bearer " + token;

  if(options.body){
    options.headers["content-type"] =
      "application/json";
  }

  var response =
    await fetch(url, options);

  var data =
    await response.json();

  if(!response.ok){

    throw new Error(
      data.error || "خطا"
    );

  }

  return data;

}

async function createProduct(){

  try{

    var data = await api(
      "/api/products",
      {
        method:"POST",

        body:JSON.stringify({

          name:
            document.getElementById("name").value,

          description:
            document.getElementById("description").value,

          price:
            Number(document.getElementById("price").value),

          compare_price:
            Number(document.getElementById("compare_price").value),

          image_url:
            document.getElementById("image_url").value,

          stock:
            Number(document.getElementById("stock").value),

          category_id:
            Number(document.getElementById("category_id").value)

        })
      }
    );

    document.getElementById("productMessage").textContent =
      "محصول با موفقیت اضافه شد. شناسه: " +
      data.id;

    loadProducts();

  }catch(error){

    document.getElementById("productMessage").textContent =
      error.message;

  }

}

async function loadProducts(){

  try{

    var products =
      await api("/api/products?limit=100");

    var box =
      document.getElementById("products");

    if(!products.length){

      box.innerHTML =
        "هنوز محصولی ثبت نشده است.";

      return;

    }

    var html =
      "<table>" +
      "<tr>" +
      "<th>ID</th>" +
      "<th>محصول</th>" +
      "<th>قیمت</th>" +
      "<th>موجودی</th>" +
      "</tr>";

    products.forEach(function(p){

      html +=
        "<tr>" +

        "<td>" +
          p.id +
        "</td>" +

        "<td>" +
          escapeHtml(p.name) +
        "</td>" +

        "<td>" +
          Number(p.price).toLocaleString("fa-IR") +
        "</td>" +

        "<td>" +
          p.stock +
        "</td>" +

        "</tr>";

    });

    html += "</table>";

    box.innerHTML = html;

  }catch(error){

    document.getElementById("products").textContent =
      error.message;

  }

}

async function loadOrders(){

  try{

    var orders =
      await api("/api/orders");

    var box =
      document.getElementById("orders");

    if(!orders.length){

      box.innerHTML =
        "هنوز سفارشی ثبت نشده است.";

      return;

    }

    var html =
      "<table>" +

      "<tr>" +
        "<th>شماره</th>" +
        "<th>مشتری</th>" +
        "<th>مبلغ</th>" +
        "<th>وضعیت</th>" +
      "</tr>";

    orders.forEach(function(order){

      html +=
        "<tr>" +

        "<td>" +
          order.id +
        "</td>" +

        "<td>" +
          escapeHtml(order.customer_name) +
          "<br>" +
          escapeHtml(order.phone) +
        "</td>" +

        "<td>" +
          Number(order.total_amount)
            .toLocaleString("fa-IR") +
          " تومان" +
        "</td>" +

        "<td>" +

          "<select onchange='changeOrderStatus(" +
            Number(order.id) +
            ", this.value)'>" +

            "<option value='pending' " +
              (order.status === "pending" ? "selected" : "") +
            ">در انتظار</option>" +

            "<option value='confirmed' " +
              (order.status === "confirmed" ? "selected" : "") +
            ">تأیید شده</option>" +

            "<option value='processing' " +
              (order.status === "processing" ? "selected" : "") +
            ">در حال پردازش</option>" +

            "<option value='shipped' " +
              (order.status === "shipped" ? "selected" : "") +
            ">ارسال شده</option>" +

            "<option value='delivered' " +
              (order.status === "delivered" ? "selected" : "") +
            ">تحویل شده</option>" +

            "<option value='cancelled' " +
              (order.status === "cancelled" ? "selected" : "") +
            ">لغو شده</option>" +

          "</select>" +

        "</td>" +

        "</tr>";

    });

    html += "</table>";

    box.innerHTML = html;

  }catch(error){

    document.getElementById("orders").textContent =
      error.message;

  }

}

async function changeOrderStatus(id, status){

  try{

    await api(
      "/api/orders/" + id,
      {
        method:"PUT",

        body:JSON.stringify({
          status:status
        })
      }
    );

    alert("وضعیت سفارش تغییر کرد.");

  }catch(error){

    alert(error.message);

  }

}

function escapeHtml(value){

  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}
</script>

</body>
</html>`;
}
