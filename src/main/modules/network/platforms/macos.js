const { spawn } = require("child_process");
const dns = require("dns").promises;

/**
 * macOS platform-specific network operations
 */
class MacOSNetworkChecker {
    /**
     * Check if a domain is accessible on macOS using ping
     * @param {string} domain - The domain to check
     * @returns {Promise<object>} - Check result with accessible status, IP, response time, and error message
     */
    static async checkDomainStatus(domain) {
        console.log("=== macOS Network Check ===");
        console.log("Checking domain:", domain);

        try {
            // First, try to resolve DNS
            let ipAddress = null;
            try {
                const addresses = await dns.resolve4(domain);
                if (addresses && addresses.length > 0) {
                    ipAddress = addresses[0];
                    console.log(`DNS resolved: ${domain} -> ${ipAddress}`);
                }
            } catch (dnsError) {
                console.error("DNS resolution failed:", dnsError.message);
                return {
                    accessible: false,
                    errorMessage: `DNS解析失败: ${dnsError.message}`,
                    ip: null,
                    responseTime: null
                };
            }

            // Then try to ping the domain
            return new Promise((resolve) => {
                const startTime = Date.now();
                
                // Use ping command with -c 1 (send 1 packet) and -W 5000 (timeout 5 seconds)
                const ping = spawn("ping", ["-c", "1", "-W", "5000", domain], {
                    stdio: ["pipe", "pipe", "pipe"],
                });

                let output = "";
                let errorOutput = "";

                ping.stdout.on("data", (data) => {
                    output += data.toString();
                });

                ping.stderr.on("data", (data) => {
                    errorOutput += data.toString();
                });

                ping.on("close", (code) => {
                    const responseTime = Date.now() - startTime;
                    console.log("ping exit code:", code);
                    console.log("ping output:", output);

                    if (code === 0) {
                        // Success - extract response time from output
                        // Look for "time=XX.X ms" pattern
                        const timeMatch = output.match(/time=([\d.]+)\s*ms/i);
                        const pingTime = timeMatch ? Math.round(parseFloat(timeMatch[1])) : responseTime;

                        resolve({
                            accessible: true,
                            errorMessage: null,
                            ip: ipAddress,
                            responseTime: pingTime
                        });
                    } else {
                        // Failed - determine error message
                        let errorMessage = "目标网络不可达";
                        
                        if (output.includes("Host is down") || output.includes("host down")) {
                            errorMessage = "目标主机已关闭";
                        } else if (output.includes("No route to host")) {
                            errorMessage = "无路由到达主机";
                        } else if (output.includes("Request timeout") || output.includes("100.0% packet loss")) {
                            errorMessage = "请求超时";
                        } else if (output.includes("cannot resolve")) {
                            errorMessage = "无法解析主机名";
                        }

                        resolve({
                            accessible: false,
                            errorMessage: errorMessage,
                            ip: ipAddress,
                            responseTime: null
                        });
                    }
                });

                ping.on("error", (error) => {
                    console.error("ping error:", error);
                    resolve({
                        accessible: false,
                        errorMessage: `网络检测失败: ${error.message}`,
                        ip: ipAddress,
                        responseTime: null
                    });
                });
            });
        } catch (error) {
            console.error("Network check error:", error);
            return {
                accessible: false,
                errorMessage: `检测失败: ${error.message}`,
                ip: null,
                responseTime: null
            };
        }
    }
}

module.exports = MacOSNetworkChecker;
