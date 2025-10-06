<template>
    <div class="app-container">
        <el-container>
            <el-header class="app-header">
                <div class="app-title">
                    <el-icon><Lock /></el-icon>
                    网络助手
                </div>
            </el-header>

            <el-main class="app-main">
                <el-scrollbar>
                <el-card class="certificate-list" v-loading="loading">
                    <template #header>
                        <div class="card-header">
                            <span>证书列表 ({{ certificates.length }})</span>
                            <div class="header-actions">
                                <el-button
                                    type="primary"
                                    size="small"
                                    @click="refreshCertificateStatus"
                                    :loading="loading"
                                >
                                    <template #icon>
                                        <Refresh />
                                    </template>
                                    刷新证书列表
                                </el-button>

                                <el-tooltip
                                    content="批量导入所有未信任的证书，将自动请求管理员权限"
                                    placement="top"
                                >
                                    <el-button
                                        type="success"
                                        size="small"
                                        @click="importAllCertificates"
                                        :disabled="!hasUninstalledCerts || installing"
                                        :loading="installingAll"
                                    >
                                        <template #icon>
                                            <Download />
                                        </template>
                                        一键导入全部 ({{ uninstalledCount }})
                                    </el-button>
                                </el-tooltip>
                            </div>
                        </div>
                    </template>

                    <div v-if="certificates.length === 0" class="empty-state">
                        <el-empty description="没有找到证书文件" />
                    </div>

                    <div v-else>
                        <el-row :gutter="20">
                            <el-col
                                :xs="24"
                                :sm="12"
                                :md="8"
                                :lg="6"
                                v-for="cert in certificates"
                                :key="cert.filename"
                                class="certificate-item"
                            >
                                <el-card
                                    class="certificate-card"
                                    :class="{ installed: cert.isInstalled }"
                                >
                                    <template #header>
                                        <div class="certificate-header">
                                            <div class="certificate-name">
                                                {{ cert.info.commonName }}
                                            </div>
                                            <el-tag
                                                :type="
                                                    cert.isInstalled
                                                        ? 'success'
                                                        : 'warning'
                                                "
                                                size="small"
                                            >
                                                {{
                                                    cert.isInstalled
                                                        ? "已信任"
                                                        : "未信任"
                                                }}
                                            </el-tag>
                                        </div>
                                    </template>

                                    <div class="certificate-details">
                                        <div class="detail-row">
                                            <span class="label">文件名:</span>
                                            <span class="value">{{
                                                cert.filename
                                            }}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="label">有效期:</span>
                                            <span class="value"
                                                >{{ cert.info.validFrom }} ~
                                                {{ cert.info.validTo }}</span
                                            >
                                        </div>
                                        <div class="detail-row">
                                            <span class="label">指纹:</span>
                                            <span
                                                class="value fingerprint"
                                                :title="cert.info.fingerprint"
                                                >{{
                                                    cert.info.fingerprint
                                                }}</span
                                            >
                                        </div>
                                    </div>

                                    <template #footer>
                                        <div class="certificate-actions">
                                            <el-tooltip
                                                v-if="!cert.isInstalled"
                                                content="点击导入证书到系统信任区，将自动请求管理员权限"
                                                placement="top"
                                            >
                                                <el-button
                                                    type="primary"
                                                    size="small"
                                                    :loading="cert.installing"
                                                    @click="
                                                        installCertificate(cert)
                                                    "
                                                >
                                                    <template #icon>
                                                        <Lock
                                                            v-if="
                                                                !cert.installing
                                                            "
                                                        />
                                                    </template>
                                                    导入证书
                                                </el-button>
                                            </el-tooltip>
                                            <el-button
                                                v-else
                                                type="success"
                                                size="small"
                                                disabled
                                            >
                                                已信任
                                            </el-button>
                                        </div>
                                    </template>
                                </el-card>
                            </el-col>
                        </el-row>
                    </div>
                </el-card>

                <!-- Network Detection Card -->
                <el-card class="network-detection">
                    <template #header>
                        <div class="card-header">
                            <span>网络检测 ({{ domains.length }})</span>
                            <div class="header-actions">
                                <el-button
                                    type="primary"
                                    size="small"
                                    @click="checkNetworkStatus"
                                    :loading="networkLoading"
                                >
                                    <template #icon>
                                        <Refresh />
                                    </template>
                                    刷新网络状态
                                </el-button>
                            </div>
                        </div>
                    </template>

                    <div v-if="domains.length === 0" class="empty-state">
                        <el-empty description="没有配置域名" />
                    </div>

                    <div v-else class="network-list" v-loading="networkLoading">
                        <div 
                            v-for="domain in domains" 
                            :key="domain.id" 
                            class="network-item"
                        >
                            <div class="network-item-main">
                                <div class="network-name">
                                    {{ domain.name }}
                                    <el-tag v-if="domain.type === 'http'" type="info" size="small" style="margin-left: 8px;">HTTP</el-tag>
                                    <el-tag v-else-if="domain.type === 'ping'" type="info" size="small" style="margin-left: 8px;">PING</el-tag>
                                </div>
                                <div class="network-domain">{{ domain.url || domain.domain }}</div>
                            </div>
                            <div class="network-item-details">
                                <div class="network-status">
                                    <el-tag
                                        :type="
                                            domain.status === 'accessible'
                                                ? 'success'
                                                : domain.status === 'checking'
                                                ? 'info'
                                                : 'danger'
                                        "
                                        size="small"
                                    >
                                        {{
                                            domain.status === 'accessible'
                                                ? '可访问'
                                                : domain.status === 'checking'
                                                ? '检测中'
                                                : '无法访问'
                                        }}
                                    </el-tag>
                                </div>
                                <div v-if="domain.statusCode" class="network-info">
                                    <span class="info-label">状态码:</span>
                                    <span class="info-value">{{ domain.statusCode }}</span>
                                </div>
                                <div v-if="domain.ip" class="network-info">
                                    <span class="info-label">IP:</span>
                                    <span class="info-value">{{ domain.ip }}</span>
                                </div>
                                <div v-if="domain.responseTime" class="network-info">
                                    <span class="info-label">响应:</span>
                                    <span class="info-value">{{ domain.responseTime }}ms</span>
                                </div>
                                <div v-if="domain.errorMessage" class="network-error">
                                    <span class="info-label">错误:</span>
                                    <span class="info-value error-text">{{ domain.errorMessage }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </el-card>
                </el-scrollbar>
            </el-main>
        </el-container>

        <!-- 导入结果对话框 -->
        <el-dialog
            v-model="showResultDialog"
            title="导入结果"
            width="600px"
            :close-on-click-modal="false"
        >
            <div class="import-results">
                <div
                    v-for="result in importResults"
                    :key="result.filename"
                    class="result-item"
                >
                    <div class="result-header">
                        <el-icon
                            :color="result.success ? '#67c23a' : '#f56c6c'"
                        >
                            <component
                                :is="
                                    result.success
                                        ? 'SuccessFilled'
                                        : 'CircleCloseFilled'
                                "
                            />
                        </el-icon>
                        <span class="result-filename">{{
                            result.filename
                        }}</span>
                    </div>
                    <div
                        class="result-message"
                        :class="{ error: !result.success }"
                    >
                        {{ result.success ? result.message : result.error }}
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="closeResultDialog">关闭</el-button>
                <el-button type="primary" @click="refreshAfterImport"
                    >刷新证书状态</el-button
                >
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import {
    Lock,
    Refresh,
    Download,
    SuccessFilled,
    CircleCloseFilled,
} from "@element-plus/icons-vue";

const certificates = ref([]);
const loading = ref(false);
const installing = ref(false);
const installingAll = ref(false);
const showResultDialog = ref(false);
const importResults = ref([]);

// Network detection state
const domains = ref([]);
const networkLoading = ref(false);

const hasUninstalledCerts = computed(() => {
    return certificates.value.some((cert) => !cert.isInstalled);
});

const uninstalledCount = computed(() => {
    return certificates.value.filter((cert) => !cert.isInstalled).length;
});

const loadCertificates = async () => {
    loading.value = true;
    try {
        console.log("Checking electronAPI availability:", !!window.electronAPI);
        console.log(
            "electronAPI methods:",
            window.electronAPI ? Object.keys(window.electronAPI) : "undefined"
        );

        if (window.electronAPI) {
            certificates.value = await window.electronAPI.getCertificates();
            // Reset installing state for all certificates
            certificates.value.forEach((cert) => {
                cert.installing = false;
            });
            ElMessage.success(`已加载 ${certificates.value.length} 个证书`);
        } else {
            ElMessage.warning("不支持运行在浏览器模式");
        }
    } catch (error) {
        console.error("Error loading certificates:", error);
        ElMessage.error("加载证书失败: " + error.message);
    } finally {
        loading.value = false;
    }
};

const refreshCertificateStatus = async () => {
    if (!window.electronAPI || !certificates.value.length) {
        await loadCertificates();
        return;
    }

    loading.value = true;
    try {
        console.log("Refreshing certificate trust status...");

        // Create serializable certificate objects without Vue reactivity
        const serializableCertificates = certificates.value.map((cert) => ({
            filename: cert.filename,
            content: cert.content,
            info: {
                name: cert.info.name,
                commonName: cert.info.commonName,
                subject: cert.info.subject,
                issuer: cert.info.issuer,
                validFrom: cert.info.validFrom,
                validTo: cert.info.validTo,
                serialNumber: cert.info.serialNumber,
                fingerprint: cert.info.fingerprint,
            },
            isInstalled: cert.isInstalled,
            installing: false,
        }));

        const refreshedCertificates =
            await window.electronAPI.refreshCertificateStatus(
                serializableCertificates
            );
        certificates.value = refreshedCertificates;

        const installedCount = refreshedCertificates.filter(
            (cert) => cert.isInstalled
        ).length;
        const uninstalledCount = refreshedCertificates.length - installedCount;

        ElMessage.success(
            `证书状态已刷新：${installedCount} 个已信任，${uninstalledCount} 个未信任`
        );
        console.log("Certificate status refreshed successfully");
    } catch (error) {
        console.error("Error refreshing certificate status:", error);
        ElMessage.error("刷新证书状态失败: " + error.message);
        // Fallback to full reload if refresh fails
        await loadCertificates();
    } finally {
        loading.value = false;
    }
};

const installCertificate = async (cert) => {
    try {
        // Show confirmation dialog with privilege escalation notice
        const isWindows = navigator.platform.toLowerCase().includes("win");
        const confirmMessage = isWindows
            ? `确定要导入证书 "${cert.filename}" 吗？\n\n请在弹出的UAC对话框中点击“是”以授权程序以管理员权限导入证书。`
            : `确定要导入证书 "${cert.filename}" 吗？\n\n请在弹出的权限提升对话框中授权程序以管理员权限导入证书。`;

        await ElMessageBox.confirm(confirmMessage, "确认导入证书", {
            confirmButtonText: "确定导入",
            cancelButtonText: "取消",
            type: "warning",
            showCancelButton: true,
        });

        cert.installing = true;
        const result = await window.electronAPI.installCertificate(
            cert.content
        );

        if (result.success) {
            ElMessage.success(result.message);
            cert.isInstalled = true;
        } else {
            ElMessage.error(result.error);
        }
    } catch (error) {
        if (error !== "cancel") {
            console.error("Error installing certificate:", error);
            ElMessage.error("导入证书时发生错误: " + error.message);
        }
    } finally {
        cert.installing = false;
    }
};

const importAllCertificates = async () => {
    const uninstalledCerts = certificates.value.filter(
        (cert) => !cert.isInstalled
    );

    if (uninstalledCerts.length === 0) {
        ElMessage.info("所有证书都已信任");
        return;
    }

    try {
        const isWindows = navigator.platform.toLowerCase().includes("win");
        const batchConfirmMessage = isWindows
            ? `确定要导入 ${uninstalledCerts.length} 个未信任的证书吗？\n\n请在弹出的UAC对话框中点击“是”以授权程序以管理员权限导入证书。`
            : `确定要导入 ${uninstalledCerts.length} 个未信任的证书吗？\n\n请在弹出的权限提升对话框中授权程序以管理员权限导入证书。`;

        await ElMessageBox.confirm(batchConfirmMessage, "确认批量导入", {
            confirmButtonText: "确定导入",
            cancelButtonText: "取消",
            type: "warning",
        });

        installingAll.value = true;
        const results =
            await window.electronAPI.installAllCertificates(uninstalledCerts);

        importResults.value = results;
        showResultDialog.value = true;
    } catch (error) {
        if (error !== "cancel") {
            console.error("Error installing certificates:", error);
            ElMessage.error("批量导入失败: " + error.message);
        }
    } finally {
        installingAll.value = false;
    }
};

const closeResultDialog = () => {
    showResultDialog.value = false;
    importResults.value = [];
};

const refreshAfterImport = () => {
    closeResultDialog();
    refreshCertificateStatus();
};

const loadDomains = async () => {
    try {
        if (window.electronAPI && window.electronAPI.getDomains) {
            const domainList = await window.electronAPI.getDomains();
            console.log("Loaded domains:", domainList);
            if (domainList && domainList.length > 0) {
                domains.value = domainList.map(d => ({
                    ...d,
                    status: 'unknown',
                    errorMessage: '',
                    ip: '',
                    responseTime: null
                }));
                console.log("Domains initialized:", domains.value.length);
            } else {
                console.warn("No domains found in configuration");
                ElMessage.warning("未找到域名配置，请检查 config/domains.json 文件");
            }
        } else {
            console.error("electronAPI.getDomains not available");
            ElMessage.error("域名加载功能不可用");
        }
    } catch (error) {
        console.error("Error loading domains:", error);
        ElMessage.error("加载域名配置失败: " + error.message);
    }
};

const checkNetworkStatus = async () => {
    if (!window.electronAPI || !window.electronAPI.checkDomainStatus) {
        ElMessage.warning("网络检测功能不可用");
        return;
    }

    if (domains.value.length === 0) {
        console.log("No domains to check");
        return;
    }

    networkLoading.value = true;
    try {
        // Set all domains to checking status
        domains.value.forEach(d => {
            d.status = 'checking';
            d.errorMessage = '';
            d.ip = '';
            d.responseTime = null;
            d.statusCode = null;
        });

        // Check each domain
        for (const domain of domains.value) {
            try {
                // Extract only serializable properties for IPC
                const config = {
                    id: domain.id,
                    name: domain.name,
                    type: domain.type,
                    domain: domain.domain,
                    url: domain.url
                };
                
                const result = await window.electronAPI.checkDomainStatus(config);
                domain.status = result.accessible ? 'accessible' : 'inaccessible';
                domain.errorMessage = result.errorMessage || '';
                domain.ip = result.ip || '';
                domain.responseTime = result.responseTime || null;
                domain.statusCode = result.statusCode || null;
            } catch (error) {
                domain.status = 'inaccessible';
                domain.errorMessage = error.message;
            }
        }

        const accessibleCount = domains.value.filter(d => d.status === 'accessible').length;
        ElMessage.success(`网络检测完成：${accessibleCount}/${domains.value.length} 个服务可访问`);
    } catch (error) {
        console.error("Error checking network status:", error);
        ElMessage.error("网络检测失败: " + error.message);
    } finally {
        networkLoading.value = false;
    }
};

onMounted(async () => {
    loadCertificates();
    await loadDomains();
    if (domains.value.length > 0) {
        checkNetworkStatus();
    }
});
</script>

<style>
#app {
    font-family: "Avenir", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: left;
    color: #2c3e50;
    min-height: 100vh;
}
html,
body,
.el-container {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
}
</style>

<style scoped>
.app-container,
.el-container {
    min-height: 100vh;
}

.app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-around;
}

.app-title {
    margin: 0;
    font-size: 28px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}

.app-subtitle {
    margin: 8px 0 0;
    font-size: 14px;
    opacity: 0.9;
}

.app-main {
    padding: 20px;
    background-color: #f5f7fa;
    height: calc(100vh - 40px);
}

.certificate-list,
.network-detection {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    margin-bottom: 20px;
}

.card-header {
    font-size: 16px;
    font-weight: bold;
    color: #303133;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-actions {
    display: flex;
    gap: 8px;
}

.empty-state {
    padding: 40px;
    text-align: center;
}

.certificate-item {
    margin-bottom: 20px;
}

.certificate-card {
    height: 100%;
    transition: all 0.3s ease;
}

.certificate-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.certificate-card.installed {
    border-left: 4px solid #67c23a;
}

.certificate-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.certificate-name {
    font-weight: bold;
    color: #303133;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.certificate-details {
    margin: 12px 0;
}

.detail-row {
    display: flex;
    margin-bottom: 6px;
    font-size: 13px;
}

.detail-row .label {
    color: #909399;
    width: 60px;
    flex-shrink: 0;
}

.detail-row .value {
    color: #606266;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.fingerprint {
    font-family: "Courier New", monospace;
    font-size: 11px;
}

.certificate-actions {
    display: flex;
    justify-content: center;
}

.import-results {
    max-height: 400px;
    overflow-y: auto;
}

.result-item {
    padding: 12px;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
    margin-bottom: 8px;
    background-color: #fafafa;
}

.result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.result-filename {
    font-weight: bold;
    color: #303133;
}

.result-message {
    color: #67c23a;
    font-size: 13px;
}

.result-message.error {
    color: #f56c6c;
}

.network-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.network-item {
    display: flex;
    align-items: center;
    padding: 16px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    background-color: #fafafa;
    transition: all 0.3s ease;
}

.network-item:hover {
    background-color: #f5f7fa;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.network-item-main {
    flex: 1;
    min-width: 0;
}

.network-name {
    font-weight: bold;
    font-size: 16px;
    color: #303133;
    margin-bottom: 4px;
}

.network-domain {
    font-size: 13px;
    color: #909399;
}

.network-item-details {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.network-status {
    margin-right: 8px;
}

.network-info,
.network-error {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
}

.info-label {
    color: #909399;
    font-weight: 500;
}

.info-value {
    color: #606266;
}

.error-text {
    color: #f56c6c;
}

@media (max-width: 768px) {
    .app-main {
        padding: 10px;
    }

    .header-actions {
        flex-direction: column;
        width: 100%;
    }

    .header-actions .el-button {
        width: 100%;
    }

    .network-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .network-item-details {
        width: 100%;
        justify-content: flex-start;
    }
}
</style>
