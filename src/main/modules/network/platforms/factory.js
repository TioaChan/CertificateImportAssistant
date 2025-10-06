const os = require("os");
const WindowsNetworkChecker = require("./windows");
const MacOSNetworkChecker = require("./macos");
const LinuxNetworkChecker = require("./linux");
const HttpChecker = require("../http-checker");

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
     * Check network status based on the configuration type
     * @param {object} config - Configuration object with type, domain, or url
     * @returns {Promise<object>} - Check result with accessible status, IP, response time, and error message
     */
    static async checkNetworkStatus(config) {
        // Support both old format (string) and new format (object)
        if (typeof config === "string") {
            // Old format: just a domain string
            const checker = this.getPlatformChecker();
            return await checker.checkDomainStatus(config);
        }

        // New format: object with type
        const type = config.type || "ping";
        
        if (type === "http" && config.url) {
            // HTTP check using HEAD request
            return await HttpChecker.checkUrl(config.url);
        } else if (type === "ping" && config.domain) {
            // Traditional ping check
            const checker = this.getPlatformChecker();
            return await checker.checkDomainStatus(config.domain);
        } else {
            return {
                accessible: false,
                errorMessage: "配置格式错误",
                ip: null,
                responseTime: null
            };
        }
    }

    /**
     * Legacy method for backward compatibility
     * @param {string} domain - The domain to check
     * @returns {Promise<object>} - Check result
     */
    static async checkDomainStatus(domain) {
        const checker = this.getPlatformChecker();
        return await checker.checkDomainStatus(domain);
    }
}

module.exports = PlatformNetworkCheckerFactory;
