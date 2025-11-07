import mongoose from 'mongoose';

/**
 * Schema Email dengan TTL (Time-To-Live) Index
 * Email akan otomatis terhapus setelah 15 menit (900 detik)
 */
const emailSchema = new mongoose.Schema({
  // Alamat email tujuan (user-abc@domain.com)
  to_address: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  
  // Alamat email pengirim
  from_address: {
    type: String,
    required: true,
    trim: true
  },
  
  // Subject email
  subject: {
    type: String,
    default: '(No Subject)',
    trim: true
  },
  
  // Body email dalam format text
  body_text: {
    type: String,
    default: ''
  },
  
  // Body email dalam format HTML
  body_html: {
    type: String,
    default: ''
  },
  
  // Timestamp email diterima
  received_at: {
    type: Date,
    default: Date.now
  },
  
  // Timestamp untuk TTL Index
  // Field ini WAJIB ada untuk TTL bekerja
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 900  // 900 detik = 15 menit
  },
  
  // Metadata tambahan dari Mailgun
  metadata: {
    messageId: String,
    timestamp: Number,
    token: String,
    signature: String
  }
}, {
  timestamps: false  // Tidak pakai timestamps otomatis karena sudah custom
});

/**
 * Index untuk performa query
 * 1. to_address: untuk mencari email berdasarkan alamat penerima
 * 2. createdAt: untuk TTL Index (auto-delete setelah 15 menit)
 */
emailSchema.index({ to_address: 1, createdAt: -1 });

/**
 * Method untuk format email yang akan dikirim ke client
 */
emailSchema.methods.toClientFormat = function() {
  return {
    id: this._id.toString(),
    to: this.to_address,
    from: this.from_address,
    subject: this.subject,
    bodyText: this.body_text,
    bodyHtml: this.body_html,
    receivedAt: this.received_at,
    expiresAt: new Date(this.createdAt.getTime() + 900000) // +15 menit
  };
};

/**
 * Static method untuk mendapatkan semua email berdasarkan alamat
 */
emailSchema.statics.findByAddress = function(address) {
  return this.find({ to_address: address.toLowerCase() })
    .sort({ createdAt: -1 })
    .limit(50);
};

const Email = mongoose.model('Email', emailSchema);

export default Email;
