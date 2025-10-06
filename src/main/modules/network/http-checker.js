const http = require("http");
const https = require("https");
const { URL } = require("url");

/**
 * HTTP checker for web service detection
 */
class HttpChecker {
    /**
     * Check if a web service is accessible using HTTP HEAD request
     * @param {string} urlString - The URL to check (e.g., "https://github.com" or "http://localhost:3000")
     * @returns {Promise<object>} - Check result with accessible status, response time, status code, and error message
     */
    static async checkUrl(urlString) {
        console.log("=== HTTP Check ===");
        console.log("Checking URL:", urlString);

        try {
            const url = new URL(urlString);
            const protocol = url.protocol === "https:" ? https : http;
            
            return new Promise((resolve) => {
                const startTime = Date.now();
                
                const options = {
                    method: "HEAD",
                    hostname: url.hostname,
                    port: url.port || (url.protocol === "https:" ? 443 : 80),
                    path: url.pathname + url.search,
                    timeout: 3000, // 3 second timeout
                    headers: {
                        "User-Agent": "NetworkAssistant/1.0"
                    }
                };

                const req = protocol.request(options, (res) => {
                    const responseTime = Date.now() - startTime;
                    console.log(`HTTP response: ${res.statusCode} in ${responseTime}ms`);

                    // Consider 2xx and 3xx status codes as accessible
                    const isAccessible = res.statusCode >= 200 && res.statusCode < 400;

                    resolve({
                        accessible: isAccessible,
                        errorMessage: isAccessible ? null : `HTTP ${res.statusCode}`,
                        statusCode: res.statusCode,
                        responseTime: responseTime,
                        ip: res.socket?.remoteAddress || null
                    });

                    // Abort the request since we only need headers
                    req.abort();
                });

                req.on("timeout", () => {
                    console.log("HTTP request timeout");
                    req.destroy();
                    resolve({
                        accessible: false,
                        errorMessage: "请求超时",
                        statusCode: null,
                        responseTime: null,
                        ip: null
                    });
                });

                req.on("error", (error) => {
                    const responseTime = Date.now() - startTime;
                    console.error("HTTP request error:", error.message);
                    
                    let errorMessage = "连接失败";
                    if (error.code === "ECONNREFUSED") {
                        errorMessage = "连接被拒绝";
                    } else if (error.code === "ENOTFOUND") {
                        errorMessage = "DNS解析失败";
                    } else if (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT") {
                        errorMessage = "连接超时";
                    } else if (error.code === "ECONNRESET") {
                        errorMessage = "连接被重置";
                    } else if (error.message) {
                        errorMessage = error.message;
                    }

                    resolve({
                        accessible: false,
                        errorMessage: errorMessage,
                        statusCode: null,
                        responseTime: responseTime < 3000 ? responseTime : null,
                        ip: null
                    });
                });

                req.end();
            });
        } catch (error) {
            console.error("URL parsing error:", error);
            return {
                accessible: false,
                errorMessage: `URL格式错误: ${error.message}`,
                statusCode: null,
                responseTime: null,
                ip: null
            };
        }
    }
}

module.exports = HttpChecker;
