import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    subscriptionTier: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    maxFreeGenerations: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const User = mongoose.model("User", userSchema);
export default User;
