// ============ UI 全局状态 ============
import { reactive } from 'vue'

export const uiState = reactive({
  overlay: false // 摄像头/表情管理等全屏弹窗打开时暂停计时
})
