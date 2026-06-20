import mongoose from "mongoose";

export async function connectDB() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/extensio";
  console.log(`[db] Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}...`);

  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`[db] MongoDB connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[db] MongoDB connection error:`, error.message);
    process.exit(1);
  }
}

export default connectDB;
