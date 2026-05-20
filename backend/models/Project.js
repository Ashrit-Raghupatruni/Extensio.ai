import mongoose from "mongoose";

const versionSchema = new mongoose.Schema(
  {
    versionId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    prompt: {
      type: String,
      required: true,
    },
    files: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    versions: [versionSchema],
  },
  {
    timestamps: true,
  }
);

const Project = mongoose.model("Project", projectSchema);
export default Project;
