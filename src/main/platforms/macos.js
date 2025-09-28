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
     * @param {object} certInfo - Certificate information including subject
     * @returns {Promise<boolean>} - True if certificate is installed
     */
    static checkCertificateInstalled(certificateContent, certInfo) {
        return new Promise((resolve) => {
            const tempFile = path.join(os.tmpdir(), `temp_cert_${Date.now()}.pem`);
            fs.writeFileSync(tempFile, certificateContent);

            // Check if certificate exists in system keychain
            const security = spawn("security", [
                "find-certificate",
                "-c",
                certInfo.subject.split(",")[0].replace("CN=", ""),
                "/Library/Keychains/System.keychain",
            ]);

            security.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve(code === 0);
            });

            security.on("error", () => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve(false);
            });
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

            // Create an AppleScript that prompts for admin password and runs security command
            const appleScript = `
do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
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

                if (code === 0) {
                    resolve({
                        success: true,
                        message: "证书导入成功（已自动提权）",
                    });
                } else {
                    const errorMsg = errorOutput || "未知错误";
                    if (
                        errorMsg.includes("User cancelled") ||
                        errorMsg.includes("用户取消")
                    ) {
                        resolve({
                            success: false,
                            error: "用户取消了权限提升请求",
                        });
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
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        });
    }
}

module.exports = MacOSCertificateManager;