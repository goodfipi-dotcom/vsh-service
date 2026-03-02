const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Переменные Railway
const BOT_TOKEN = process.env.BOT_TOKEN;           // токен PuzzleBot
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;   // твой Telegram ID
const DATABASE_URL = process.env.DATABASE_URL;     // PostgreSQL

app.use(cors());
app.use(express.json());

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Создание таблицы orders, если её нет
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                name TEXT,
                address TEXT,
                task TEXT,
                phone TEXT,
                telegram_id BIGINT,
                status TEXT DEFAULT 'available',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("Database initialized");
    } catch (err) {
        console.error("DB Init Error:", err);
    }
}
initDB();

// POST /api/orders — новый заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { name, address, task, phone, tg_user } = req.body;

        const result = await pool.query(
            `INSERT INTO orders (name, address, task, phone, telegram_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, address, task, phone, tg_user?.id || null]
        );

        const order = result.rows[0];

        // Telegram-уведомление
        const message = `🚀 НОВЫЙ ЗАКАЗ №${order.id}\n📍 Адрес: ${order.address}\n🛠 Задача: ${order.task}\n📞 Тел: ${order.phone}\n👤 Клиент: ${order.name}`;
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: message })
        });

        res.status(201).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// GET /api/orders/available — список доступных заказов
app.get('/api/orders/available', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM orders WHERE status='available' ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// POST /api/orders/take — рабочий берёт заказ
app.post('/api/orders/take', async (req, res) => {
    try {
        const { id } = req.body;
        await pool.query("UPDATE orders SET status='taken' WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.get('/', (req, res) => res.send("VSH Backend Active"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
