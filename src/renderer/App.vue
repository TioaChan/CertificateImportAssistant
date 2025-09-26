<template>
  <div class="app-container">
    <el-container>
      <el-header class="app-header">
        <h1 class="app-title">
          <el-icon><Lock /></el-icon>
          证书导入助手
        </h1>
        <p class="app-subtitle">Certificate Import Assistant</p>
      </el-header>
      
      <el-main class="app-main">
        <div class="toolbar">
          <el-button 
            type="primary" 
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

        <el-card class="certificate-list" v-loading="loading">
          <template #header>
            <div class="card-header">
              <span>证书列表 ({{ certificates.length }})</span>
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
                <el-card class="certificate-card" :class="{ 'installed': cert.isInstalled }">
                  <template #header>
                    <div class="certificate-header">
                      <div class="certificate-name">{{ cert.info.commonName }}</div>
                      <el-tag 
                        :type="cert.isInstalled ? 'success' : 'warning'"
                        size="small"
                      >
                        {{ cert.isInstalled ? '已信任' : '未信任' }}
                      </el-tag>
                    </div>
                  </template>

                  <div class="certificate-details">
                    <div class="detail-row">
                      <span class="label">文件名:</span>
                      <span class="value">{{ cert.filename }}</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">有效期:</span>
                      <span class="value">{{ cert.info.validFrom }} ~ {{ cert.info.validTo }}</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">指纹:</span>
                      <span class="value fingerprint" :title="cert.info.fingerprint">{{ cert.info.fingerprint }}</span>
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
                          @click="installCertificate(cert)"
                        >
                          <template #icon>
                            <Lock v-if="!cert.installing" />
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
      </el-main>

      <el-footer class="app-footer">
        <div class="footer-content">
          <p>&copy; 2024 Certificate Import Assistant - 跨平台证书导入工具</p>
          <p class="privilege-notice">
            <el-icon><Lock /></el-icon>
            导入证书时将自动请求系统管理员权限
          </p>
        </div>
      </el-footer>
    </el-container>

    <!-- 导入结果对话框 -->
    <el-dialog 
      v-model="showResultDialog" 
      title="导入结果" 
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="import-results">
        <div v-for="result in importResults" :key="result.filename" class="result-item">
          <div class="result-header">
            <el-icon :color="result.success ? '#67c23a' : '#f56c6c'">
              <component :is="result.success ? 'SuccessFilled' : 'CircleCloseFilled'" />
            </el-icon>
            <span class="result-filename">{{ result.filename }}</span>
          </div>
          <div class="result-message" :class="{ 'error': !result.success }">
            {{ result.success ? result.message : result.error }}
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeResultDialog">关闭</el-button>
        <el-button type="primary" @click="refreshAfterImport">刷新证书状态</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { 
  ElMessage, 
  ElMessageBox,
  ElIcon
} from 'element-plus'
import { 
  Lock, 
  Refresh, 
  Download, 
  SuccessFilled, 
  CircleCloseFilled 
} from '@element-plus/icons-vue'

export default {
  name: 'App',
  components: {
    Lock,
    Refresh,
    Download,
    SuccessFilled,
    CircleCloseFilled
  },
  setup() {
    const certificates = ref([])
    const loading = ref(false)
    const installing = ref(false)
    const installingAll = ref(false)
    const showResultDialog = ref(false)
    const importResults = ref([])

    const hasUninstalledCerts = computed(() => {
      return certificates.value.some(cert => !cert.isInstalled)
    })

    const uninstalledCount = computed(() => {
      return certificates.value.filter(cert => !cert.isInstalled).length
    })

    const loadCertificates = async () => {
      loading.value = true
      try {
        console.log('Checking electronAPI availability:', !!window.electronAPI)
        console.log('electronAPI methods:', window.electronAPI ? Object.keys(window.electronAPI) : 'undefined')
        
        if (window.electronAPI) {
          certificates.value = await window.electronAPI.getCertificates()
          // Reset installing state for all certificates
          certificates.value.forEach(cert => {
            cert.installing = false
          })
          ElMessage.success(`已加载 ${certificates.value.length} 个证书`)
        } else {
          // Demo data for browser testing
          certificates.value = [
            {
              filename: 'zhkf-ca.cert.pem',
              content: '-----BEGIN CERTIFICATE-----\nMIIGIDCC...',
              info: {
                name: 'zhkf-ca',
                commonName: 'ZHKF-DEV-DOMAIN-CA',
                subject: 'CN=ZHKF-DEV-DOMAIN-CA, OU=ZHKF-DEV-TEAM, O=Kdgc, L=Zhengzhou, ST=Henan, C=CN',
                issuer: 'CN=ZHKF-DEV-Root-CA, OU=ZHKF-DEV-TEAM, O=Kdgc, L=Zhengzhou, ST=Henan, C=CN',
                validFrom: '2025-08-05',
                validTo: '2035-08-03',
                serialNumber: '4096',
                fingerprint: 'A1:B2:C3:D4:E5:F6:07:08:09:0A:1B:2C:3D:4E:5F:60:71:82:93:A4'
              },
              isInstalled: false,
              installing: false
            }
          ]
          ElMessage.warning('运行在浏览器模式，显示演示数据')
        }
      } catch (error) {
        console.error('Error loading certificates:', error)
        ElMessage.error('加载证书失败: ' + error.message)
      } finally {
        loading.value = false
      }
    }

    const refreshCertificateStatus = async () => {
      if (!window.electronAPI || !certificates.value.length) {
        await loadCertificates()
        return
      }

      loading.value = true
      try {
        console.log('Refreshing certificate trust status...')
        
        // Create serializable certificate objects without Vue reactivity
        const serializableCertificates = certificates.value.map(cert => ({
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
            fingerprint: cert.info.fingerprint
          },
          isInstalled: cert.isInstalled,
          installing: false
        }))
        
        const refreshedCertificates = await window.electronAPI.refreshCertificateStatus(serializableCertificates)
        certificates.value = refreshedCertificates
        
        const installedCount = refreshedCertificates.filter(cert => cert.isInstalled).length
        const uninstalledCount = refreshedCertificates.length - installedCount
        
        ElMessage.success(`证书状态已刷新：${installedCount} 个已信任，${uninstalledCount} 个未信任`)
        console.log('Certificate status refreshed successfully')
      } catch (error) {
        console.error('Error refreshing certificate status:', error)
        ElMessage.error('刷新证书状态失败: ' + error.message)
        // Fallback to full reload if refresh fails
        await loadCertificates()
      } finally {
        loading.value = false
      }
    }

    const installCertificate = async (cert) => {
      try {
        // Show confirmation dialog with privilege escalation notice
        const isWindows = navigator.platform.toLowerCase().includes('win')
        const confirmMessage = isWindows 
          ? `确定要导入证书 "${cert.filename}" 吗？\n\n导入过程将自动请求系统管理员权限。Windows平台使用原生certutil工具进行安全导入，支持自签名证书。\n\n请在弹出的UAC对话框中点击"是"以允许权限提升。`
          : `确定要导入证书 "${cert.filename}" 吗？\n\n导入过程将自动请求系统管理员权限，请在弹出的权限提升对话框中点击"是"或输入管理员密码。`
          
        await ElMessageBox.confirm(
          confirmMessage,
          '确认导入证书',
          {
            confirmButtonText: '确定导入',
            cancelButtonText: '取消',
            type: 'warning',
            showCancelButton: true
          }
        )
        
        cert.installing = true
        const result = await window.electronAPI.installCertificate(cert.content)
        
        if (result.success) {
          ElMessage.success(result.message)
          cert.isInstalled = true
        } else {
          ElMessage.error(result.error)
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Error installing certificate:', error)
          ElMessage.error('导入证书时发生错误: ' + error.message)
        }
      } finally {
        cert.installing = false
      }
    }

    const importAllCertificates = async () => {
      const uninstalledCerts = certificates.value.filter(cert => !cert.isInstalled)
      
      if (uninstalledCerts.length === 0) {
        ElMessage.info('所有证书都已信任')
        return
      }

      try {
        const isWindows = navigator.platform.toLowerCase().includes('win')
        const batchConfirmMessage = isWindows
          ? `确定要导入 ${uninstalledCerts.length} 个未信任的证书吗？\n\n导入过程将自动请求系统管理员权限。Windows平台使用原生certutil工具进行安全导入，支持自签名证书。\n\n请在弹出的UAC对话框中点击"是"以允许权限提升。`
          : `确定要导入 ${uninstalledCerts.length} 个未信任的证书吗？\n\n导入过程将自动请求系统管理员权限，请在弹出的权限提升对话框中点击"是"或输入管理员密码。`
          
        await ElMessageBox.confirm(
          batchConfirmMessage,
          '确认批量导入',
          {
            confirmButtonText: '确定导入',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        installingAll.value = true
        const results = await window.electronAPI.installAllCertificates(uninstalledCerts)
        
        importResults.value = results
        showResultDialog.value = true

      } catch (error) {
        if (error !== 'cancel') {
          console.error('Error installing certificates:', error)
          ElMessage.error('批量导入失败: ' + error.message)
        }
      } finally {
        installingAll.value = false
      }
    }

    const closeResultDialog = () => {
      showResultDialog.value = false
      importResults.value = []
    }

    const refreshAfterImport = () => {
      closeResultDialog()
      refreshCertificateStatus()
    }

    onMounted(() => {
      loadCertificates()
    })

    return {
      certificates,
      loading,
      installing,
      installingAll,
      showResultDialog,
      importResults,
      hasUninstalledCerts,
      uninstalledCount,
      loadCertificates,
      refreshCertificateStatus,
      installCertificate,
      importAllCertificates,
      closeResultDialog,
      refreshAfterImport
    }
  }
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 20px;
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
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.certificate-list {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.card-header {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
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
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.certificate-actions {
  display: flex;
  justify-content: center;
}

.app-footer {
  background-color: #f8f9fa;
  color: #6c757d;
  text-align: center;
  padding: 15px;
  border-top: 1px solid #e9ecef;
}

.footer-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.privilege-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #409eff;
  font-size: 12px;
  margin: 0;
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

@media (max-width: 768px) {
  .app-main {
    padding: 10px;
  }
  
  .toolbar {
    flex-direction: column;
  }
  
  .toolbar .el-button {
    width: 100%;
  }
}
</style>