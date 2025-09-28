const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * macOS platform-specific certificate operations
 */
class MacOSCertificateManager {
    /**
     * Check if certificate is installed on macOS using security command
     * @param {string} certificateContent - The certificate content
     * @param {object} certInfo - Certificate information including fingerprint
     * @returns {Promise<boolean>} - True if certificate is installed
     */
    static checkCertificateInstalled(certificateContent, certInfo) {
        return new Promise((resolve) => {
            console.log("=== macOS Certificate Installation Check ===");
            console.log("Checking certificate:", certInfo.name);
            console.log("Expected fingerprint:", certInfo.fingerprint);

            // Check System keychain where certificates are installed
            const keychains = [
                "/Library/Keychains/System.keychain",
            ];

            let found = false;
            let checkedKeychains = 0;

            const checkKeychain = (keychain) => {
                console.log(`Checking keychain: ${keychain}`);
                
                // Use security find-certificate with -Z flag to get SHA-1 fingerprints
                const security = spawn("security", [
                    "find-certificate",
                    "-a",  // Find all matching certificates
                    "-Z",  // Print SHA-1 hash
                    keychain,
                ]);

                let output = "";
                let errorOutput = "";

                security.stdout.on("data", (data) => {
                    output += data.toString();
                });

                security.stderr.on("data", (data) => {
                    errorOutput += data.toString();
                });

                security.on("close", (code) => {
                    checkedKeychains++;
                    
                    if (code === 0 && output) {
                        // Parse output to find SHA-1 fingerprints
                        // Format: "SHA-1 hash: 1A2B3C4D..."
                        const fingerprints = output.match(/SHA-1 hash: ([A-Fa-f0-9 ]+)/g);
                        if (fingerprints) {
                            const normalizedExpected = certInfo.fingerprint
                                .replace(/:/g, "")
                                .toLowerCase();
                            
                            for (const fpLine of fingerprints) {
                                const fp = fpLine.replace("SHA-1 hash: ", "")
                                    .replace(/\s/g, "")
                                    .toLowerCase();
                                
                                if (fp === normalizedExpected) {
                                    console.log(`Certificate fingerprint found in keychain: ${keychain}`);
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }

                    // If this was the last keychain to check, resolve
                    if (checkedKeychains === keychains.length) {
                        console.log(
                            "Certificate check result:",
                            found ? "CERTIFICATE TRUSTED" : "CERTIFICATE NOT TRUSTED"
                        );
                        console.log("===========================================");
                        resolve(found);
                    }
                });

                security.on("error", (error) => {
                    console.error(`Error checking keychain ${keychain}:`, error);
                    checkedKeychains++;
                    
                    // If this was the last keychain to check, resolve
                    if (checkedKeychains === keychains.length) {
                        console.log("Defaulting to NOT TRUSTED due to security command error");
                        resolve(found);
                    }
                });
            };

            // Check all keychains
            keychains.forEach(checkKeychain);
        });
    }

    /**
     * Install certificate on macOS using osascript for privilege escalation with security command
     * @param {string} certificateContent - The certificate content to install
     * @returns {Promise<object>} - Installation result with success status and message
     */
    static installCertificate(certificateContent) {
        return new Promise((resolve) => {
            const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`);
            fs.writeFileSync(tempFile, certificateContent);

            console.log("=== macOS Certificate Installation ===");
            console.log("Installing certificate:", tempFile);

            // Create an AppleScript that adds the certificate and sets trust settings
            // Use add-trusted-cert with simplified parameters to avoid SecTrustSettingsSetTrustSettings errors
            const appleScript = `
do shell script "security add-trusted-cert -r trustRoot -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`;

            const osascript = spawn("osascript", ["-e", appleScript]);

            let output = "";
            let errorOutput = "";

            osascript.stdout.on("data", (data) => {
                output += data.toString();
            });

            osascript.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            osascript.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}

                console.log("=== Certificate Installation Results ===");
                console.log("osascript exit code:", code);
                console.log("Output:", output.trim());
                if (errorOutput.trim()) {
                    console.log("Error output:", errorOutput.trim());
                }

                if (code === 0) {
                    console.log("Certificate installation successful");
                    resolve({
                        success: true,
                        message: "证书导入成功并已设置为受信任的根证书",
                    });
                } else {
                    const errorMsg = errorOutput || "未知错误";
                    console.log("Certificate installation failed:", errorMsg);
                    
                    if (
                        errorMsg.includes("User cancelled") ||
                        errorMsg.includes("用户取消") ||
                        errorMsg.includes("User canceled")
                    ) {
                        resolve({
                            success: false,
                            error: "用户取消了权限提升请求",
                        });
                    } else if (
                        errorMsg.includes("already exists") ||
                        errorMsg.includes("SecTrustSettingsSetTrustSettings")
                    ) {
                        // Certificate already exists or trust settings failed, try alternative approach
                        console.log("Certificate exists or trust settings failed, trying alternative approach");
                        this.installWithAlternativeMethod(tempFile, certificateContent).then(resolve);
                    } else {
                        resolve({
                            success: false,
                            error: `证书导入失败: ${errorMsg}`,
                        });
                    }
                }
            });

            osascript.on("error", (error) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                console.error("osascript spawn error:", error);
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        });
    }

    /**
     * Alternative installation method using two separate steps
     * @param {string} tempFile - Temporary certificate file path
     * @param {string} certificateContent - The certificate content
     * @returns {Promise<object>} - Installation result
     */
    static installWithAlternativeMethod(tempFile, certificateContent) {
        return new Promise((resolve) => {
            console.log("Using alternative installation method");
            
            // Step 1: Add certificate without trust settings
            const addCertScript = `
do shell script "security add-cert -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`;

            const osascript = spawn("osascript", ["-e", addCertScript]);

            let output = "";
            let errorOutput = "";

            osascript.stdout.on("data", (data) => {
                output += data.toString();
            });

            osascript.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            osascript.on("close", (code) => {
                console.log("Add certificate exit code:", code);
                
                if (code === 0 || errorOutput.includes("already exists")) {
                    // Certificate added successfully or already exists, now try to set trust
                    console.log("Certificate added, now setting trust manually");
                    this.setManualTrust(tempFile, certificateContent).then(resolve);
                } else {
                    resolve({
                        success: false,
                        error: `证书添加失败: ${errorOutput || "未知错误"}`,
                    });
                }
            });

            osascript.on("error", (error) => {
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        });
    }

    /**
     * Set manual trust for certificate using basic add-trusted-cert
     * @param {string} tempFile - Temporary certificate file path
     * @param {string} certificateContent - The certificate content
     * @returns {Promise<object>} - Trust setting result
     */
    static setManualTrust(tempFile, certificateContent) {
        return new Promise((resolve) => {
            console.log("Setting manual trust for certificate");
            
            // Try basic trust setting without domain/policy flags
            const trustScript = `
do shell script "security add-trusted-cert -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`;

            const osascript = spawn("osascript", ["-e", trustScript]);

            let output = "";
            let errorOutput = "";

            osascript.stdout.on("data", (data) => {
                output += data.toString();
            });

            osascript.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            osascript.on("close", (code) => {
                console.log("Trust setting exit code:", code);
                
                if (code === 0) {
                    resolve({
                        success: true,
                        message: "证书导入成功，请在系统设置中验证信任状态",
                    });
                } else if (errorOutput.includes("already trusted") || errorOutput.includes("already exists")) {
                    resolve({
                        success: true,
                        message: "证书已存在并设置为受信任状态",
                    });
                } else {
                    resolve({
                        success: false,
                        error: `信任设置失败: ${errorOutput || "未知错误"}，请手动在系统设置中设置证书信任`,
                    });
                }
            });

            osascript.on("error", (error) => {
                resolve({
                    success: false,
                    error: `设置信任失败: ${error.message}`,
                });
            });
        });
    }
    /**
     * Set trust settings for an already imported certificate
     * @param {string} tempFile - Temporary certificate file path
     * @param {string} certificateContent - The certificate content
     * @returns {Promise<object>} - Trust setting result
     */
    static setTrustOnly(tempFile, certificateContent) {
        return new Promise((resolve) => {
            const trustScript = `
do shell script "security add-trusted-cert -r trustRoot -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`;

            const osascript = spawn("osascript", ["-e", trustScript]);

            let output = "";
            let errorOutput = "";

            osascript.stdout.on("data", (data) => {
                output += data.toString();
            });

            osascript.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            osascript.on("close", (code) => {
                console.log("Trust setting exit code:", code);
                
                if (code === 0) {
                    resolve({
                        success: true,
                        message: "证书信任设置成功",
                    });
                } else {
                    resolve({
                        success: false,
                        error: `证书信任设置失败: ${errorOutput || "未知错误"}`,
                    });
                }
            });

            osascript.on("error", (error) => {
                resolve({
                    success: false,
                    error: `设置信任失败: ${error.message}`,
                });
            });
        });
    }
}

module.exports = MacOSCertificateManager;