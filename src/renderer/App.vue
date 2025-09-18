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
            :icon="Refresh" 
            @click="loadCertificates"
            :loading="loading"
          >
            刷新证书列表
          </el-button>
          
          <el-button 
            type="success" 
            :icon="Download" 
            @click="importAllCertificates"
            :disabled="!hasUninstalledCerts || installing"
            :loading="installingAll"
          >
            一键导入全部 ({{ uninstalledCount }})
          </el-button>
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
                      <div class="certificate-name">{{ cert.info.name }}</div>
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
                      <span class="label">主题:</span>
                      <span class="value">{{ cert.info.subject }}</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">颁发者:</span>
                      <span class="value">{{ cert.info.issuer }}</span>
                    </div>
                  </div>

                  <template #footer>
                    <div class="certificate-actions">
                      <el-button 
                        v-if="!cert.isInstalled"
                        type="primary" 
                        size="small"
                        :loading="cert.installing"
                        @click="installCertificate(cert)"
                      >
                        导入证书
                      </el-button>
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
        <p>&copy; 2024 Certificate Import Assistant - 跨平台证书导入工具</p>
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
        if (window.electronAPI) {
          certificates.value = await window.electronAPI.getCertificates()
          // Reset installing state for all certificates
          certificates.value.forEach(cert => {
            cert.installing = false
          })
          ElMessage.success(`已加载 ${certificates.value.length} 个证书`)
        } else {
          ElMessage.error('无法访问Electron API')
        }
      } catch (error) {
        console.error('Error loading certificates:', error)
        ElMessage.error('加载证书失败: ' + error.message)
      } finally {
        loading.value = false
      }
    }

    const installCertificate = async (cert) => {
      try {
        cert.installing = true
        const result = await window.electronAPI.installCertificate(cert.content)
        
        if (result.success) {
          ElMessage.success(`证书 "${cert.filename}" 导入成功`)
          cert.isInstalled = true
        } else {
          ElMessage.error(`证书 "${cert.filename}" 导入失败: ${result.error}`)
        }
      } catch (error) {
        console.error('Error installing certificate:', error)
        ElMessage.error('导入证书时发生错误: ' + error.message)
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
        await ElMessageBox.confirm(
          `确定要导入 ${uninstalledCerts.length} 个未信任的证书吗？`,
          '确认导入',
          {
            confirmButtonText: '确定',
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
      loadCertificates()
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