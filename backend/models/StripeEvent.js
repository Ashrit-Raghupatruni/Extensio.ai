import mongoose from "mongoose";

const stripeEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
    index: { expires: 2592000 }, // Expires after 30 days (value in seconds)
  },
});

const StripeEvent = mongoose.model("StripeEvent", stripeEventSchema);
export default StripeEvent;
