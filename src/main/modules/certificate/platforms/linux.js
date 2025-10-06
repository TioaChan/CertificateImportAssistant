const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Linux platform-specific certificate operations
 */
class LinuxCertificateManager {
    /**
     * Check if certificate is installed on Linux (basic implementation)
     * @param {string} certificateContent - The certificate content
     * @param {object} certInfo - Certificate information
     * @returns {Promise<boolean>} - True if certificate is installed
     */
    static checkCertificateInstalled(certificateContent, certInfo) {
        return new Promise((resolve) => {
            // Linux or other - basic implementation
            resolve(false);
        });
    }

    /**
     * Install certificate on Linux using pkexec for privilege escalation
     * @param {string} certificateContent - The certificate content to install
     * @returns {Promise<object>} - Installation result with success status and message
     */
    static installCertificate(certificateContent) {
        return new Promise((resolve) => {
            const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`);
            fs.writeFileSync(tempFile, certificateContent);

            // Try to copy certificate to system trust store with pkexec
            const pkexec = spawn("pkexec", [
                "cp",
                tempFile,
                "/usr/local/share/ca-certificates/",
            ]);

            pkexec.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}

                if (code === 0) {
                    // Update certificate store
                    const updateCerts = spawn("pkexec", ["update-ca-certificates"]);
                    updateCerts.on("close", (updateCode) => {
                        if (updateCode === 0) {
                            resolve({
                                success: true,
                                message: "证书导入成功（已自动提权）",
                            });
                        } else {
                            resolve({
                                success: false,
                                error: "证书导入成功但更新证书存储失败",
                            });
                        }
                    });
                } else {
                    resolve({
                        success: false,
                        error: "证书导入失败，权限提升被拒绝或系统不支持",
                    });
                }
            });

            pkexec.on("error", (error) => {
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

module.exports = LinuxCertificateManager;