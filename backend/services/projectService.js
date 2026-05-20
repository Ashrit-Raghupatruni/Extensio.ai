import Project from "../models/Project.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Lists all projects for a specific user.
 * Optimizes performance by omitting the massive files field of each version in the list.
 * @param {string} userId - User's MongoDB ObjectId
 * @returns {Promise<Array>} List of user projects
 */
export async function listProjects(userId) {
  try {
    return await Project.find({ userId }, { "versions.files": 0 }).sort({ updatedAt: -1 });
  } catch (error) {
    console.error("[projectService/listProjects] error:", error);
    return [];
  }
}

/**
 * Gets a specific project for a user by project ID, including all file contents.
 * @param {string} id - Project ObjectId
 * @param {string} userId - User ObjectId
 * @returns {Promise<object|null>} The Project document or null
 */
export async function getProject(id, userId) {
  try {
    return await Project.findOne({ _id: id, userId });
  } catch (error) {
    console.error("[projectService/getProject] error:", error);
    return null;
  }
}

/**
 * Saves a new project or appends a new code version to an existing project.
 * @param {object} payload - { id, userId, projectName, prompt, files }
 * @returns {Promise<object>} The updated/created Project document
 */
export async function saveProject({ id, userId, projectName, prompt, files }) {
  const time = new Date().toISOString();
  const versionId = uuidv4();

  const newVersion = {
    versionId,
    timestamp: time,
    prompt,
    files, // Mongoose maps this object automatically to a Map of Strings
  };

  try {
    if (id) {
      // Find existing project and verify user ownership
      const project = await Project.findOne({ _id: id, userId });
      if (!project) {
        throw new Error("Project not found or access denied.");
      }

      project.projectName = projectName; // Allow updates to the project name
      project.versions.push(newVersion);
      await project.save();
      return project;
    } else {
      // Create a brand new project
      const project = new Project({
        userId,
        projectName,
        versions: [newVersion],
      });
      await project.save();
      return project;
    }
  } catch (error) {
    console.error("[projectService/saveProject] error:", error.message);
    throw error;
  }
}

/**
 * Renames a project for a specific user.
 * @param {string} id - Project ObjectId
 * @param {string} newName - New name for the project
 * @param {string} userId - User ObjectId
 * @returns {Promise<object|null>} The updated Project document
 */
export async function renameProject(id, newName, userId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: id, userId },
      { projectName: newName },
      { new: true }
    );
  } catch (error) {
    console.error("[projectService/renameProject] error:", error);
    throw error;
  }
}

/**
 * Deletes a project for a specific user.
 * @param {string} id - Project ObjectId
 * @param {string} userId - User ObjectId
 * @returns {Promise<boolean>} True if deleted successfully, false otherwise
 */
export async function deleteProject(id, userId) {
  try {
    const result = await Project.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  } catch (error) {
    console.error("[projectService/deleteProject] error:", error);
    return false;
  }
}
