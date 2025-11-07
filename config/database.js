/* eslint-env node */
/* global process */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Koneksi ke MongoDB Atlas
 */
const connectDatabase = async () => {
  try {
    const options = {
      dbName: 'temp_mail',
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    
    // Log saat koneksi terputus
    mongoose.connection.on('disconnected', () => {
      console.log('❌ MongoDB Disconnected');
    });
    
    // Log saat terjadi error
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Error:', err);
    });
    
  } catch (error) {
    console.error('❌ MongoDB Connection Failed:', error.message);
    process.exit(1);
  }
};

export default connectDatabase;
