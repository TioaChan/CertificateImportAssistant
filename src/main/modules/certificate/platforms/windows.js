const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Windows platform-specific certificate operations
 */
class WindowsCertificateManager {
    /**
     * Check if certificate is installed on Windows using certutil
     * @param {string} certificateContent - The certificate content
     * @param {object} certInfo - Certificate information including fingerprint
     * @returns {Promise<boolean>} - True if certificate is installed
     */
    static checkCertificateInstalled(certificateContent, certInfo) {
        return new Promise((resolve) => {
            console.log("=== Windows Certificate Check using certutil ===");
            console.log("Checking certificate fingerprint:", certInfo.fingerprint);

            // Use certutil to list all certificates in Root store and search for our fingerprint
            const certutil = spawn("certutil", ["-store", "Root"], {
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });

            let output = "";
            let errorOutput = "";

            certutil.stdout.on("data", (data) => {
                output += data.toString();
            });

            certutil.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            certutil.on("close", (code) => {
                console.log("certutil exit code:", code);
                if (errorOutput.trim()) {
                    console.log("certutil error output:", errorOutput.trim());
                }

                let isInstalled = false;

                if (code === 0) {
                    // Parse the output to find certificate fingerprints
                    // Look for our certificate's fingerprint in the output
                    const fingerprint = certInfo.fingerprint
                        .replace(/:/g, "")
                        .toLowerCase();
                    const outputLower = output.toLowerCase().replace(/\s/g, "");

                    // certutil -store output contains "Cert Hash(sha1):" followed by the fingerprint
                    if (outputLower.includes(fingerprint)) {
                        isInstalled = true;
                        console.log("Certificate fingerprint found in Root store");
                    } else {
                        console.log("Certificate fingerprint not found in Root store");
                    }
                } else {
                    console.log("Failed to list Root store certificates");
                }

                console.log(
                    "Certificate check result:",
                    isInstalled ? "CERTIFICATE TRUSTED" : "CERTIFICATE NOT TRUSTED"
                );
                console.log("===============================================");
                resolve(isInstalled);
            });

            certutil.on("error", (error) => {
                console.error("certutil command error:", error);
                console.log("Defaulting to NOT TRUSTED due to certutil error");
                resolve(false);
            });
        });
    }

    /**
     * Install certificate on Windows using certutil with UAC elevation
     * @param {string} certificateContent - The certificate content to install
     * @returns {Promise<object>} - Installation result with success status and message
     */
    static installCertificate(certificateContent) {
        return new Promise((resolve) => {
            const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`);
            fs.writeFileSync(tempFile, certificateContent);

            console.log("=== Windows Certificate Installation using certutil ===");
            console.log("Installing certificate:", tempFile);

            // Use certutil with UAC elevation - simplified command for better compatibility
            // For self-signed certificates, we use -f flag to force installation
            const powershellCommand = `
$process = Start-Process -FilePath "certutil.exe" -ArgumentList "-addstore", "-f", "Root", "${tempFile}" -Verb RunAs -Wait -PassThru
Write-Output "ExitCode: $($process.ExitCode)"
`.trim();

            const powershell = spawn(
                "powershell.exe",
                [
                    "-ExecutionPolicy",
                    "Bypass",
                    "-NoProfile",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    powershellCommand,
                ],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    windowsHide: true,
                }
            );

            let output = "";
            let errorOutput = "";

            powershell.stdout.on("data", (data) => {
                output += data.toString();
            });

            powershell.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            powershell.on("close", (code) => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (e) {
                    console.error("Error cleaning up temp file:", e);
                }

                console.log("=== Certificate Installation Results ===");
                console.log("PowerShell exit code:", code);
                console.log("Output:", output.trim());
                if (errorOutput.trim()) {
                    console.log("Error output:", errorOutput.trim());
                }

                // Parse the output to get the actual certutil exit code
                let certutilExitCode = null;
                const exitCodeMatch = output.match(/ExitCode\s*:\s*(\d+)/i);
                if (exitCodeMatch) {
                    certutilExitCode = parseInt(exitCodeMatch[1]);
                    console.log("Certutil exit code:", certutilExitCode);
                }

                // Determine success based on certutil exit code
                let success = false;
                let message = "";

                if (certutilExitCode === 0) {
                    success = true;
                    message = "证书导入成功（已自动提权）";
                } else if (certutilExitCode === null && code === 0) {
                    // Fallback: if we can't parse certutil exit code but PowerShell succeeded
                    success = true;
                    message = "证书导入成功";
                } else if (
                    errorOutput.includes("cancelled") ||
                    errorOutput.includes("用户取消") ||
                    errorOutput.includes("was cancelled")
                ) {
                    success = false;
                    message = "用户取消了权限提升请求";
                } else {
                    success = false;
                    message = `证书导入失败 (certutil exit code: ${certutilExitCode || "unknown"})`;
                }

                console.log("Installation result:", success ? "SUCCESS" : "FAILED");
                console.log("========================================");

                resolve({
                    success: success,
                    error: success ? undefined : message,
                    message: success ? message : undefined,
                });
            });

            powershell.on("error", (error) => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (e) {}
                console.error("PowerShell spawn error:", error);
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        });
    }
}

module.exports = WindowsCertificateManager;