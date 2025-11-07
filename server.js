/* eslint-env node */
/* global process */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import multer from 'multer';
import connectDatabase from './config/database.js';
import Email from './models/Email.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Konfigurasi Socket.IO dengan CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi multer untuk menerima form-data dari Mailgun
const upload = multer();

// Koneksi ke Database
await connectDatabase();

// ==================== SOCKET.IO LOGIC ====================

/**
 * Tracking active rooms (email addresses)
 * Format: { 'user-abc@domain.com': Set([socketId1, socketId2, ...]) }
 */
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  /**
   * Event: join-room
   * Client bergabung ke room berdasarkan email address
   */
  socket.on('join-room', async (emailAddress) => {
    try {
      const normalizedEmail = emailAddress.toLowerCase().trim();
      
      // Join ke room
      socket.join(normalizedEmail);
      
      // Track room
      if (!activeRooms.has(normalizedEmail)) {
        activeRooms.set(normalizedEmail, new Set());
      }
      activeRooms.get(normalizedEmail).add(socket.id);
      
      console.log(`📧 Socket ${socket.id} joined room: ${normalizedEmail}`);
      
      // Kirim history email yang masih ada di database
      const emails = await Email.findByAddress(normalizedEmail);
      const formattedEmails = emails.map(email => email.toClientFormat());
      
      socket.emit('email-history', formattedEmails);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  /**
   * Event: leave-room
   * Client meninggalkan room
   */
  socket.on('leave-room', (emailAddress) => {
    const normalizedEmail = emailAddress.toLowerCase().trim();
    socket.leave(normalizedEmail);
    
    // Hapus dari tracking
    if (activeRooms.has(normalizedEmail)) {
      activeRooms.get(normalizedEmail).delete(socket.id);
      if (activeRooms.get(normalizedEmail).size === 0) {
        activeRooms.delete(normalizedEmail);
      }
    }
    
    console.log(`📤 Socket ${socket.id} left room: ${normalizedEmail}`);
  });
  
  /**
   * Event: disconnect
   */
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    // Bersihkan dari semua rooms
    activeRooms.forEach((sockets, room) => {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        activeRooms.delete(room);
      }
    });
  });
});

// ==================== REST API ROUTES ====================

/**
 * GET /
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Temp Mail Backend',
    version: '1.0.0',
    activeRooms: activeRooms.size
  });
});

/**
 * GET /api/emails/:emailAddress
 * Mendapatkan history email untuk alamat tertentu
 */
app.get('/api/emails/:emailAddress', async (req, res) => {
  try {
    const { emailAddress } = req.params;
    const emails = await Email.findByAddress(emailAddress);
    const formattedEmails = emails.map(email => email.toClientFormat());
    
    res.json({
      success: true,
      count: formattedEmails.length,
      emails: formattedEmails
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emails'
    });
  }
});

/**
 * POST /webhook-mailgun
 * Endpoint untuk menerima email dari Mailgun
 * CRITICAL: Ini adalah inti dari sistem!
 */
app.post('/webhook-mailgun', upload.none(), async (req, res) => {
  try {
    console.log('\n📬 ========== NEW EMAIL RECEIVED ==========');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Parse data dari Mailgun
    const {
      recipient,      // Email tujuan
      sender,         // Email pengirim
      subject,        // Subject email
      'body-plain': bodyPlain,  // Body text
      'body-html': bodyHtml,    // Body HTML
      'message-id': messageId,
      timestamp,
      token,
      signature
    } = req.body;
    
    // Validasi data minimal
    if (!recipient) {
      console.error('❌ No recipient found in webhook data');
      return res.status(400).json({
        success: false,
        message: 'Recipient is required'
      });
    }
    
    const normalizedRecipient = recipient.toLowerCase().trim();
    
    // Simpan email ke database
    const newEmail = new Email({
      to_address: normalizedRecipient,
      from_address: sender || 'unknown@sender.com',
      subject: subject || '(No Subject)',
      body_text: bodyPlain || '',
      body_html: bodyHtml || '',
      received_at: new Date(),
      metadata: {
        messageId,
        timestamp: parseInt(timestamp) || Date.now(),
        token,
        signature
      }
    });
    
    await newEmail.save();
    
    console.log('✅ Email saved to database');
    console.log(`📧 To: ${normalizedRecipient}`);
    console.log(`📝 Subject: ${subject || '(No Subject)'}`);
    console.log(`⏰ Expires in: 15 minutes`);
    
    // Format email untuk dikirim ke client
    const formattedEmail = newEmail.toClientFormat();
    
    // Kirim email ke room yang sesuai via Socket.io
    io.to(normalizedRecipient).emit('new-email', formattedEmail);
    
    console.log(`🚀 Email broadcasted to room: ${normalizedRecipient}`);
    console.log(`👥 Active listeners: ${io.sockets.adapter.rooms.get(normalizedRecipient)?.size || 0}`);
    console.log('==========================================\n');
    
    // Response ke Mailgun
    res.status(200).json({
      success: true,
      message: 'Email received and processed',
      emailId: newEmail._id
    });
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process email',
      error: error.message
    });
  }
});

/**
 * DELETE /api/emails/:emailId
 * Hapus email tertentu (manual delete)
 */
app.delete('/api/emails/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const email = await Email.findByIdAndDelete(emailId);
    
    if (!email) {
      return res.status(404).json({
        success: false,
        message: 'Email not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Email deleted'
    });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email'
    });
  }
});

/**
 * GET /api/stats
 * Statistik server
 */
app.get('/api/stats', async (req, res) => {
  try {
    const totalEmails = await Email.countDocuments();
    const connectedClients = io.engine.clientsCount;
    
    res.json({
      success: true,
      stats: {
        totalEmails,
        activeRooms: activeRooms.size,
        connectedClients,
        uptime: process.uptime()
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
});

/**
 * POST /api/sendgrid/webhook
 * SendGrid Inbound Parse Webhook
 * Handle incoming emails dari SendGrid
 */
app.post('/api/sendgrid/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    console.log('Email received from SendGrid');
    
    const { 
      to,           // recipient email
      from,         // sender email
      subject,      // email subject
      text,         // plain text body
      html,         // html body
    } = req.body;

    // Debug: Log raw data
    console.log('Raw TO field:', to);
    console.log('Raw FROM field:', from);
    console.log('Raw SUBJECT:', subject);

    // Parse recipient email - handle multiple formats
    let recipientEmail = '';
    if (to) {
      // Remove brackets if present: "Name <email@domain.com>" -> "email@domain.com"
      const match = to.match(/<(.+?)>/);
      recipientEmail = match ? match[1] : to.trim();
    }
    
    console.log('Parsed recipient email:', recipientEmail);
    
    // Pastikan email untuk domain kita (accept both old and new domain)
    const rootDomain = 'fadhlirajwaa.my.id'; // Accept any subdomain
    
    if (!recipientEmail || !recipientEmail.includes(rootDomain)) {
      console.log('Email rejected - not for our domain:', recipientEmail);
      return res.status(200).send('OK');
    }
    
    console.log('Email accepted for:', recipientEmail);

    // Generate unique ID
    const emailId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Hitung expiry time (15 menit dari sekarang)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Simpan ke MongoDB
    const emailDoc = await Email.create({
      id: emailId,
      to: recipientEmail,
      from: from || 'Unknown Sender',
      subject: subject || '(No Subject)',
      bodyText: text || '',
      bodyHtml: html || '',
      receivedAt: new Date(),
      expiresAt: expiresAt
    });

    // Broadcast via Socket.io ke frontend
    io.emit('newEmail', {
      id: emailDoc.id,
      to: emailDoc.to,
      from: emailDoc.from,
      subject: emailDoc.subject,
      bodyText: emailDoc.bodyText,
      bodyHtml: emailDoc.bodyHtml,
      receivedAt: emailDoc.receivedAt,
      expiresAt: emailDoc.expiresAt
    });

    console.log(`✅ Email saved and broadcasted: ${emailId}`);
    console.log(`   From: ${from}`);
    console.log(`   To: ${recipientEmail}`);
    console.log(`   Subject: ${subject}`);
    
    // SendGrid expects 200 OK
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ SendGrid webhook error:', error);
    // Tetap return 200 agar SendGrid tidak retry terus-menerus
    res.status(200).send('OK');
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error Handler
app.use((err, req, res) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log('\n🚀 ========================================');
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📧 Email Domain: ${process.env.EMAIL_DOMAIN || 'not-configured'}`);
  console.log(`🔌 Socket.io ready for connections`);
  console.log(`🗄️  MongoDB connected`);
  console.log('========================================\n');
});

export { io };
