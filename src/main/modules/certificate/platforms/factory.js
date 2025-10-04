const os = require("os");
const WindowsCertificateManager = require("./windows");
const MacOSCertificateManager = require("./macos");
const LinuxCertificateManager = require("./linux");

/**
 * Platform factory to get the appropriate certificate manager for the current platform
 */
class PlatformCertificateManagerFactory {
    /**
     * Get the appropriate certificate manager based on the current platform
     * @returns {Object} - The platform-specific certificate manager
     */
    static getPlatformManager() {
        const platform = os.platform();
        
        switch (platform) {
            case "win32":
                return WindowsCertificateManager;
            case "darwin":
                return MacOSCertificateManager;
            default:
                // Linux and other platforms
                return LinuxCertificateManager;
        }
    }

    /**
     * Check if certificate is installed using the appropriate platform manager
     * @param {string} certificateContent - The certificate content
     * @param {object} certInfo - Certificate information
     * @returns {Promise<boolean>} - True if certificate is installed
     */
    static async checkCertificateInstalled(certificateContent, certInfo) {
        const manager = this.getPlatformManager();
        return await manager.checkCertificateInstalled(certificateContent, certInfo);
    }

    /**
     * Install certificate using the appropriate platform manager
     * @param {string} certificateContent - The certificate content to install
     * @returns {Promise<object>} - Installation result with success status and message
     */
    static async installCertificate(certificateContent) {
        const manager = this.getPlatformManager();
        return await manager.installCertificate(certificateContent);
    }
}

module.exports = PlatformCertificateManagerFactory;