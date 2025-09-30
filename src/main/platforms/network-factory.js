const os = require("os");
const WindowsNetworkChecker = require("./network-windows");
const MacOSNetworkChecker = require("./network-macos");
const LinuxNetworkChecker = require("./network-linux");

/**
 * Platform factory to get the appropriate network checker for the current platform
 */
class PlatformNetworkCheckerFactory {
    /**
     * Get the appropriate network checker based on the current platform
     * @returns {Object} - The platform-specific network checker
     */
    static getPlatformChecker() {
        const platform = os.platform();
        
        switch (platform) {
            case "win32":
                return WindowsNetworkChecker;
            case "darwin":
                return MacOSNetworkChecker;
            default:
                // Linux and other platforms
                return LinuxNetworkChecker;
        }
    }

    /**
     * Check if a domain is accessible using the appropriate platform checker
     * @param {string} domain - The domain to check
     * @returns {Promise<object>} - Check result with accessible status, IP, response time, and error message
     */
    static async checkDomainStatus(domain) {
        const checker = this.getPlatformChecker();
        return await checker.checkDomainStatus(domain);
    }
}

module.exports = PlatformNetworkCheckerFactory;
