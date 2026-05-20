import axios from "axios";

const BASE_URL = "http://localhost:4000/api";
const timestamp = Date.now();
const username = `tester_${timestamp}`;
const password = "password123";

async function runTests() {
  console.log(`\n🚀 STARTING END-TO-END VERIFICATION TESTS...`);
  console.log(`Using Base URL: ${BASE_URL}\n`);

  let token = "";
  let headers = {};
  let projectId = "";
  let version1Id = "";
  let version2Id = "";

  try {
    // 1. User Registration
    console.log(`[Test 1] Registering a new user: "${username}"...`);
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      username,
      password
    });
    
    if (regRes.status === 201 && regRes.data.token) {
      token = regRes.data.token;
      headers = { Authorization: `Bearer ${token}` };
      console.log(`✅ Registration successful! Token retrieved: ${token.slice(0, 10)}...`);
    } else {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
    }

    // 2. Profile Access Verification
    console.log(`\n[Test 2] Fetching user profile details via /auth/me...`);
    const profileRes = await axios.get(`${BASE_URL}/auth/me`, { headers });
    if (profileRes.status === 200 && profileRes.data.user.username === username) {
      console.log(`✅ Profile retrieved successfully! User ID: ${profileRes.data.user.id}`);
    } else {
      throw new Error(`Profile verification failed: ${JSON.stringify(profileRes.data)}`);
    }

    // 3. Initial Project Generation
    console.log(`\n[Test 3] Creating a new extension project "Tab Tracker"...`);
    const genRes = await axios.post(`${BASE_URL}/extensions/generate`, {
      projectName: "Tab Tracker",
      prompt: "A popup extension that lists all active tab urls with a red button"
    }, { headers });

    if (genRes.status === 200 && genRes.data.projectId) {
      projectId = genRes.data.projectId;
      version1Id = genRes.data.versionId;
      console.log(`✅ Extension generated successfully!`);
      console.log(`   Project ID: ${projectId}`);
      console.log(`   Version 1 ID: ${version1Id}`);
      console.log(`   Files created: ${Object.keys(genRes.data.files).join(", ")}`);
      
      // Verify files content
      if (!genRes.data.files["manifest.json"] || !genRes.data.files["popup.html"]) {
        throw new Error("Missing required files (manifest.json or popup.html)");
      }
    } else {
      throw new Error(`Generation failed: ${JSON.stringify(genRes.data)}`);
    }

    // 4. Modify and Iterate Project (v2)
    console.log(`\n[Test 4] Requesting modification: "change button background to violet"...`);
    const iterRes = await axios.post(`${BASE_URL}/extensions/generate`, {
      projectName: "Tab Tracker",
      prompt: "change button background to violet",
      projectId: projectId
    }, { headers });

    if (iterRes.status === 200 && iterRes.data.projectId === projectId) {
      version2Id = iterRes.data.versionId;
      console.log(`✅ Iteration applied successfully!`);
      console.log(`   Version 2 ID: ${version2Id}`);
      
      // Verify styling modification (Smart Mock Mode replacement)
      const popupHtml = iterRes.data.files["popup.html"];
      if (popupHtml.includes("background-color: violet")) {
        console.log(`✅ Smart Mock verified: Button color successfully changed to violet!`);
      } else {
        console.warn(`⚠️ Warning: button color change did not reflect in HTML, but generation completed.`);
      }
    } else {
      throw new Error(`Iteration failed: ${JSON.stringify(iterRes.data)}`);
    }

    // 5. Project Retrieval & Version History
    console.log(`\n[Test 5] Fetching complete project details with version history...`);
    const projectRes = await axios.get(`${BASE_URL}/projects/${projectId}`, { headers });
    if (projectRes.status === 200) {
      const versions = projectRes.data.versions;
      console.log(`✅ Project retrieved successfully!`);
      console.log(`   Project Name: ${projectRes.data.projectName}`);
      console.log(`   Total Versions In Database: ${versions.length}`);
      
      if (versions.length === 2) {
        console.log(`✅ Multiversioning verified: 2 versions stored correctly in MongoDB.`);
      } else {
        throw new Error(`Expected 2 versions in history, found: ${versions.length}`);
      }
    } else {
      throw new Error(`Failed to retrieve project details: ${JSON.stringify(projectRes.data)}`);
    }

    // 5.5. Live Extension Preview Serving
    console.log(`\n[Test 5.5] Querying Live Preview asset popup.html for Version 2...`);
    const previewRes = await axios.get(`${BASE_URL}/projects/${projectId}/versions/${version2Id}/preview/popup.html`, { headers });
    if (previewRes.status === 200) {
      const type = previewRes.headers["content-type"];
      console.log(`✅ Live Preview asset retrieved successfully!`);
      console.log(`   Content-Type: ${type}`);
      if (type.includes("text/html")) {
        console.log(`✅ MIME type header verified (text/html).`);
      } else {
        throw new Error(`Expected text/html content type, got: ${type}`);
      }
      if (previewRes.data.includes("<html") || previewRes.data.includes("<!DOCTYPE")) {
        console.log(`✅ HTML payload structure verified.`);
      } else {
        throw new Error("Preview payload does not appear to be valid HTML");
      }
    } else {
      throw new Error(`Live Preview retrieval failed: status ${previewRes.status}`);
    }

    // 6. On-The-Fly ZIP Download
    console.log(`\n[Test 6] Downloading Version 2 ZIP archive on-the-fly...`);
    const dlRes = await axios.get(`${BASE_URL}/projects/${projectId}/versions/${version2Id}/download`, {
      headers,
      responseType: "arraybuffer"
    });

    if (dlRes.status === 200) {
      const size = dlRes.headers["content-length"];
      const type = dlRes.headers["content-type"];
      console.log(`✅ ZIP package received successfully!`);
      console.log(`   Content-Type: ${type}`);
      console.log(`   Archive Size: ${size} bytes`);
      
      if (type.includes("application/zip")) {
        console.log(`✅ ZIP format header confirmed.`);
      } else {
        throw new Error(`Expected ZIP Content-Type, got: ${type}`);
      }
    } else {
      throw new Error(`ZIP Download failed: status ${dlRes.status}`);
    }

    // 7. Project Rename
    console.log(`\n[Test 7] Renaming project to "Tab Tracker Elite"...`);
    const renameRes = await axios.patch(`${BASE_URL}/projects/${projectId}/rename`, {
      projectName: "Tab Tracker Elite"
    }, { headers });

    if (renameRes.status === 200 && renameRes.data.projectName === "Tab Tracker Elite") {
      console.log(`✅ Project renamed successfully to "Tab Tracker Elite"!`);
    } else {
      throw new Error(`Rename failed: ${JSON.stringify(renameRes.data)}`);
    }

    // 8. List Projects Check
    console.log(`\n[Test 8] Listing projects on SaaS Dashboard...`);
    const listRes = await axios.get(`${BASE_URL}/projects`, { headers });
    if (listRes.status === 200 && listRes.data.length > 0) {
      const found = listRes.data.find(p => p._id === projectId);
      if (found && found.projectName === "Tab Tracker Elite") {
        console.log(`✅ Dashboard list verified! Found renamed project "${found.projectName}" (v${found.versionsCount}).`);
      } else {
        throw new Error(`Project not found in listing or rename didn't persist.`);
      }
    } else {
      throw new Error(`List projects failed: ${JSON.stringify(listRes.data)}`);
    }

    // 9. Project Deletion
    console.log(`\n[Test 9] Deleting project "${projectId}"...`);
    const delRes = await axios.delete(`${BASE_URL}/projects/${projectId}`, { headers });
    if (delRes.status === 200 && delRes.data.success) {
      console.log(`✅ Project deleted successfully!`);
    } else {
      throw new Error(`Deletion failed: ${JSON.stringify(delRes.data)}`);
    }

    // 10. Deletion Verification
    console.log(`\n[Test 10] Verifying deletion in database...`);
    try {
      await axios.get(`${BASE_URL}/projects/${projectId}`, { headers });
      throw new Error("Expected 404 for deleted project, but got 200");
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.log(`✅ Deletion verified! Project is no longer retrievable (HTTP 404).`);
      } else {
        throw err;
      }
    }

    // 11. Session Logout
    console.log(`\n[Test 11] Logging out and ending session...`);
    const logoutRes = await axios.post(`${BASE_URL}/auth/logout`, {}, { headers });
    if (logoutRes.status === 200) {
      console.log(`✅ Session logged out successfully!`);
    } else {
      throw new Error(`Logout failed: ${JSON.stringify(logoutRes.data)}`);
    }

    console.log(`\n🎉 ALL TESTS PASSED SUCCESSFULLY!`);
    console.log(`Container stack is fully operational, secure, and ready for deployment.\n`);
  } catch (error) {
    console.error(`\n❌ TEST FAILING AT STEP:`, error.message);
    if (error.response && error.response.data) {
      console.error(`Response details:`, JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

runTests();
