const axios = require("axios");

const BASE_URL = "http://localhost:3001";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, url, expectedStatus = 200) {
  try {
    const response = await axios.get(url);
    if (response.status === expectedStatus) {
      log("green", `[PASS] ${name}: PASSED (${response.status})`);
      return { success: true, data: response.data };
    } else {
      log(
        "red",
        `[FAIL] ${name}: FAILED - Expected ${expectedStatus}, got ${response.status}`
      );
      return { success: false, error: `Wrong status code` };
    }
  } catch (error) {
    log("red", `[FAIL] ${name}: FAILED - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testCORS() {
  try {
    const response = await axios.get(`${BASE_URL}/`, {
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    const corsHeaders = response.headers["access-control-allow-credentials"];
    if (corsHeaders === "true") {
      log("green", "[PASS] CORS Configuration: PASSED");
      return true;
    } else {
      log(
        "red",
        "[FAIL] CORS Configuration: FAILED - Missing credentials header"
      );
      return false;
    }
  } catch (error) {
    log("red", `[FAIL] CORS Configuration: FAILED - ${error.message}`);
    return false;
  }
}

async function runTests() {
  log("blue", "Starting Server Tests...\n");

  const tests = [
    {
      name: "Health Check",
      url: `${BASE_URL}/`,
    },
    {
      name: "Spotify Current Track",
      url: `${BASE_URL}/api/spotify/current-track`,
    },
  ];

  let passedTests = 0;
  const totalTests = tests.length + 1; // +1 for CORS test

  // Run endpoint tests
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.url);
    if (result.success) {
      passedTests++;

      // Show sample data for successful tests
      if (result.data) {
        console.log(
          `   Sample response:`,
          JSON.stringify(result.data, null, 2).substring(0, 200) + "...\n"
        );
      }
    }
  }

  // Test CORS
  const corsResult = await testCORS();
  if (corsResult) passedTests++;

  // Summary
  log("blue", "\nTest Summary:");
  log(
    passedTests === totalTests ? "green" : "yellow",
    `${passedTests}/${totalTests} tests passed`
  );

  if (passedTests === totalTests) {
    log("green", "\nAll tests passed! Your server is ready for deployment.");
  } else {
    log(
      "yellow",
      "\nSome tests failed. Please check the issues above before deploying."
    );
  }
}

// Check if server is running first
async function checkServerRunning() {
  try {
    await axios.get(BASE_URL, { timeout: 2000 });
    return true;
  } catch (error) {
    log(
      "red",
      "[FAIL] Server is not running! Please start your server with: npm run dev"
    );
    log("yellow", "   Then run this test again.");
    return false;
  }
}

async function main() {
  const isRunning = await checkServerRunning();
  if (isRunning) {
    await runTests();
  }
}

main();
