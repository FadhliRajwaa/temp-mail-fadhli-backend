# Backend - Temp Mail Server

Backend server untuk aplikasi Temp Mail menggunakan Node.js, Express, Socket.io, dan MongoDB.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables (lihat .env.example)
cp .env.example .env
# Edit .env dengan credentials Anda

# Run server
npm start

# Development mode (dengan auto-reload)
npm run dev
```

## 📦 Dependencies

- **express**: Web framework
- **socket.io**: Real-time communication
- **mongoose**: MongoDB ODM
- **cors**: Cross-Origin Resource Sharing
- **dotenv**: Environment variables
- **multer**: Multipart form-data parser (untuk Mailgun webhook)
- **helmet**: Security headers

## 📁 Struktur File

```
backend/
├── config/
│   └── database.js         # MongoDB connection
├── models/
│   └── Email.js           # Email schema dengan TTL Index
├── server.js              # Main server file
├── package.json
├── .env.example
├── .env                   # Your env file (tidak di-commit)
└── README.md
```

## 🔧 Environment Variables

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/temp_mail
PORT=5000
FRONTEND_URL=http://localhost:5173
EMAIL_DOMAIN=domain-saya.my.id
NODE_ENV=development
```

## 📊 MongoDB Schema

Email schema dengan TTL (Time-To-Live) Index:

```javascript
{
  to_address: String,      // Email tujuan
  from_address: String,    // Email pengirim
  subject: String,         // Subject
  body_text: String,       // Body plain text
  body_html: String,       // Body HTML
  received_at: Date,       // Timestamp
  createdAt: Date,         // TTL field (expires: 900 detik)
  metadata: Object         // Mailgun metadata
}
```

## 🔌 Socket.io Events

### Server Listen

- `connection`: Client terhubung
- `join-room`: Client join ke room email
- `leave-room`: Client leave room
- `disconnect`: Client terputus

### Server Emit

- `email-history`: Kirim history email
- `new-email`: Broadcast email baru ke room
- `error`: Error message

## 🛠️ API Endpoints

### GET /
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "service": "Temp Mail Backend",
  "version": "1.0.0",
  "activeRooms": 5
}
```

### GET /api/emails/:emailAddress
Get email history untuk alamat tertentu

**Response:**
```json
{
  "success": true,
  "count": 3,
  "emails": [...]
}
```

### POST /webhook-mailgun
Mailgun webhook endpoint (menerima email masuk)

**Request Body (form-data):**
- recipient: Email tujuan
- sender: Email pengirim
- subject: Subject
- body-plain: Body text
- body-html: Body HTML
- message-id: Message ID
- timestamp: Timestamp
- token: Mailgun token
- signature: Mailgun signature

**Response:**
```json
{
  "success": true,
  "message": "Email received and processed",
  "emailId": "..."
}
```

### DELETE /api/emails/:emailId
Hapus email tertentu (manual delete)

### GET /api/stats
Server statistics

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalEmails": 10,
    "activeRooms": 3,
    "connectedClients": 5,
    "uptime": 3600
  }
}
```

## 🔒 Security

- CORS enabled untuk frontend URL
- Helmet.js untuk security headers
- Environment variables untuk sensitive data
- (Optional) Mailgun signature validation

## 🌐 Deployment ke Render

1. Push code ke GitHub
2. Buat Web Service di Render
3. Connect repository
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Root Directory**: `backend`
5. Environment Variables:
   - MONGODB_URI
   - PORT (auto dari Render)
   - FRONTEND_URL
   - EMAIL_DOMAIN
   - NODE_ENV=production

## 🐛 Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED
```
- Check MONGODB_URI di .env
- Pastikan IP whitelist di MongoDB Atlas

### Socket.io CORS Error
```
Access to XMLHttpRequest blocked by CORS
```
- Check FRONTEND_URL di .env
- Pastikan CORS configuration benar

### Mailgun Webhook Not Working
- Check webhook URL accessible dari internet
- Use ngrok untuk testing lokal
- Check Mailgun Route configuration
- Check logs untuk error detail

## 📝 Logs

Server logs akan menampilkan:
- ✅ MongoDB connected
- 🔌 Client connected/disconnected
- 📬 New email received
- 🚀 Email broadcasted to room
- ❌ Errors

Contoh log:
```
✅ MongoDB Connected Successfully
📊 Database: temp_mail
🚀 ========================================
🌐 Server running on port 5000
📧 Email Domain: domain-saya.my.id
🔌 Socket.io ready for connections
🗄️  MongoDB connected
========================================

📬 ========== NEW EMAIL RECEIVED ==========
📧 To: user-abc@domain-saya.my.id
📝 Subject: Test Email
⏰ Expires in: 15 minutes
🚀 Email broadcasted to room: user-abc@domain-saya.my.id
👥 Active listeners: 1
==========================================
```

## 👨‍💻 Development

```bash
# Watch mode (auto-reload pada file changes)
npm run dev

# Production mode
npm start
```

## 📄 License

MIT
